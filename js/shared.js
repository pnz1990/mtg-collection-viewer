// Shared state and functions
let collection = [];
let filteredCollection = [];
let db;
let priceSlider;
let maxPriceValue = 200;
let usdToAudRate = Number(localStorage.getItem('mtg-usd-aud-rate')) || 1.5;
const isMobile = () => window.innerWidth <= 768;

// IndexedDB setup
const dbPromise = new Promise((resolve, reject) => {
  const request = indexedDB.open('mtg-images', 1);
  request.onerror = () => reject(request.error);
  request.onsuccess = () => { db = request.result; resolve(db); };
  request.onupgradeneeded = e => {
    e.target.result.createObjectStore('images', { keyPath: 'id' });
  };
});

async function getCachedImage(id) {
  await dbPromise;
  return new Promise(resolve => {
    const tx = db.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(id);
    req.onsuccess = () => resolve(req.result?.url);
    req.onerror = () => resolve(null);
  });
}

async function cacheImage(id, url) {
  await dbPromise;
  const tx = db.transaction('images', 'readwrite');
  tx.objectStore('images').put({ id, url, timestamp: Date.now() });
}

async function getCardData(scryfallId) {
  await dbPromise;
  return new Promise(resolve => {
    const tx = db.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(`card_${scryfallId}`);
    req.onsuccess = () => resolve(req.result?.data);
    req.onerror = () => resolve(null);
  });
}

async function cacheCardData(scryfallId, data) {
  await dbPromise;
  const tx = db.transaction('images', 'readwrite');
  tx.objectStore('images').put({ id: `card_${scryfallId}`, data, timestamp: Date.now() });
}

async function cacheFullCardData(scryfallId, data) {
  // Cache to detail page DB (mtg-detail-cache)
  const req = indexedDB.open('mtg-detail-cache', 1);
  req.onupgradeneeded = e => e.target.result.createObjectStore('cards', { keyPath: 'id' });
  req.onsuccess = e => {
    const db = e.target.result;
    const tx = db.transaction('cards', 'readwrite');
    tx.objectStore('cards').put({ id: scryfallId, data, cached: Date.now() });
  };
}

async function loadFullCardData(onProgress, forceRefresh = false) {
  const uncachedIds = [];
  
  // Check which cards need fetching
  for (const card of collection) {
    if (forceRefresh) {
      uncachedIds.push(card.scryfallId);
    } else {
      const cached = await getCardData(card.scryfallId);
      if (!cached) {
        uncachedIds.push(card.scryfallId);
      } else {
        Object.assign(card, cached);
      }
    }
  }
  
  if (uncachedIds.length === 0) {
    return true;
  }
  
  // Batch fetch in groups of 75
  const batches = [];
  for (let i = 0; i < uncachedIds.length; i += 75) {
    batches.push(uncachedIds.slice(i, i + 75));
  }
  
  let fetched = 0;
  for (const batch of batches) {
    try {
      const response = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(id => ({ id })) })
      });
      
      if (!response.ok) continue;
      const data = await response.json();
      
      for (const cardData of data.data) {
        const extracted = {
          type_line: cardData.type_line,
          mana_cost: cardData.mana_cost,
          cmc: cardData.cmc,
          colors: cardData.colors || cardData.card_faces?.[0]?.colors || [],
          color_identity: cardData.color_identity || [],
          keywords: cardData.keywords || [],
          reserved: cardData.reserved || false,
          scryfallPrices: cardData.prices || null,
          released_at: cardData.released_at || null,
          oracle_id: cardData.oracle_id || null
        };
        
        await cacheCardData(cardData.id, extracted);
        
        // Also cache full data for detail page
        await cacheFullCardData(cardData.id, cardData);
        
        // Apply to collection
        const card = collection.find(c => c.scryfallId === cardData.id);
        if (card) Object.assign(card, extracted);
      }
      
      fetched += batch.length;
      if (onProgress) onProgress(fetched, uncachedIds.length);
      
      // Rate limit
      await new Promise(r => setTimeout(r, 100));
    } catch (e) {
      console.error('Batch fetch error:', e);
    }
  }
  
  return true;
}

