(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MTGCollectionCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FIELD_ALIASES = {
    binderName: ['binder name', 'binder', 'location'],
    binderType: ['binder type', 'location type'],
    name: ['name', 'card name'],
    setCode: ['set code', 'edition code', 'set'],
    setName: ['set name', 'edition'],
    collectorNumber: ['collector number', 'card number', 'number'],
    foil: ['foil', 'finish', 'printing'],
    rarity: ['rarity'],
    quantity: ['quantity', 'count', 'qty'],
    manaBoxId: ['manabox id', 'mana box id'],
    scryfallId: ['scryfall id', 'scryfallid'],
    purchasePrice: ['purchase price', 'price paid', 'price'],
    condition: ['condition'],
    language: ['language', 'lang'],
    currency: ['purchase price currency', 'currency'],
    addedDate: ['added date', 'date added', 'added'],
    currentPrice: ['current price', 'market price', 'scryfall price']
  };

  function parseCSV(text) {
    const rows = [];
    let row = [], value = '', quoted = false;
    const source = String(text || '').replace(/^\uFEFF/, '');
    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      if (char === '"') {
        if (quoted && source[i + 1] === '"') { value += '"'; i++; }
        else quoted = !quoted;
      } else if (char === ',' && !quoted) {
        row.push(value); value = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && source[i + 1] === '\n') i++;
        row.push(value);
        if (row.some(cell => cell.trim())) rows.push(row);
        row = []; value = '';
      } else value += char;
    }
    if (value || row.length) { row.push(value); if (row.some(cell => cell.trim())) rows.push(row); }
    return rows;
  }

  const cleanHeader = value => String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const cleanFinish = value => {
    const finish = String(value || 'normal').toLowerCase();
    if (finish.includes('etched')) return 'etched';
    if (['true', 'yes', '1', 'foil'].includes(finish)) return 'foil';
    return 'normal';
  };
  const number = value => {
    const parsed = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };

  function buildColumnMap(headers) {
    const normalized = headers.map(cleanHeader);
    return Object.fromEntries(Object.entries(FIELD_ALIASES).map(([key, aliases]) =>
      [key, normalized.findIndex(header => aliases.includes(header))]));
  }

  function parseManaBoxCSV(text, options = {}) {
    const rows = parseCSV(text);
    if (!rows.length) return { cards: [], errors: ['The CSV is empty.'], warnings: [], headers: [] };
    const headers = rows[0].map(value => value.trim());
    const col = buildColumnMap(headers);
    const errors = [];
    const warnings = [];
    if (col.name < 0) errors.push('Missing required Name column.');
    if (col.quantity < 0) warnings.push('Quantity column missing; each row defaults to one copy.');
    if (col.scryfallId < 0) warnings.push('Scryfall ID column missing; images and live metadata may be unavailable.');
    if (errors.length) return { cards: [], errors, warnings, headers };

    const get = (row, key) => col[key] >= 0 ? String(row[col[key]] || '').trim() : '';
    const byVersion = new Map();
    let duplicateRows = 0;
    rows.slice(1).forEach((row, rowIndex) => {
      const name = get(row, 'name');
      if (!name) { warnings.push(`Row ${rowIndex + 2} has no card name and was skipped.`); return; }
      const finish = cleanFinish(get(row, 'foil'));
      const quantity = Math.max(1, Math.trunc(number(get(row, 'quantity')) || 1));
      const purchasePrice = number(get(row, 'purchasePrice'));
      const card = {
        binderName: get(row, 'binderName'), binderType: get(row, 'binderType'),
        name, setCode: get(row, 'setCode').toUpperCase(), setName: get(row, 'setName'),
        collectorNumber: get(row, 'collectorNumber'), foil: finish,
        rarity: get(row, 'rarity').toLowerCase() || 'unknown', quantity,
        manaBoxId: get(row, 'manaBoxId'), scryfallId: get(row, 'scryfallId'),
        purchasePrice, price: purchasePrice, condition: get(row, 'condition'),
        language: get(row, 'language') || 'en', currency: get(row, 'currency') || options.defaultCurrency || 'AUD',
        addedDate: get(row, 'addedDate'), currentPrice: number(get(row, 'currentPrice')),
        sourceRows: [rowIndex + 2]
      };
      const identity = [card.scryfallId || card.manaBoxId || card.name.toLowerCase(), card.setCode, card.collectorNumber, finish,
        card.condition.toLowerCase(), card.language.toLowerCase(), card.binderName.toLowerCase(), card.currency].join('|');
      if (byVersion.has(identity)) {
        const existing = byVersion.get(identity);
        const totalQuantity = existing.quantity + quantity;
        existing.purchasePrice = ((existing.purchasePrice * existing.quantity) + (purchasePrice * quantity)) / totalQuantity;
        existing.price = existing.purchasePrice;
        existing.quantity = totalQuantity;
        existing.sourceRows.push(rowIndex + 2);
        duplicateRows++;
      } else byVersion.set(identity, card);
    });
    if (duplicateRows) warnings.push(`${duplicateRows} duplicate row${duplicateRows === 1 ? '' : 's'} merged by printing, finish, condition, language and binder.`);
    const cards = [...byVersion.values()];
    const missingIds = cards.filter(card => !card.scryfallId).length;
    if (missingIds) warnings.push(`${missingIds} card version${missingIds === 1 ? '' : 's'} missing a Scryfall ID.`);
    return { cards, errors, warnings, headers, duplicateRows };
  }

  function marketPrice(card) {
    if (Number.isFinite(card.currentPrice) && card.currentPrice > 0) return card.currentPrice;
    const prices = card.scryfallPrices || {};
    const raw = card.foil === 'etched' ? prices.usd_etched : card.foil === 'foil' ? prices.usd_foil : prices.usd;
    return number(raw);
  }

  function convertUsdToAud(usd, rate) {
    const amount = number(usd);
    const multiplier = number(rate);
    return multiplier > 0 ? amount * multiplier : 0;
  }

  function calculateTotals(cards) {
    const list = cards || [];
    const quantity = list.reduce((sum, card) => sum + card.quantity, 0);
    const purchaseCost = list.reduce((sum, card) => sum + number(card.purchasePrice) * card.quantity, 0);
    const estimatedValue = list.reduce((sum, card) => sum + marketPrice(card) * card.quantity, 0);
    const marketPricedQuantity = list.reduce((sum, card) => sum + (marketPrice(card) > 0 ? card.quantity : 0), 0);
    return {
      uniqueCards: new Set(list.map(card => (card.oracle_id || card.name).toLowerCase())).size,
      uniqueVersions: list.length, quantity, purchaseCost, estimatedValue,
      marketPricedQuantity, gainLoss: marketPricedQuantity ? estimatedValue - purchaseCost : null,
      foils: list.filter(card => card.foil !== 'normal').reduce((sum, card) => sum + card.quantity, 0),
      sets: new Set(list.map(card => card.setCode).filter(Boolean)).size,
      binders: new Set(list.map(card => card.binderName).filter(Boolean)).size
    };
  }

  function parseDeckList(text) {
    const cards = [];
    String(text || '').split(/\r?\n/).forEach(raw => {
      const line = raw.trim();
      if (!line || /^(\/\/|#|\[)/.test(line) || /^(commander|deck|sideboard|maybeboard)$/i.test(line)) return;
      const match = line.match(/^(\d+)\s*x?\s+(.+?)(?:\s+\(([A-Z0-9]+)\)\s+([^\s]+))?(?:\s+\*[Ff]?\*)?$/);
      if (!match) return;
      let name = match[2].trim().replace(/\s+\/\s+/g, ' // ');
      cards.push({ quantity: Number(match[1]), name, normalizedName: name.toLowerCase(), setCode: match[3] || '', collectorNumber: match[4] || '' });
    });
    return cards;
  }

  function matchDeckList(deck, collection) {
    const results = deck.map(wanted => {
      const versions = collection.filter(card => card.name.toLowerCase() === wanted.normalizedName || card.oracleName?.toLowerCase() === wanted.normalizedName);
      const exact = versions.filter(card => !wanted.setCode || (card.setCode === wanted.setCode && (!wanted.collectorNumber || card.collectorNumber === wanted.collectorNumber)));
      const owned = exact.reduce((sum, card) => sum + card.quantity, 0);
      const allOwned = versions.reduce((sum, card) => sum + card.quantity, 0);
      return { ...wanted, versions, exactVersions: exact, owned: Math.min(owned, wanted.quantity),
        alternativeOwned: Math.max(0, Math.min(allOwned - owned, wanted.quantity - owned)),
        missing: Math.max(0, wanted.quantity - allOwned) };
    });
    return { results, required: results.reduce((s, r) => s + r.quantity, 0), missing: results.reduce((s, r) => s + r.missing, 0) };
  }

  const normalize = value => String(value || '').trim().toLowerCase();
  const slug = value => normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const SCRYFALL_CACHE_KEY = 'mtg-scryfall-cache-v1';
  const SCRYFALL_CACHE_TTL = 60 * 60 * 1000;

  function compactScryfallCard(card = {}) {
    const face = item => ({
      name: item.name, image_uris: item.image_uris, oracle_text: item.oracle_text,
      type_line: item.type_line, colors: item.colors, artist: item.artist
    });
    return {
      id: card.id, name: card.name, flavor_name: card.flavor_name,
      type_line: card.type_line, oracle_text: card.oracle_text,
      colors: card.colors, color_identity: card.color_identity, keywords: card.keywords,
      legalities: card.legalities, image_uris: card.image_uris, prices: card.prices,
      set: card.set, set_name: card.set_name, collector_number: card.collector_number,
      rarity: card.rarity, artist: card.artist, scryfall_uri: card.scryfall_uri,
      card_faces: Array.isArray(card.card_faces) ? card.card_faces.map(face) : undefined
    };
  }

  function readCachedScryfall(ids = [], storage, now = Date.now()) {
    try {
      const target = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
      if (!target) return {};
      const payload = JSON.parse(target.getItem(SCRYFALL_CACHE_KEY) || 'null');
      if (!payload || now - Number(payload.savedAt) >= SCRYFALL_CACHE_TTL) {
        target.removeItem(SCRYFALL_CACHE_KEY);
        return {};
      }
      const wanted = new Set(ids);
      return Object.fromEntries(Object.entries(payload.cards || {}).filter(([id]) => !wanted.size || wanted.has(id)));
    } catch (_) { return {}; }
  }

  function cacheScryfallCards(cards = [], storage, now = Date.now()) {
    try {
      const target = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
      if (!target) return false;
      const existing = readCachedScryfall([], target, now);
      cards.filter(card => card?.id).forEach(card => { existing[card.id] = compactScryfallCard(card); });
      target.setItem(SCRYFALL_CACHE_KEY, JSON.stringify({ savedAt: now, cards: existing }));
      return true;
    } catch (_) { return false; }
  }

  function makeCollectionItemId(card, ownerId) {
    return [
      ownerId || card.ownerId, card.scryfallId || normalize(card.name), card.setCode,
      card.collectorNumber, card.foil, card.condition, card.language, card.binderName
    ].map(slug).join('|');
  }

  function applyOwnerMetadata(cards, owner) {
    return (cards || []).map(card => ({
      ...card,
      ownerId: owner.id,
      ownerName: owner.name,
      ownerShortName: owner.shortName || owner.name,
      ownerBadgeClass: owner.badgeClass || `owner-${owner.id}`,
      collectionItemId: makeCollectionItemId(card, owner.id)
    }));
  }

  function groupCardsByName(cards) {
    const groups = new Map();
    (cards || []).forEach(card => {
      const key = normalize(card.oracleName || card.name);
      if (!groups.has(key)) groups.set(key, {
        key, name: card.oracleName || card.name, representative: card, records: [],
        quantity: 0, foilCount: 0, owners: new Map(), printings: new Set()
      });
      const group = groups.get(key);
      group.records.push(card);
      group.quantity += card.quantity;
      if (card.foil !== 'normal') group.foilCount += card.quantity;
      group.owners.set(card.ownerId, (group.owners.get(card.ownerId) || 0) + card.quantity);
      group.printings.add([card.setCode, card.collectorNumber, card.foil].join('|'));
    });
    return [...groups.values()].map(group => ({
      ...group,
      ownerCount: group.owners.size,
      printingCount: group.printings.size,
      owners: Object.fromEntries(group.owners)
    }));
  }

  function groupIdenticalCopies(cards) {
    const groups = new Map();
    (cards || []).forEach(card => {
      const key = [
        card.scryfallId || normalize(card.oracleName || card.name),
        normalize(card.setCode), normalize(card.collectorNumber),
        normalize(card.foil), normalize(card.language), normalize(card.condition)
      ].join('|');
      if (!groups.has(key)) groups.set(key, {
        key,
        name: card.displayName || card.flavorName || card.name,
        representative: card, records: [], quantity: 0, foilCount: 0,
        owners: new Map(), printings: new Set()
      });
      const group = groups.get(key);
      group.records.push(card);
      group.quantity += card.quantity;
      if (card.foil !== 'normal') group.foilCount += card.quantity;
      group.owners.set(card.ownerId, (group.owners.get(card.ownerId) || 0) + card.quantity);
      group.printings.add([card.setCode, card.collectorNumber, card.foil].join('|'));
    });
    return [...groups.values()].map(group => ({
      ...group,
      ownerCount: group.owners.size,
      printingCount: group.printings.size,
      owners: Object.fromEntries(group.owners)
    }));
  }

  function isLikelyTradeBinder(card, terms = []) {
    const binder = normalize(card.binderName);
    return !!binder && terms.some(term => binder.includes(normalize(term)));
  }

  function cardSearchText(card) {
    return [
      card.name, card.displayName, card.flavorName, card.oracleName,
      card.setName, card.setCode, card.collectorNumber, card.type_line,
      card.oracle_text, card.binderName, card.ownerName, card.ownerShortName
    ].map(normalize).join(' ');
  }

  function filterCards(cards, filters = {}, options = {}) {
    const ownerIds = new Set(filters.ownerIds || []);
    const binders = new Set(filters.binders || []);
    const search = normalize(filters.search);
    const setSearch = normalize(filters.set);
    const minQuantity = Math.max(1, Number(filters.minQuantity) || 1);
    const totalOwners = options.totalOwners || 0;
    const groupTotals = options.groupTotals || new Map();
    return (cards || []).filter(card => {
      const group = groupTotals.get(normalize(card.oracleName || card.name));
      const colors = card.color_identity || card.colors || card.card_faces?.[0]?.colors || [];
      const typeLine = card.type_line || '';
      if (search && !cardSearchText(card).includes(search)) return false;
      if (ownerIds.size && !ownerIds.has(card.ownerId)) return false;
      if (filters.rarity && card.rarity !== filters.rarity) return false;
      if (filters.finish && card.foil !== filters.finish) return false;
      if (filters.condition && normalize(card.condition) !== normalize(filters.condition)) return false;
      if (binders.size && !binders.has(card.binderName)) return false;
      if (setSearch && !normalize(`${card.setName} ${card.setCode}`).includes(setSearch)) return false;
      if (filters.type && !typeLine.toLowerCase().includes(filters.type.toLowerCase())) return false;
      const creatureTypes = normalize(typeLine.split('—').slice(1).join(' '));
      if (filters.creatureType && !creatureTypes.includes(normalize(filters.creatureType))) return false;
      if (!matchesColorIdentity(colors, filters.colors || (filters.color ? [filters.color] : []), filters.colorMatch)) return false;
      if (card.quantity < minQuantity) return false;
      if (filters.duplicates && (group?.quantity || card.quantity) <= 1) return false;
      if (filters.ownerCount && (group?.ownerCount || 1) < Number(filters.ownerCount)) return false;
      if (filters.ownedByEveryone && (group?.ownerCount || 1) < totalOwners) return false;
      if (filters.legendary && !/\bLegendary\b/i.test(typeLine)) return false;
      if (filters.commander && !(/\bLegendary\b.*\bCreature\b/i.test(typeLine) || /can be your commander/i.test(card.oracle_text || ''))) return false;
      if (filters.token === 'tokens' && !/\bToken\b/i.test(typeLine)) return false;
      if (filters.token === 'nontokens' && /\bToken\b/i.test(typeLine)) return false;
      if (filters.tradeOnly && !isLikelyTradeBinder(card, options.tradeBinderTerms || [])) return false;
      return true;
    });
  }

  function matchesColorIdentity(identity = [], selected = [], mode = 'contains') {
    const actual = new Set((identity || []).map(value => String(value).toUpperCase()));
    const wanted = new Set((selected || []).map(value => String(value).toUpperCase()).filter(Boolean));
    if (!wanted.size) return true;
    if (wanted.has('C')) {
      if (wanted.size > 1) return false;
      return actual.size === 0;
    }
    if (mode === 'exact' && actual.size !== wanted.size) return false;
    return [...wanted].every(color => actual.has(color));
  }

  function encodeColorFilter(colors = [], mode = 'contains') {
    const selected = [...new Set(colors)].filter(color => ['W', 'U', 'B', 'R', 'G', 'C'].includes(color));
    return selected.length ? { colors: selected.join(','), match: mode === 'exact' ? 'exact' : 'contains' } : {};
  }

  function decodeColorFilter(params) {
    const values = params?.getAll ? params.getAll('colors') : [];
    const colors = [...new Set(values.flatMap(value => String(value).split(',')))]
      .filter(color => ['W', 'U', 'B', 'R', 'G', 'C'].includes(color));
    return { colors, match: params?.get?.('match') === 'exact' ? 'exact' : 'contains' };
  }

  function addBasketItem(items, record, requested = 1, note = '') {
    const list = Array.isArray(items) ? items.map(item => ({ ...item })) : [];
    const quantity = Math.max(1, Math.min(Number(requested) || 1, record.quantity));
    const existing = list.find(item => item.collectionItemId === record.collectionItemId);
    if (existing) {
      existing.quantityRequested = Math.min(existing.quantityOwned, existing.quantityRequested + quantity);
      if (note) existing.note = note;
      return list;
    }
    list.push({
      collectionItemId: record.collectionItemId, ownerId: record.ownerId, ownerName: record.ownerName,
      cardName: record.name, setCode: record.setCode, collectorNumber: record.collectorNumber,
      finish: record.foil, condition: record.condition, binder: record.binderName,
      quantityOwned: record.quantity, quantityRequested: quantity,
      imageUri: record.imageUri || '', marketPrice: marketPrice(record), note
    });
    return list;
  }

  function removeBasketItem(items, collectionItemId) {
    return (items || []).filter(item => item.collectionItemId !== collectionItemId);
  }

  function groupBasketByOwner(items) {
    return (items || []).reduce((groups, item) => {
      (groups[item.ownerId] ||= { ownerId: item.ownerId, ownerName: item.ownerName, items: [] }).items.push(item);
      return groups;
    }, {});
  }

  async function loadCollections(owners, fetchText) {
    const successes = [], failures = [];
    await Promise.all((owners || []).map(async owner => {
      try {
        const text = await fetchText(owner);
        const parsed = parseManaBoxCSV(text);
        if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
        successes.push({ owner, cards: applyOwnerMetadata(parsed.cards, owner), warnings: parsed.warnings });
      } catch (error) {
        failures.push({ owner, error: error.message || 'Collection not yet uploaded' });
      }
    }));
    return { cards: successes.flatMap(result => result.cards), successes, failures };
  }

  return {
    FIELD_ALIASES, parseCSV, buildColumnMap, parseManaBoxCSV, calculateTotals, parseDeckList,
    matchDeckList, marketPrice, convertUsdToAud, cleanFinish, makeCollectionItemId, applyOwnerMetadata,
    groupCardsByName, groupIdenticalCopies, filterCards, matchesColorIdentity, encodeColorFilter, decodeColorFilter,
    isLikelyTradeBinder, addBasketItem, removeBasketItem,
    groupBasketByOwner, cardSearchText, loadCollections, compactScryfallCard,
    readCachedScryfall, cacheScryfallCards, SCRYFALL_CACHE_TTL
  };
});
