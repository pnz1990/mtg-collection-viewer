(function () {
  const Core = window.MTGCollectionCore;
  const Export = window.MTGCollectionExport;
  const Explore = window.MTGExploreLinks;
  const state = {
    owners: [], cards: [], visible: [], groups: [], failures: [], metadata: new Map(),
    mode: localStorage.getItem('mtg-group-view') || 'grid',
    grouping: localStorage.getItem('mtg-grouping-v2') || 'identical',
    pageSize: 120, shown: 120, config: { tradeBinderTerms: [] },
    usdToAudRate: Number(localStorage.getItem('mtg-usd-aud-rate')) || 1.5346,
    rateDate: localStorage.getItem('mtg-usd-aud-date') || 'fallback'
  };
  const basketKey = 'mtg-trade-basket-v1';
  const exportScopeKey = 'mtg-export-scope-v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const params = new URLSearchParams(location.search);
  const currentOwner = document.body.dataset.ownerPage ? params.get('owner') || 'monty' : '';

  function readBasket() {
    try { return JSON.parse(localStorage.getItem(basketKey) || '[]'); } catch (_) { return []; }
  }
  function updateBasketCount() {
    const count = readBasket().reduce((sum, item) => sum + item.quantityRequested, 0);
    document.querySelectorAll('[data-basket-count]').forEach(el => el.textContent = count);
  }
  function imageUrl(card) {
    return card.imageUri || (card.scryfallId ? `https://api.scryfall.com/cards/${encodeURIComponent(card.scryfallId)}?format=image&version=normal` : 'images/back.png');
  }
  async function fetchJson(url, fallback = null) {
    try { const response = await fetch(url); return response.ok ? response.json() : fallback; } catch (_) { return fallback; }
  }
  async function loadExchangeRate() {
    const fallback = Number(state.config.fallbackUsdToAudRate) || state.usdToAudRate || 1.5346;
    state.usdToAudRate = fallback;
    try {
      const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/AUD');
      if (!response.ok) throw new Error(`Rate service returned ${response.status}`);
      const data = await response.json();
      const rate = Number(data.rate);
      if (!Number.isFinite(rate) || rate <= 0) throw new Error('Invalid exchange rate');
      state.usdToAudRate = rate;
      state.rateDate = data.date || new Date().toISOString().slice(0, 10);
      localStorage.setItem('mtg-usd-aud-rate', String(rate));
      localStorage.setItem('mtg-usd-aud-date', state.rateDate);
    } catch (_) {
      state.rateDate = localStorage.getItem('mtg-usd-aud-date') || 'fallback';
    }
  }
  function marketAud(card) {
    return Core.convertUsdToAud(Core.marketPrice(card), state.usdToAudRate);
  }
  async function loadLibraries() {
    const owners = await fetchJson('data/collections/index.json', []);
    state.config = await fetchJson('data/config.json', state.config);
    loadExchangeRate().then(() => {
      if (state.cards.length) { applyFilters(); renderStats(); }
    });
    state.owners = owners;
    const selected = currentOwner ? owners.filter(owner => owner.id === currentOwner) : owners;
    const results = await Promise.all(selected.map(async owner => {
      try {
        // Collection CSVs are replaced in-place, so bypass the browser cache to
        // ensure an ordinary refresh always shows the latest uploaded export.
        const response = await fetch(owner.file, { cache: 'no-store' });
        if (!response.ok) throw new Error(response.status === 404 ? 'Collection not yet uploaded' : `Could not load (${response.status})`);
        const parsed = Core.parseManaBoxCSV(await response.text());
        if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
        return { owner, cards: Core.applyOwnerMetadata(parsed.cards, owner), warnings: parsed.warnings };
      } catch (error) { return { owner, error: error.message || 'Could not load collection' }; }
    }));
    state.cards = results.flatMap(result => result.cards || []);
    state.failures = results.filter(result => result.error);
    if (currentOwner) {
      const owner = selected[0];
      if (owner) {
        document.querySelector('.page-hero h1').textContent = owner.name;
        document.title = `${owner.name} — Arcane Archive`;
      }
    }
    renderNavigation();
    populateFilters();
    restoreFilters();
    $('sort').value = 'market-desc';
    applyFilters();
    renderStats();
    enrichMetadata();
  }
  function renderNavigation() {
    const nav = $('site-nav');
    if (!nav) return;
    nav.innerHTML = `<a class="brand" href="index.html">Arcane Archive</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links">Libraries</button>
      <div id="nav-links" class="nav-links">
        ${state.owners.map(owner => `<a class="${currentOwner === owner.id ? 'active' : ''}" href="library.html?owner=${owner.id}">${esc(owner.name)}</a>`).join('')}
        <a class="${document.body.dataset.allCollections ? 'active' : ''}" href="all-collections.html">All Collections</a>
        <a href="pack-pullers.html">Pack Pullers</a>
        <a class="basket-link" href="trade-basket.html">Trade Basket (<span data-basket-count>0</span>)</a>
        <details><summary>Archived Tools</summary><a href="deck-checker.html">Deck Checker</a><a href="decks.html">Commander Decks</a><a href="trivia.html">Trivia</a><a href="game-tracker.html">Game Tracker</a></details>
      </div>`;
    nav.querySelector('.nav-toggle').addEventListener('click', event => {
      const open = nav.classList.toggle('open'); event.currentTarget.setAttribute('aria-expanded', open);
    });
    if (!$('market-loader')) {
      document.body.insertAdjacentHTML('beforeend', `<aside id="market-loader" class="market-loader" hidden aria-live="polite">
        <div><span id="market-loader-label">Loading market prices…</span><strong id="market-loader-percent">0%</strong></div>
        <progress id="market-loader-progress" max="100" value="0">0%</progress>
      </aside>`);
    }
    updateBasketCount();
  }
  function setMarketProgress(done, total, stateName = 'loading') {
    const loader = $('market-loader');
    if (!loader) return;
    const percent = total ? Math.min(100, Math.round(done / total * 100)) : 0;
    loader.hidden = false;
    loader.dataset.state = stateName;
    $('market-loader-label').textContent = stateName === 'error' ? 'Some market prices could not load' :
      stateName === 'complete' ? 'Market values ready' : `Loading Scryfall prices · ${done.toLocaleString()} / ${total.toLocaleString()}`;
    $('market-loader-percent').textContent = `${percent}%`;
    $('market-loader-progress').value = percent;
    $('market-loader-progress').textContent = `${percent}%`;
    if (stateName === 'complete') setTimeout(() => { loader.hidden = true; }, 1600);
  }
  function populateFilters() {
    const optionize = values => [...new Set(values.filter(Boolean))].sort().map(value => `<option value="${esc(value)}">${esc(value.replaceAll('_', ' '))}</option>`).join('');
    $('grouping').value = state.grouping;
    $('binder-filter').multiple = true;
    $('binder-filter').size = 5;
    $('binder-filter').replaceChildren();
    $('owner-filters').innerHTML = currentOwner ? '' : state.owners.map(owner =>
      `<label><input type="checkbox" name="owner" value="${owner.id}"> <span class="owner-badge ${owner.badgeClass}">${esc(owner.shortName)}</span></label>`).join('');
    $('condition-filter').insertAdjacentHTML('beforeend', optionize(state.cards.map(card => card.condition)));
    $('binder-filter').insertAdjacentHTML('beforeend', optionize(state.cards.map(card => card.binderName)));
    $('set-filter').insertAdjacentHTML('beforeend', optionize(state.cards.map(card => `${card.setCode} — ${card.setName}`)));
    const availableOwnerCount = state.owners.filter(owner => !state.failures.some(failure => failure.owner.id === owner.id)).length;
    const everyoneOption = $('owner-count-filter')?.querySelector('option[value="7"]');
    if (everyoneOption) {
      everyoneOption.value = 'everyone';
      everyoneOption.textContent = `Everyone (${availableOwnerCount})`;
      everyoneOption.disabled = availableOwnerCount < 2;
    }
    if (currentOwner) $('owner-filter-group').hidden = true;
  }
  function filterState() {
    return {
      search: $('search').value, ownerIds: [...document.querySelectorAll('[name="owner"]:checked')].map(el => el.value),
      colors: [...document.querySelectorAll('[name="color"]:checked')].map(el => el.value),
      colorMatch: document.querySelector('[name="color-match"]:checked')?.value || 'contains',
      type: $('type-filter').value, creatureType: $('creature-type-filter').value, rarity: $('rarity-filter').value,
      finish: $('finish-filter').value, condition: $('condition-filter').value,
      binders: [...$('binder-filter').selectedOptions].map(option => option.value),
      set: $('set-filter').value.split(' — ')[0], minQuantity: $('quantity-filter').value,
      ownerCount: $('owner-count-filter')?.value === 'everyone' ? '' : ($('owner-count-filter')?.value || ''),
      ownedByEveryone: $('owner-count-filter')?.value === 'everyone', duplicates: $('duplicates-filter').checked,
      legendary: $('legendary-filter').checked, commander: $('commander-filter').checked,
      token: $('token-filter').value, tradeOnly: $('trade-filter').checked
    };
  }
  function saveFilters(filters) {
    const query = new URLSearchParams(currentOwner ? { owner: currentOwner } : {});
    Object.entries(filters).forEach(([key, value]) => {
      if (key === 'colors' && value.length) query.set('colors', Core.encodeColorFilter(value, filters.colorMatch).colors);
      else if (key === 'colorMatch') {
        if (filters.colors.length) query.set('match', value);
      }
      else if (Array.isArray(value)) value.forEach(item => query.append(key, item));
      else if (value && value !== '1') query.set(key, value === true ? '1' : value);
    });
    history.replaceState(null, '', `${location.pathname.split('/').pop()}${query.size ? `?${query}` : ''}`);
  }
  function restoreFilters() {
    const set = (id, key = id) => { const value = params.get(key); if (value != null && $(id)) $(id).value = value; };
    set('search', 'search'); set('type-filter', 'type'); set('creature-type-filter', 'creatureType'); set('rarity-filter', 'rarity');
    const restoredColourFilter = Core.decodeColorFilter(params);
    const restoredColors = restoredColourFilter.colors;
    restoredColors.forEach(color => {
      const control = document.querySelector(`[name="color"][value="${CSS.escape(color)}"]`);
      if (control) control.checked = true;
    });
    const restoredMatch = restoredColourFilter.match;
    const matchControl = document.querySelector(`[name="color-match"][value="${restoredMatch}"]`);
    if (matchControl) matchControl.checked = true;
    set('finish-filter', 'finish'); set('condition-filter', 'condition'); set('quantity-filter', 'minQuantity');
    params.getAll('binders').forEach(value => {
      const option = [...$('binder-filter').options].find(item => item.value === value);
      if (option) option.selected = true;
    });
    set('set-filter', 'set');
    if (params.get('ownedByEveryone') === '1') $('owner-count-filter').value = 'everyone';
    else set('owner-count-filter', 'ownerCount');
    [...params.getAll('ownerIds')].forEach(id => document.querySelector(`[name="owner"][value="${CSS.escape(id)}"]`)?.setAttribute('checked', ''));
    ['duplicates','legendary','commander','tradeOnly'].forEach(key => {
      const map = {duplicates:'duplicates-filter',legendary:'legendary-filter',commander:'commander-filter',tradeOnly:'trade-filter'};
      if (params.get(key) === '1') $(map[key]).checked = true;
    });
  }
  function sortRecords(records) {
    const value = $('sort').value;
    const title = card => card.displayName || card.flavorName || card.name;
    const rarity = { mythic: 5, rare: 4, special: 3, uncommon: 2, common: 1 };
    return [...records].sort((a, b) => {
      if (value === 'name-desc') return title(b).localeCompare(title(a));
      if (value === 'newest') return String(b.addedDate).localeCompare(String(a.addedDate));
      if (value === 'oldest') return String(a.addedDate).localeCompare(String(b.addedDate));
      if (value === 'quantity-desc') return b.quantity - a.quantity;
      if (value === 'quantity-asc') return a.quantity - b.quantity;
      if (value === 'market-desc') return marketAud(b) - marketAud(a);
      if (value === 'market-asc') return marketAud(a) - marketAud(b);
      if (value === 'set') return a.setName.localeCompare(b.setName);
      if (value === 'rarity') return (rarity[b.rarity] || 0) - (rarity[a.rarity] || 0);
      return title(a).localeCompare(title(b));
    });
  }
  function applyFilters() {
    const totals = new Map(Core.groupCardsByName(state.cards).map(group => [group.key, group]));
    const filters = filterState();
    state.visible = sortRecords(Core.filterCards(state.cards, filters, {
      groupTotals: totals, totalOwners: state.owners.filter(owner => !state.failures.some(f => f.owner.id === owner.id)).length,
      tradeBinderTerms: state.config.tradeBinderTerms || []
    }));
    state.groups = state.grouping === 'identical'
      ? Core.groupIdenticalCopies(state.visible)
      : Core.groupCardsByName(state.visible);
    if ($('sort').value === 'owners-desc') state.groups.sort((a,b)=>b.ownerCount-a.ownerCount);
    if ($('sort').value === 'group-quantity') state.groups.sort((a,b)=>b.quantity-a.quantity);
    state.shown = state.pageSize;
    saveFilters(filters);
    $('colour-filter-count').textContent = filters.colors.length ? `(${filters.colors.length})` : '';
    renderChips(filters);
    renderResults();
  }
  function renderChips(filters) {
    const chips = [];
    if (filters.search) chips.push(['Search', filters.search, 'search']);
    filters.ownerIds.forEach(id => chips.push(['Owner', state.owners.find(o=>o.id===id)?.shortName || id, 'ownerIds']));
    filters.binders.forEach(binder => chips.push(['Binder', binder, 'binders']));
    const colorNames = { W:'White', U:'Blue', B:'Black', R:'Red', G:'Green', C:'Colourless' };
    filters.colors.forEach(color => chips.push(['', colorNames[color] || color, 'colors']));
    [['type','Type'],['rarity','Rarity'],['finish','Finish'],['condition','Condition'],['set','Set']].forEach(([key,label]) => filters[key] && chips.push([label, filters[key], key]));
    if (filters.creatureType) chips.push(['Creature type', filters.creatureType, 'creatureType']);
    if (filters.minQuantity > 1) chips.push(['Quantity', `${filters.minQuantity}+`, 'minQuantity']);
    if (filters.duplicates) chips.push(['', 'Duplicates', 'duplicates']);
    if (filters.ownedByEveryone) chips.push(['', 'Owned by everyone', 'ownedByEveryone']);
    if (filters.tradeOnly) chips.push(['', 'Likely trade binder', 'tradeOnly']);
    $('active-filters').innerHTML = chips.map(([label,value,key]) =>
      `<button type="button" data-remove-filter="${key}" data-remove-value="${esc(value)}" aria-label="Remove ${esc(label)} ${esc(value)}">${label ? `${esc(label)}: ` : ''}${esc(value)} ×</button>`).join('');
  }
  function ownerBadges(group) {
    return Object.entries(group.owners).map(([id, qty]) => {
      const owner = state.owners.find(item => item.id === id);
      return `<a class="owner-badge ${owner?.badgeClass || ''}" href="library.html?owner=${id}&search=${encodeURIComponent(group.name)}">${esc(owner?.shortName || id)} ×${qty}</a>`;
    }).join('');
  }
  function renderStats() {
    const target = $('library-stats');
    if (!target) return;
    const physical = state.cards.reduce((sum, card) => sum + card.quantity, 0);
    const groups = Core.groupCardsByName(state.cards);
    const priced = state.cards.reduce((sum, card) => sum + (Core.marketPrice(card) > 0 ? card.quantity : 0), 0);
    const value = state.cards.reduce((sum, card) => sum + marketAud(card) * card.quantity, 0);
    const sets = new Set(state.cards.map(card => card.setCode).filter(Boolean)).size;
    const binders = new Set(state.cards.map(card => card.binderName).filter(Boolean)).size;
    const money = `A$${new Intl.NumberFormat('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
    const metrics = [
      ['Physical cards', physical.toLocaleString()],
      ['Unique cards', groups.length.toLocaleString()],
      ['Current value', money],
      ['Priced copies', `${priced.toLocaleString()} / ${physical.toLocaleString()}`],
      ['Sets', sets.toLocaleString()],
      ['Binders', binders.toLocaleString()]
    ];
    target.innerHTML = metrics.map(([label, metric]) => `<div><span>${label}</span><strong>${metric}</strong></div>`).join('') +
      `<small>Scryfall USD × ${state.usdToAudRate.toFixed(4)} = AUD · rate ${esc(state.rateDate)}</small>`;
  }
  function addButtons(records) {
    return records.map(card => `<button type="button" class="trade-add" data-add="${esc(card.collectionItemId)}">Ask ${esc(card.ownerShortName)} about this copy</button>`).join('');
  }
  function legacyGroupCard(group) {
    const card = group.representative;
    return `<article class="group-card">
      <a class="card-visual" href="detail.html?id=${encodeURIComponent(card.scryfallId || '')}&name=${encodeURIComponent(card.name)}"><img loading="lazy" src="${esc(imageUrl(card))}" alt="${esc(card.name)}"></a>
      <div class="group-card-body"><h2>${esc(group.name)}</h2>
      <div class="owner-badges">${ownerBadges(group)}</div>
      <p class="group-summary">Group total: ${group.quantity} · ${group.ownerCount} owner${group.ownerCount === 1 ? '' : 's'} · ${group.printingCount} printing${group.printingCount === 1 ? '' : 's'}${group.foilCount ? ` · ${group.foilCount} foil` : ''}</p>
      <details><summary>Request a specific copy</summary>${addButtons(group.records)}</details></div></article>`;
  }
  function legacyPrintingCard(card) {
    const owner = state.owners.find(item => item.id === card.ownerId);
    const trade = Core.isLikelyTradeBinder(card, state.config.tradeBinderTerms || []);
    return `<article class="printing-card"><img loading="lazy" src="${esc(imageUrl(card))}" alt="${esc(card.name)}">
      <div><h2>${esc(card.name)}</h2><span class="owner-badge ${owner?.badgeClass || ''}">${esc(card.ownerShortName)} ×${card.quantity}</span>
      <p>${esc(card.setCode)} #${esc(card.collectorNumber)} · ${esc(card.foil)} · ${esc(card.condition || 'condition unknown')}</p>
      <p>${esc(card.binderName || 'No binder')}${trade ? ' · <strong>Likely in trade binder (inferred)</strong>' : ''}</p>
      ${addButtons([card])}</div></article>`;
  }
  function detailUrl(card) {
    return `detail.html?id=${encodeURIComponent(card.scryfallId || '')}&name=${encodeURIComponent(card.name)}`;
  }
  function quickExploreButton(card) {
    return `<div class="card-tile-header">${Explore.renderQuickButton({ primaryName: cardTitle(card) }, card.collectionItemId)}</div>`;
  }
  function cardTitle(card) {
    return card.displayName || card.flavorName || card.name;
  }
  function cardTags(card) {
    const type = String(card.type_line || '').match(/\b(Creature|Instant|Sorcery|Artifact|Enchantment|Planeswalker|Land|Battle|Kindred)\b/i)?.[1];
    return [
      card.rarity ? `<span class="preview-tag rarity-${esc(card.rarity)}">${esc(card.rarity)}</span>` : '',
      card.foil && card.foil !== 'normal' ? `<span class="preview-tag finish-tag">${esc(card.foil)}</span>` : '',
      type ? `<span class="preview-tag type-tag">${esc(type)}</span>` : '',
      card.quantity > 1 ? `<span class="preview-tag quantity-tag">×${card.quantity}</span>` : ''
    ].join('');
  }
  function groupCard(group) {
    const card = group.representative;
    const market = marketAud(card);
    return `<article class="group-card">
      ${quickExploreButton(card)}
      <a class="card-visual" href="${detailUrl(card)}"><img loading="lazy" src="${esc(imageUrl(card))}" alt="${esc(cardTitle(card))}"></a>
      <div class="group-card-body"><h2><a href="${detailUrl(card)}">${esc(cardTitle(card))}</a></h2>
      <div class="owner-badges">${ownerBadges(group)}</div>
      ${card.flavorName && card.oracleName ? `<p class="oracle-name-line">Original card: ${esc(card.oracleName)}</p>` : ''}
      <p class="card-set-line">${esc(card.setName || card.setCode)} · ${esc(card.setCode)} #${esc(card.collectorNumber)}</p>
      <p class="group-summary">${group.quantity} owned · ${group.printingCount} printing${group.printingCount === 1 ? '' : 's'}${group.foilCount ? ` · ${group.foilCount} foil` : ''}</p>
      ${market ? `<p class="market-line"><span>Scryfall market</span><strong>A$${market.toFixed(2)}</strong></p>` : ''}
      <div class="preview-tags">${cardTags(card)}</div></div></article>`;
  }
  function printingCard(card) {
    const owner = state.owners.find(item => item.id === card.ownerId);
    const trade = Core.isLikelyTradeBinder(card, state.config.tradeBinderTerms || []);
    const market = marketAud(card);
    return `<article class="printing-card">${quickExploreButton(card)}<a class="card-visual" href="${detailUrl(card)}"><img loading="lazy" src="${esc(imageUrl(card))}" alt="${esc(cardTitle(card))}"></a>
      <div><h2><a href="${detailUrl(card)}">${esc(cardTitle(card))}</a></h2><span class="owner-badge ${owner?.badgeClass || ''}">${esc(card.ownerShortName)} ×${card.quantity}</span>
      ${card.flavorName && card.oracleName ? `<p class="oracle-name-line">Original card: ${esc(card.oracleName)}</p>` : ''}
      <p class="card-set-line">${esc(card.setName || card.setCode)} · ${esc(card.setCode)} #${esc(card.collectorNumber)}</p>
      <p>${esc(card.condition || 'condition unknown')} · ${esc(card.foil)}${card.binderName ? ` · ${esc(card.binderName)}` : ''}${trade ? ' · likely trade binder' : ''}</p>
      ${market ? `<p class="market-line"><span>Scryfall market</span><strong>A$${market.toFixed(2)}</strong></p>` : ''}
      <div class="preview-tags">${cardTags(card)}</div></div></article>`;
  }
  function renderResults() {
    closeQuickExplore();
    const grouped = state.grouping !== 'printing';
    const items = grouped ? state.groups : state.visible;
    const quantity = state.visible.reduce((sum, card) => sum + card.quantity, 0);
    const owners = new Set(state.visible.map(card => card.ownerId)).size;
    $('result-count').textContent = `${items.length.toLocaleString()} result${items.length === 1 ? '' : 's'} · ${quantity.toLocaleString()} cards across ${owners} owner${owners === 1 ? '' : 's'}`;
    $('results').className = `results ${state.mode} ${grouped ? 'grouped' : 'printings'}`;
    $('results').innerHTML = items.slice(0, state.shown).map(grouped ? groupCard : printingCard).join('') ||
      `<div class="empty-state"><h2>No cards match these filters</h2><p>Add the searched card to your Shopping List, or reset the filters.</p><a class="button-link" href="trade-basket.html?shopping=${encodeURIComponent($('search').value)}">Add to Shopping List</a><button type="button" data-clear>Clear Filters</button></div>`;
    $('load-more').hidden = state.shown >= items.length;
    updateExportPanel();
    const failures = state.failures.map(f => `<li><strong>${esc(f.owner.name)}:</strong> ${esc(f.error)}</li>`).join('');
    $('load-errors').innerHTML = failures ? `<details><summary>${state.failures.length} collection${state.failures.length === 1 ? '' : 's'} unavailable</summary><ul>${failures}</ul></details>` : '';
  }
  function clearFilters() {
    document.querySelectorAll('#filters input').forEach(el => { if (el.type === 'checkbox') el.checked = false; else el.value = el.type === 'number' ? 1 : ''; });
    document.querySelectorAll('#filters select').forEach(el => el.selectedIndex = 0);
    document.querySelector('[name="color-match"][value="contains"]').checked = true;
    $('search').value = ''; applyFilters();
  }
  function removeFilter(key, value) {
    const controls = {
      search: 'search', color: 'color-filter', type: 'type-filter', creatureType: 'creature-type-filter', rarity: 'rarity-filter',
      finish: 'finish-filter', condition: 'condition-filter', set: 'set-filter',
      minQuantity: 'quantity-filter', duplicates: 'duplicates-filter', legendary: 'legendary-filter',
      commander: 'commander-filter', tradeOnly: 'trade-filter', ownedByEveryone: 'owner-count-filter'
    };
    if (key === 'ownerIds') {
      const owner = state.owners.find(item => item.shortName === value || item.id === value);
      const control = owner && document.querySelector(`[name="owner"][value="${CSS.escape(owner.id)}"]`);
      if (control) control.checked = false;
    } else if (key === 'colors') {
      const colorCodes = { White:'W', Blue:'U', Black:'B', Red:'R', Green:'G', Colourless:'C' };
      const control = document.querySelector(`[name="color"][value="${colorCodes[value] || CSS.escape(value)}"]`);
      if (control) control.checked = false;
    } else if (key === 'binders') {
      const option = [...$('binder-filter').options].find(item => item.value === value);
      if (option) option.selected = false;
    } else {
      const control = $(controls[key]);
      if (control) {
        if (control.type === 'checkbox') control.checked = false;
        else control.value = control.type === 'number' ? 1 : '';
      }
    }
    applyFilters();
  }
  function addToBasket(id) {
    const card = state.cards.find(item => item.collectionItemId === id);
    if (!card) return;
    const basket = readBasket();
    if (basket.some(item => item.collectionItemId === id)) {
      announce('This copy is already in the Trade Basket. Change its quantity there.');
      return;
    }
    const items = Core.addBasketItem(basket, { ...card, imageUri: imageUrl(card) }, 1);
    localStorage.setItem(basketKey, JSON.stringify(items)); updateBasketCount();
    announce(`${card.name} added to the Trade Basket.`);
  }
  function announce(message) { $('live-region').textContent = message; }
  function ensureQuickExploreMenu() {
    if ($('quick-explore-menu')) return $('quick-explore-menu');
    document.body.insertAdjacentHTML('beforeend', '<div id="quick-explore-menu" class="quick-explore-menu" role="menu" hidden></div>');
    return $('quick-explore-menu');
  }
  function closeQuickExplore(returnFocus = false) {
    const menu = $('quick-explore-menu');
    if (!menu || menu.hidden) return;
    const button = document.querySelector('[data-quick-explore][aria-expanded="true"]');
    menu.hidden = true;
    menu.replaceChildren();
    document.querySelectorAll('[data-quick-explore][aria-expanded="true"]')
      .forEach(item => item.setAttribute('aria-expanded', 'false'));
    if (returnFocus) button?.focus();
  }
  function openQuickExplore(button) {
    const card = state.cards.find(item => item.collectionItemId === button.dataset.quickExplore);
    if (!card) return;
    closeQuickExplore();
    const menu = ensureQuickExploreMenu();
    menu.innerHTML = Explore.renderQuickMenu({
      primaryName: cardTitle(card),
      oracleName: card.oracleName || card.name,
      cardFaces: card.cardFaces || card.card_faces,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      finish: card.foil,
      scryfallUri: card.scryfallUri || card.scryfall_uri || ''
    });
    button.setAttribute('aria-expanded', 'true');
    menu.hidden = false;
    menu.style.visibility = 'hidden';
    const rect = button.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(innerWidth - menu.offsetWidth - margin, rect.right - menu.offsetWidth));
    let top = rect.bottom + 6;
    if (top + menu.offsetHeight > innerHeight - margin) top = Math.max(margin, rect.top - menu.offsetHeight - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.visibility = '';
    menu.querySelector('a')?.focus();
  }
  function selectedExportScope() {
    return document.querySelector('[name="export-scope"]:checked')?.value || 'current';
  }
  function exportCardCount(cards) {
    return cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
  }
  function updateExportPanel() {
    if (!$('export-current-count')) return;
    const currentCount = exportCardCount(state.visible);
    const libraryCount = exportCardCount(state.cards);
    $('export-current-count').textContent = `— ${currentCount.toLocaleString()} cards`;
    $('export-library-count').textContent = `— ${libraryCount.toLocaleString()} cards`;
    const scope = selectedExportScope();
    const count = scope === 'library' ? libraryCount : currentCount;
    document.querySelectorAll('[data-export]').forEach(button => { button.disabled = count === 0; });
    const sourceName = scope === 'library' ? (currentOwner ? 'library' : 'all collections') : 'filtered';
    $('export-summary').textContent = count > 2000
      ? `You are about to export ${count.toLocaleString()} collection cards from ${sourceName}.`
      : `${count.toLocaleString()} ${sourceName} card${count === 1 ? '' : 's'} selected.`;
  }
  function currentExport() {
    const scope = selectedExportScope();
    const grouped = state.grouping !== 'printing';
    const prepared = Export.prepareExport(state.visible, state.cards, { scope, grouped });
    return { ...prepared, count: prepared.quantity };
  }
  function exportLabel() {
    if (!currentOwner) return 'All Collections';
    return state.owners.find(owner => owner.id === currentOwner)?.name || 'Collection';
  }
  function closeExportMenu() {
    const menu = $('export-menu');
    const toggle = $('export-toggle');
    if (!menu || !toggle) return;
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  function showExportToast(message, error = false) {
    let toast = $('export-toast');
    if (!toast) {
      document.body.insertAdjacentHTML('beforeend', '<div id="export-toast" class="export-toast" role="status" aria-live="polite"></div>');
      toast = $('export-toast');
    }
    toast.textContent = message;
    toast.classList.toggle('error', error);
    toast.classList.add('show');
    clearTimeout(showExportToast.timer);
    showExportToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
    announce(message);
  }
  function downloadExport(value, extension, mime, message = 'Downloaded successfully.') {
    const blob = new Blob([Export.utf8Bytes(value)], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = Export.filename(exportLabel(), extension);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showExportToast(message);
  }
  async function runExport(action) {
    const { scope, grouped, count, rows } = currentExport();
    if (!rows.length) return;
    const scopeDescription = scope === 'library'
      ? (currentOwner ? 'library cards' : 'cards from all collections')
      : 'filtered cards';
    const success = verb => `${count.toLocaleString()} ${scopeDescription} ${verb}.`;
    try {
      if (action === 'copy') {
        await Export.copyText(Export.formatTxt(rows, { includeOwner: !currentOwner }));
        showExportToast(success('copied'));
      } else if (action === 'names') {
        await Export.copyText(Export.formatNames(rows, { grouped }));
        showExportToast(success('copied'));
      } else if (action === 'moxfield') {
        await Export.copyText(Export.formatMoxfield(rows, { aggregate: grouped }));
        showExportToast(success('copied'));
      } else if (action === 'txt') {
        downloadExport(Export.formatTxt(rows, { includeOwner: !currentOwner }), 'txt', 'text/plain;charset=utf-8', success('downloaded'));
      } else if (action === 'csv') {
        downloadExport(Export.formatCsv(rows), 'csv', 'text/csv;charset=utf-8', success('downloaded'));
      } else if (action === 'arena') {
        downloadExport(Export.formatArena(rows, { aggregate: grouped }), 'txt', 'text/plain;charset=utf-8', success('downloaded'));
      }
    } catch (_) {
      showExportToast('Unable to access clipboard.', true);
    } finally {
      closeExportMenu();
    }
  }
  async function enrichMetadata() {
    const ids = [...new Set(state.cards.map(card => card.scryfallId).filter(Boolean))];
    if (!ids.length) return;
    const applyMeta = meta => state.cards.filter(card=>card.scryfallId===meta.id).forEach(card=>Object.assign(card,{
      oracleName:meta.name || card.name, flavorName:meta.flavor_name || '',
      displayName:meta.flavor_name || card.name,
      type_line:meta.type_line, oracle_text:meta.oracle_text || meta.card_faces?.map(face=>face.oracle_text).join(' ') || '',
      colors:meta.colors || meta.card_faces?.[0]?.colors || [], color_identity:meta.color_identity || [],
      keywords:meta.keywords || [], legalities:meta.legalities || {}, imageUri:meta.image_uris?.normal || meta.card_faces?.[0]?.image_uris?.normal || '',
      cardFaces:meta.card_faces || [], scryfallPrices:meta.prices || {}
    }));
    const cached = Core.readCachedScryfall(ids);
    Object.values(cached).forEach(applyMeta);
    const missingIds = ids.filter(id => !cached[id]);
    const cachedCount = ids.length - missingIds.length;
    setMarketProgress(cachedCount, ids.length, missingIds.length ? 'loading' : 'complete');
    if (cachedCount) { applyFilters(); renderStats(); }
    for (let index = 0; index < missingIds.length; index += 75) {
      try {
        const response = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'Content-Type':'application/json'},
          body:JSON.stringify({identifiers:missingIds.slice(index,index+75).map(id=>({id}))}) });
        if (!response.ok) {
          setMarketProgress(cachedCount + index, ids.length, 'error');
          break;
        }
        const json = await response.json();
        Core.cacheScryfallCards(json.data);
        json.data.forEach(applyMeta);
        if (index === 0 || index + 75 >= missingIds.length) { applyFilters(); renderStats(); }
        const completed = cachedCount + Math.min(index + 75, missingIds.length);
        setMarketProgress(completed, ids.length, completed >= ids.length ? 'complete' : 'loading');
        await new Promise(resolve => setTimeout(resolve, 80));
      } catch (_) {
        setMarketProgress(cachedCount + index, ids.length, 'error');
        break;
      }
    }
  }
  function bindEvents() {
    let timer;
    $('search').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(applyFilters, 80); });
    $('creature-type-filter').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(applyFilters, 120); });
    $('filters').addEventListener('change', applyFilters);
    document.querySelector('[data-colour-select-all]').addEventListener('click', () => {
      document.querySelectorAll('[name="color"]').forEach(control => { control.checked = true; });
      applyFilters();
    });
    document.querySelector('[data-colour-clear]').addEventListener('click', () => {
      document.querySelectorAll('[name="color"]').forEach(control => { control.checked = false; });
      applyFilters();
    });
    $('sort').addEventListener('change', applyFilters);
    $('clear-all').addEventListener('click', clearFilters);
    $('filter-toggle').addEventListener('click', () => {
      const open = document.body.classList.toggle('filters-open');
      $('filter-toggle').setAttribute('aria-expanded', open);
      if (open) $('filters').querySelector('input, select, button')?.focus();
    });
    $('view-grid').addEventListener('click', () => { closeQuickExplore(); state.mode='grid'; localStorage.setItem('mtg-group-view','grid'); renderResults(); });
    $('view-list').addEventListener('click', () => { closeQuickExplore(); state.mode='list'; localStorage.setItem('mtg-group-view','list'); renderResults(); });
    $('grouping').addEventListener('change', event => {
      state.grouping=event.target.value;
      localStorage.setItem('mtg-grouping-v2',state.grouping);
      applyFilters();
    });
    $('export-toggle').addEventListener('click', event => {
      event.stopPropagation();
      const menu = $('export-menu');
      menu.hidden = !menu.hidden;
      $('export-toggle').setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden) {
        updateExportPanel();
        menu.querySelector('[name="export-scope"]:checked')?.focus();
      }
    });
    document.querySelectorAll('[name="export-scope"]').forEach(control => {
      const remembered = sessionStorage.getItem(exportScopeKey);
      control.checked = control.value === (remembered === 'library' ? 'library' : 'current');
      control.addEventListener('change', () => {
        sessionStorage.setItem(exportScopeKey, selectedExportScope());
        updateExportPanel();
      });
    });
    $('export-menu').addEventListener('click', event => {
      const button = event.target.closest('[data-export]');
      if (button && !button.disabled) runExport(button.dataset.export);
    });
    $('load-more').addEventListener('click', () => { state.shown += state.pageSize; renderResults(); });
    document.addEventListener('click', event => {
      const quickExplore = event.target.closest('[data-quick-explore]');
      if (quickExplore) {
        event.preventDefault();
        event.stopPropagation();
        if (quickExplore.getAttribute('aria-expanded') === 'true') closeQuickExplore(true);
        else openQuickExplore(quickExplore);
        return;
      }
      if (event.target.closest('#quick-explore-menu a')) {
        closeQuickExplore();
        return;
      }
      if (!event.target.closest('#quick-explore-menu')) closeQuickExplore();
      if (!event.target.closest('.export-control')) closeExportMenu();
      if (event.target.closest('[data-clear]')) clearFilters();
      const remove = event.target.closest('[data-remove-filter]');
      if (remove) removeFilter(remove.dataset.removeFilter, remove.dataset.removeValue);
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('quick-explore-menu')?.hidden) {
        event.preventDefault();
        closeQuickExplore(true);
        return;
      }
      if (event.key === 'Escape' && !$('export-menu').hidden) {
        closeExportMenu();
        $('export-toggle').focus();
        return;
      }
      if (!document.body.classList.contains('filters-open')) return;
      if (event.key === 'Escape') {
        document.body.classList.remove('filters-open');
        $('filter-toggle').setAttribute('aria-expanded', 'false');
        $('filter-toggle').focus();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...$('filters').querySelectorAll('input:not([disabled]), select:not([disabled]), button:not([disabled]), a[href]')]
        .filter(control => control.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
  bindEvents();
  loadLibraries().catch(error => { $('load-errors').textContent = `Collections could not load: ${error.message}`; });
})();