function isFullDataLoaded() {
  return collection.length > 0 && collection[0].type_line !== undefined;
}

function getMainType(typeLine) {
  if (!typeLine) return null;
  return ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Planeswalker']
    .find(t => typeLine.includes(t));
}

function renderCardHTML(card, nameCounts = {}) {
  const foilClass = card.foil !== 'normal' ? card.foil : '';
  const setIcon = `https://svgs.scryfall.io/sets/${(card.setCode || '').toLowerCase()}.svg`;
  const fallbackIcon = 'https://svgs.scryfall.io/sets/default.svg';
  const mainType = getMainType(card.type_line);
  const keywordTags = (card.keywords || []).slice(0, 3).map(k => `<span class="badge keyword-badge clickable" data-filter="keyword" data-value="${k}">${k}</span>`).join('');
  const duplicateKey = card.oracle_id || card.name;
  const hasDuplicateName = nameCounts[duplicateKey] > 1; // More than 1 card entry with same oracle_id/name
  let displaySettings = {};
  try { displaySettings = JSON.parse(localStorage.getItem('mtg-dashboard-settings') || '{}'); } catch (_) {}
  const market = getCardPrice(card);
  return `
  <div class="card ${foilClass}" data-scryfall-id="${card.scryfallId}">
    <a href="detail.html?id=${card.scryfallId}" class="card-link">
      <div class="card-image-wrapper">
        <div class="card-image-inner">
          <img alt="${card.name}" class="card-image">
          <img src="images/back.png" alt="Card back" class="card-back">
        </div>
      </div>
      <div class="card-header">
        <div class="card-name">${card.name}</div>
        <div class="card-value">${formatPrice(getCardPrice(card) * card.quantity, getCardCurrency(card))}</div>
      </div>
      <div class="card-set clickable" data-filter="set" data-value="${card.setName}"><img src="${setIcon}" class="set-icon" alt="${card.setCode}" onerror="this.src='${fallbackIcon}'">${card.setName}</div>
      <div class="card-printing">${card.setCode} #${card.collectorNumber}${card.condition ? ` · ${card.condition.replaceAll('_', ' ')}` : ''}${card.language ? ` · ${card.language.toUpperCase()}` : ''}</div>
      ${!displaySettings.hideBinderNames && card.binderName ? `<div class="card-binder">${card.binderName}</div>` : ''}
      <div class="card-price-split">
        <span>Scryfall market</span>
        <strong>${market ? formatPrice(market * card.quantity, 'AUD') : 'Unavailable'}</strong>
      </div>
      <div class="card-details">
        <span class="badge rarity-${card.rarity} clickable" data-filter="rarity" data-value="${card.rarity}">${card.rarity}</span>
        ${card.foil !== 'normal' ? `<span class="badge foil-${card.foil} clickable" data-filter="foil" data-value="${card.foil}">${card.foil}</span>` : ''}
        ${card.reserved ? `<span class="badge reserved-badge clickable" data-filter="reserved" data-value="yes">RL</span>` : ''}
        ${mainType ? `<span class="badge type-badge clickable" data-filter="type" data-value="${mainType}">${mainType}</span>` : ''}
        ${card.cmc !== undefined && !card.type_line?.includes('Land') ? `<span class="badge cmc-badge clickable" data-filter="cmc" data-value="${card.cmc}">⬡${card.cmc}</span>` : ''}
        ${card.quantity > 1 ? `<span class="badge qty-badge">x${card.quantity}</span>` : ''}
        ${hasDuplicateName ? `<span class="badge duplicate-badge clickable" data-filter="search" data-value="${card.name}">Duplicate</span>` : ''}
        ${keywordTags}
      </div>
    </a>
  </div>`;
}

function setupCardInteractions(container) {
  container.querySelectorAll('.card-image-wrapper').forEach(wrapper => {
    const inner = wrapper.querySelector('.card-image-inner');
    let isDragging = false, hasMoved = false;
    
    const startDrag = e => { isDragging = true; hasMoved = false; e.preventDefault(); };
    const endDrag = () => {
      if (isDragging) {
        isDragging = false;
        inner.style.transform = '';
        inner.style.boxShadow = '';
        inner.style.setProperty('--shimmer-x', '50%');
        inner.style.setProperty('--shimmer-y', '50%');
      }
    };
    const onMove = e => {
      if (!isDragging) return;
      hasMoved = true;
      const rect = wrapper.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const x = (clientX - rect.left) / rect.width - 0.5;
      const y = (clientY - rect.top) / rect.height - 0.5;
      inner.style.transform = `rotateX(${-y * 60}deg) rotateY(${x * 120}deg)`;
      inner.style.boxShadow = `${x * -20}px ${10 + y * -10}px 20px rgba(0,0,0,0.5)`;
      inner.style.setProperty('--shimmer-x', `${50 + x * 100}%`);
      inner.style.setProperty('--shimmer-y', `${50 + y * 100}%`);
    };
    
    wrapper.addEventListener('mousedown', startDrag);
    wrapper.addEventListener('touchstart', startDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove);
    wrapper.addEventListener('click', e => { if (hasMoved) e.preventDefault(); });
  });
  
  // Right-click context menu for trading binder
  container.querySelectorAll('.card').forEach(card => {
    card.addEventListener('contextmenu', e => {
      e.preventDefault();
      const scryfallId = card.dataset.scryfallId;
      // Get foil status from card data
      const cardData = collection.find(c => c.scryfallId === scryfallId) || 
                       filteredCollection.find(c => c.scryfallId === scryfallId);
      const foil = cardData?.foil || 'normal';
      showContextMenu(e.clientX, e.clientY, scryfallId, foil);
    });
  });
  
  // Clickable badge filters
  container.querySelectorAll('.clickable').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const filter = el.dataset.filter;
      const value = el.dataset.value;
      if (filter === 'rarity') document.getElementById('rarity-filter').value = value;
      else if (filter === 'foil') document.getElementById('foil-filter').value = value;
      else if (filter === 'type') document.getElementById('type-filter').value = value;
      else if (filter === 'keyword') document.getElementById('keyword-filter').value = value;
      else if (filter === 'set') document.getElementById('set-filter').value = value;
      else if (filter === 'cmc') window.cmcFilter = parseInt(value);
      else if (filter === 'reserved') document.getElementById('reserved-filter').value = value;
      else if (filter === 'search') document.getElementById('search').value = value;
      applyFilters();
    });
  });
}

function showContextMenu(x, y, scryfallId, foil = 'normal') {
  // Check lock states
  const binderLocked = localStorage.getItem('binderLocked') === '1';
  const wishlistLocked = localStorage.getItem('wishlistLocked') === '1';
  if (binderLocked && wishlistLocked) return;
  
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  
  let items = '';
  if (!binderLocked) items += '<div class="context-menu-item" data-action="add-to-binder">📖 Add to Trading Binder</div>';
  if (!wishlistLocked) items += '<div class="context-menu-item" data-action="add-to-wishlist">💫 Add to Wishlist</div>';
  menu.innerHTML = items;
  
  document.body.appendChild(menu);
  
  const binderBtn = menu.querySelector('[data-action="add-to-binder"]');
  if (binderBtn) binderBtn.addEventListener('click', () => { addToTradingBinder(scryfallId, foil); menu.remove(); });
  
  const wishlistBtn = menu.querySelector('[data-action="add-to-wishlist"]');
  if (wishlistBtn) wishlistBtn.addEventListener('click', () => { addToWishlist(scryfallId); menu.remove(); });
  
  setTimeout(() => {
    document.addEventListener('click', () => menu.remove(), { once: true });
  }, 0);
}

function addToTradingBinder(scryfallId, foil = 'normal') {
  // Check if binder is locked from localStorage
  const binderLocked = localStorage.getItem('binderLocked') === '1';
  if (binderLocked) {
    showNotification('🔒 Binder is locked. Cannot add cards.');
    return;
  }
  
  const stored = localStorage.getItem('tradingBinder');
  let cards = [];
  
  try {
    cards = stored ? JSON.parse(stored) : [];
  } catch (e) {
    cards = [];
  }
  
  // Check if card with same ID and foil already exists
  const cardKey = `${scryfallId}:${foil}`;
  if (cards.some(c => `${c.scryfallId}:${c.foil}` === cardKey)) {
    showNotification('Card already in trading binder');
    return;
  }
  
  cards.push({ scryfallId, foil });
  localStorage.setItem('tradingBinder', JSON.stringify(cards));
  console.log('Added to binder:', scryfallId, foil, 'Total cards:', cards.length);
  showNotification('✓ Added to trading binder');
}

function addToWishlist(scryfallId) {
  const wishlistLocked = localStorage.getItem('wishlistLocked') === '1';
  if (wishlistLocked) {
    showNotification('🔒 Wishlist is locked. Cannot add cards.');
    return;
  }
  
  const stored = localStorage.getItem('wishlist');
  let ids = [];
  try { ids = stored ? JSON.parse(stored) : []; } catch (e) { ids = []; }
  
  if (ids.includes(scryfallId)) {
    showNotification('Card already in wishlist');
    return;
  }
  
  ids.push(scryfallId);
  localStorage.setItem('wishlist', JSON.stringify(ids));
  showNotification('✓ Added to wishlist');
}

function showNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 2000);
}

async function fetchCardImage(scryfallId, size = 'normal') {
  const cacheKey = `${scryfallId}_${size}`;
  const cached = await getCachedImage(cacheKey);
  if (cached) return cached;
  
  // Also check old cache key format (without size)
  const oldCached = await getCachedImage(scryfallId);
  if (oldCached) return oldCached;
  
  await new Promise(r => setTimeout(r, 50));
  try {
    const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`);
    if (!response.ok) return null;
    const data = await response.json();
    const imageUrl = data.image_uris?.[size] || data.card_faces?.[0]?.image_uris?.[size];
    if (imageUrl) {
      await cacheImage(cacheKey, imageUrl);
      return imageUrl;
    }
  } catch (e) {}
  return null;
}

function parseCSVLine(line) {
  const result = [];
  let current = '', inQuotes = false;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
    else current += char;
  }
  result.push(current);
  return result;
}

function formatPrice(price, currency = 'USD') {
  if (!isFinite(price) || isNaN(price)) return '$0.00';
  const symbols = { USD: '$', CAD: 'CA$', EUR: '€', GBP: '£', AUD: 'A$', JPY: '¥' };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${price.toFixed(2)}`;
}

function getPriceSource() {
  return 'scryfall';
}

function getCardPrice(card) {
  return (window.MTGCollectionCore?.marketPrice(card) || 0) * usdToAudRate;
}

function getCardCurrency(card) {
  return 'AUD';
}

function getUsdToAudRate() {
  return usdToAudRate;
}

async function loadAudExchangeRate() {
  try {
    const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/AUD');
    if (!response.ok) throw new Error(`Exchange-rate service returned ${response.status}`);
    const data = await response.json();
    if (!Number.isFinite(Number(data.rate))) throw new Error('Exchange-rate response was invalid');
    usdToAudRate = Number(data.rate);
    localStorage.setItem('mtg-usd-aud-rate', String(usdToAudRate));
    localStorage.setItem('mtg-usd-aud-date', data.date || new Date().toISOString().slice(0, 10));
    return true;
  } catch (error) {
    console.warn('Using the last saved USD to AUD rate:', error);
    return false;
  }
}

function updateStats() {
  const totalCards = filteredCollection.reduce((sum, c) => sum + c.quantity, 0);
  const totalValue = filteredCollection.reduce((sum, c) => sum + getCardPrice(c) * c.quantity, 0);
  const cardsEl = document.getElementById('total-cards');
  const valueEl = document.getElementById('total-value');
  if (cardsEl) cardsEl.textContent = totalCards;
  if (valueEl) valueEl.textContent = formatPrice(totalValue, 'AUD');
}

async function fetchWithFallback(paths) {
  for (const path of paths) {
    const response = await fetch(path);
    if (response.ok) return response;
  }
  return { ok: false, status: 404, text: () => Promise.resolve('') };
}

async function loadCollection() {
  const response = await fetchWithFallback(['data/Collection.csv', 'data/collection.csv']);
  if (!response.ok) {
    showCollectionStatus('error', 'Collection.csv could not be loaded. Add a ManaBox export at data/Collection.csv and reload.');
    collection = [];
    filteredCollection = [];
    setupPriceSlider();
    updateStats();
    if (typeof onCollectionLoaded === 'function') onCollectionLoaded();
    return collection;
  }
  const text = await response.text();
  const parsed = window.MTGCollectionCore.parseManaBoxCSV(text, { defaultCurrency: 'AUD' });
  if (parsed.errors.length) {
    showCollectionStatus('error', parsed.errors.join(' '));
    collection = []; filteredCollection = [];
    setupPriceSlider(); updateStats();
    if (typeof onCollectionLoaded === 'function') onCollectionLoaded();
    return collection;
  }
  collection = parsed.cards;
  showCollectionStatus(parsed.warnings.length ? 'warning' : 'success',
    parsed.warnings.length ? parsed.warnings.join(' ') : `${collection.length} owned card versions loaded.`);
  
  maxPriceValue = Math.ceil(Math.max(...collection.map(c => c.price)));
  setupPriceSlider();
  
  filteredCollection = [...collection];
  filteredCollection.sort((a, b) => (getCardPrice(b) * b.quantity) - (getCardPrice(a) * a.quantity));
  
  // Load cached full data if available
  for (const card of collection) {
    const cached = await getCardData(card.scryfallId);
    if (cached) Object.assign(card, cached);
  }
  
  // Re-sort after cached data may have changed prices
  const sort = document.getElementById('sort')?.value || 'price-desc';
  filteredCollection.sort((a, b) => {
    switch(sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'price-asc': return (getCardPrice(a) * a.quantity) - (getCardPrice(b) * b.quantity);
      case 'price-desc':
      default: return (getCardPrice(b) * b.quantity) - (getCardPrice(a) * a.quantity);
    }
  });
  updateStats();
  
  // Update price source state after loading cached data
  if (typeof updatePriceSourceState === 'function') updatePriceSourceState();
  
  populateKeywordFilter();
  
  if (typeof onCollectionLoaded === 'function') {
    onCollectionLoaded();
  }
  
  return collection;
}

function showCollectionStatus(kind, message) {
  const target = document.getElementById('collection-status');
  if (!target) return;
  target.className = `collection-status ${kind}`;
  target.textContent = message;
  target.hidden = false;
}

function setupPriceSlider() {
  const slider = document.getElementById('price-range');
  if (!slider) return; // Skip if no slider element
  
  priceSlider = noUiSlider.create(slider, {
    start: [0, maxPriceValue],
    connect: true,
    range: { min: 0, max: maxPriceValue },
    step: 1
  });
  priceSlider.on('update', (values) => {
    document.getElementById('price-min-val').textContent = Math.round(values[0]);
    document.getElementById('price-max-val').textContent = values[1] >= maxPriceValue ? '∞' : Math.round(values[1]);
  });
  priceSlider.on('change', applyFilters);
}

function applyFilters() {
  const search = document.getElementById('search')?.value?.toLowerCase() || '';
  const setFilter = document.getElementById('set-filter')?.value?.toLowerCase() || '';
  const rarity = document.getElementById('rarity-filter')?.value || '';
  const foil = document.getElementById('foil-filter')?.value || '';
  const typeFilter = document.getElementById('type-filter')?.value || '';
  const subtypeFilter = document.getElementById('subtype-filter')?.value?.toLowerCase() || '';
  const colorFilter = document.getElementById('color-filter')?.value || '';
  const keywordFilter = document.getElementById('keyword-filter')?.value || '';
  const reservedFilter = document.getElementById('reserved-filter')?.value || '';
  const duplicatesFilter = document.getElementById('duplicates-filter')?.value || '';
  const sort = document.getElementById('sort')?.value || 'price-desc';
  const [priceMin, priceMax] = priceSlider ? priceSlider.get().map(Number) : [0, maxPriceValue];
  const priceCeiling = priceMax >= maxPriceValue ? Infinity : priceMax;
  const cmcFilter = window.cmcFilter;
  
  // Get selected color identity
  const colorIdentityChecks = document.querySelectorAll('.color-checkboxes input:checked');
  const selectedColors = [...colorIdentityChecks].map(c => c.value);
  
  // Count name occurrences for duplicate filter
  // Use oracle_id if available (groups flavor name variants), otherwise fall back to name
  const nameCounts = {};
  collection.forEach(c => {
    const key = c.oracle_id || c.name;
    nameCounts[key] = (nameCounts[key] || 0) + 1;
  });
  
  filteredCollection = collection.filter(card => {
    const duplicateKey = card.oracle_id || card.name;
    const matchesType = !typeFilter || (card.type_line && card.type_line.includes(typeFilter));
    const matchesSubtype = !subtypeFilter || (card.type_line && card.type_line.toLowerCase().includes(subtypeFilter));
    const matchesColor = !colorFilter || matchCardColor(card, colorFilter);
    const matchesIdentity = selectedColors.length === 0 || matchColorIdentity(card, selectedColors);
    const matchesKeyword = !keywordFilter || (card.keywords && card.keywords.includes(keywordFilter));
    const matchesCmc = cmcFilter === undefined || (cmcFilter === 6 ? card.cmc >= 6 : card.cmc === cmcFilter);
    const matchesReserved = !reservedFilter || (reservedFilter === 'yes' ? card.reserved : !card.reserved);
    const matchesDuplicates = !duplicatesFilter || 
      (duplicatesFilter === 'duplicates' ? nameCounts[duplicateKey] > 1 : nameCounts[duplicateKey] === 1);
    
    return card.name.toLowerCase().includes(search) &&
      (!setFilter || card.setName.toLowerCase().includes(setFilter)) &&
      (!rarity || card.rarity === rarity) &&
      (!foil || card.foil === foil) &&
      matchesType &&
      matchesSubtype &&
      matchesColor &&
      matchesIdentity &&
      matchesKeyword &&
      matchesCmc &&
      matchesReserved &&
      matchesDuplicates &&
      getCardPrice(card) >= priceMin && getCardPrice(card) <= priceCeiling;
  });
  
  filteredCollection.sort((a, b) => {
    switch(sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'rarity': return b.rarity.localeCompare(a.rarity);
      case 'set': return a.setName.localeCompare(b.setName);
      case 'cmc-asc': return (a.cmc || 0) - (b.cmc || 0);
      case 'cmc-desc': return (b.cmc || 0) - (a.cmc || 0);
      case 'price-asc': return (getCardPrice(a) * a.quantity) - (getCardPrice(b) * b.quantity);
      case 'price-desc':
      default: return (getCardPrice(b) * b.quantity) - (getCardPrice(a) * a.quantity);
    }
  });
  
  updateStats();
  if (typeof onFiltersApplied === 'function') {
    onFiltersApplied();
  }
}

function matchCardColor(card, filter) {
  if (!card.colors) return false;
  if (filter === 'C') return card.colors.length === 0;
  if (filter === 'M') return card.colors.length > 1;
  return card.colors.includes(filter);
}

function matchColorIdentity(card, selectedColors) {
  if (!card.color_identity) return false;
  // C = colorless, card must have empty color_identity
  if (selectedColors.includes('C') && card.color_identity.length === 0) return true;
  // Check if card's color identity is subset of selected colors (EDH legal)
  const colorsOnly = selectedColors.filter(c => c !== 'C');
  if (colorsOnly.length === 0) return false;
  return card.color_identity.every(c => colorsOnly.includes(c));
}

function setupAutocomplete(inputId, listId, getItems) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  
  if (!input || !list) return; // Skip if elements don't exist
  
  input.addEventListener('input', () => {
    const val = input.value.toLowerCase();
    if (!val) { list.classList.remove('show'); return; }
    const items = getItems().filter(i => i.toLowerCase().includes(val)).slice(0, 8);
    if (!items.length) { list.classList.remove('show'); return; }
    list.innerHTML = items.map(i => `<div class="autocomplete-item">${i}</div>`).join('');
    list.classList.add('show');
  });
  
  list.addEventListener('click', e => {
    if (e.target.classList.contains('autocomplete-item')) {
      input.value = e.target.textContent;
      list.classList.remove('show');
      applyFilters();
    }
  });
  
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrapper')) list.classList.remove('show');
  });
}

// Event listeners
document.getElementById('search')?.addEventListener('input', applyFilters);
document.getElementById('set-filter')?.addEventListener('input', applyFilters);
document.getElementById('rarity-filter')?.addEventListener('change', applyFilters);
document.getElementById('foil-filter')?.addEventListener('change', applyFilters);
document.getElementById('sort')?.addEventListener('change', applyFilters);
document.getElementById('type-filter')?.addEventListener('change', applyFilters);
document.getElementById('subtype-filter')?.addEventListener('input', applyFilters);
document.getElementById('color-filter')?.addEventListener('change', applyFilters);
document.getElementById('keyword-filter')?.addEventListener('change', applyFilters);
document.getElementById('reserved-filter')?.addEventListener('change', applyFilters);
document.getElementById('duplicates-filter')?.addEventListener('change', applyFilters);
document.querySelectorAll('.color-checkboxes input').forEach(cb => cb.addEventListener('change', applyFilters));

document.getElementById('clear-filters')?.addEventListener('click', () => {
  document.getElementById('search').value = '';
  document.getElementById('set-filter').value = '';
  document.getElementById('subtype-filter').value = '';
  document.getElementById('rarity-filter').value = '';
  document.getElementById('foil-filter').value = '';
  document.getElementById('type-filter') && (document.getElementById('type-filter').value = '');
  document.getElementById('color-filter') && (document.getElementById('color-filter').value = '');
  document.getElementById('keyword-filter') && (document.getElementById('keyword-filter').value = '');
  document.getElementById('reserved-filter') && (document.getElementById('reserved-filter').value = '');
  document.getElementById('duplicates-filter') && (document.getElementById('duplicates-filter').value = '');
  document.querySelectorAll('.color-checkboxes input').forEach(cb => cb.checked = false);
  if (priceSlider) priceSlider.set([0, maxPriceValue]);
  window.cmcFilter = undefined;
  applyFilters();
});

// Theme switcher
const themeSelect = document.getElementById('theme-select');
if (themeSelect) {
  const savedTheme = localStorage.getItem('mtg-theme') || '';
  document.documentElement.dataset.theme = savedTheme;
  themeSelect.value = savedTheme;
  themeSelect.addEventListener('change', () => {
    document.documentElement.dataset.theme = themeSelect.value;
    localStorage.setItem('mtg-theme', themeSelect.value);
  });
}

// Hamburger menu
const menuToggle = document.getElementById('menu-toggle');
const menuDropdown = document.getElementById('menu-dropdown');
const menuOverlay = document.getElementById('menu-overlay');

function closeMenu() {
  menuDropdown?.classList.remove('show');
  menuOverlay?.classList.remove('show');
}

if (menuToggle && menuDropdown) {
  menuToggle.addEventListener('click', () => {
    menuDropdown.classList.toggle('show');
    menuOverlay?.classList.toggle('show');
  });
  menuOverlay?.addEventListener('click', closeMenu);
}

// Menu random card button
document.getElementById('menu-random')?.addEventListener('click', () => {
  if (collection.length > 0) {
    const randomCard = collection[Math.floor(Math.random() * collection.length)];
    window.location.href = `detail.html?id=${randomCard.scryfallId}&reveal=1`;
  }
});

// Menu load data button
const menuLoadBtn = document.getElementById('menu-load-data');
if (menuLoadBtn) {
  const updateMenuLoadBtn = () => {
    if (isFullDataLoaded()) {
      menuLoadBtn.textContent = '🔄 Refresh Data';
    } else {
      menuLoadBtn.textContent = '📥 Load Full Data';
    }
  };
  
  menuLoadBtn.addEventListener('click', async () => {
    menuLoadBtn.textContent = '📥 Loading... 0%';
    await loadFullCardData((done, total) => {
      const pct = Math.round((done / total) * 100);
      menuLoadBtn.textContent = `📥 Loading... ${pct}%`;
    }, true);
    updateMenuLoadBtn();
    populateKeywordFilter();
    if (typeof updatePriceSourceState === 'function') updatePriceSourceState();
    closeMenu();
    if (typeof onFiltersApplied === 'function') applyFilters();
  });
}

function populateKeywordFilter() {
  const select = document.getElementById('keyword-filter');
  if (!select) return;
  const keywords = new Set();
  collection.forEach(c => (c.keywords || []).forEach(k => keywords.add(k)));
  const sorted = [...keywords].sort();
  select.innerHTML = '<option value="">All Keywords</option>' + sorted.map(k => `<option value="${k}">${k}</option>`).join('');
}

// Load noUiSlider then collection after DOM ready
function initApp() {
  // Setup price source toggle
  const priceSourceSelect = document.getElementById('price-source');
  if (priceSourceSelect) {
    const scryfallOption = priceSourceSelect.querySelector('option[value="scryfall"]');
    
    const refreshPriceDisplay = () => {
      filteredCollection.sort((a, b) => {
        const sort = document.getElementById('sort')?.value || 'price-desc';
        switch(sort) {
          case 'name': return a.name.localeCompare(b.name);
          case 'rarity': return b.rarity.localeCompare(a.rarity);
          case 'set': return a.setName.localeCompare(b.setName);
          case 'cmc-asc': return (a.cmc || 0) - (b.cmc || 0);
          case 'cmc-desc': return (b.cmc || 0) - (a.cmc || 0);
          case 'price-asc': return (getCardPrice(a) * a.quantity) - (getCardPrice(b) * b.quantity);
          case 'price-desc':
          default: return (getCardPrice(b) * b.quantity) - (getCardPrice(a) * a.quantity);
        }
      });
      updateStats();
      if (typeof onFiltersApplied === 'function') onFiltersApplied();
      if (typeof renderCharts === 'function') renderCharts();
    };
    
    const updatePriceSourceState = () => {
      const savedSource = getPriceSource();
      if (isFullDataLoaded()) {
        scryfallOption.disabled = false;
        scryfallOption.title = '';
        priceSourceSelect.value = savedSource;
        // Only refresh if collection is already rendered (imageObserver exists)
        if (savedSource === 'scryfall' && typeof imageObserver !== 'undefined') {
          refreshPriceDisplay();
        }
      } else {
        scryfallOption.disabled = true;
        scryfallOption.title = 'Load Full Data first';
        if (priceSourceSelect.value === 'scryfall') {
          priceSourceSelect.value = 'manabox';
        }
      }
    };
    
    updatePriceSourceState();
    window.updatePriceSourceState = updatePriceSourceState;
    
    priceSourceSelect.addEventListener('change', () => {
      localStorage.setItem('priceSource', priceSourceSelect.value);
      refreshPriceDisplay();
    });
  }
  
  const nouislider = document.createElement('script');
  nouislider.src = 'https://cdn.jsdelivr.net/npm/nouislider@15/dist/nouislider.min.js';
  nouislider.onload = () => {
    // Skip CSV collection loading on pages that manage their own data
    if (typeof initWishlist === 'function' || typeof loadBinder === 'function') {
      if (typeof onCollectionLoaded === 'function') onCollectionLoaded();
      return;
    }
    loadCollection().then(() => {
      setupAutocomplete('search', 'search-autocomplete', () => [...new Set(collection.map(c => c.name))]);
      setupAutocomplete('set-filter', 'set-autocomplete', () => [...new Set(collection.map(c => c.setName))]);
      setupAutocomplete('subtype-filter', 'subtype-autocomplete', () => {
        const subtypes = new Set();
        collection.forEach(c => {
          if (c.type_line) {
            // Extract subtypes (everything after the dash)
            const parts = c.type_line.split('—');
            if (parts[1]) {
              parts[1].trim().split(' ').forEach(subtype => {
                if (subtype) subtypes.add(subtype);
              });
            }
          }
        });
        return [...subtypes].sort();
      });
    });
  };
  document.head.appendChild(nouislider);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
