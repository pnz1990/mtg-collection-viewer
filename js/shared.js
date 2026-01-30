// Shared state and functions
let collection = [];
let filteredCollection = [];
let db;
let priceSlider;
let maxPriceValue = 200;
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
          reserved: cardData.reserved || false
        };
        
        await cacheCardData(cardData.id, extracted);
        
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
  const dupeClass = nameCounts[card.name] >= 2 ? 'duplicate' : '';
  const setIcon = `https://svgs.scryfall.io/sets/${card.setCode.toLowerCase()}.svg`;
  const mainType = getMainType(card.type_line);
  const keywordTags = (card.keywords || []).slice(0, 3).map(k => `<span class="badge keyword-badge clickable" data-filter="keyword" data-value="${k}">${k}</span>`).join('');
  return `
  <div class="card ${foilClass} ${dupeClass}" data-scryfall-id="${card.scryfallId}">
    <a href="detail.html?id=${card.scryfallId}" class="card-link">
      <div class="card-image-wrapper">
        <div class="card-image-inner">
          <img alt="${card.name}" class="card-image">
          <img src="images/back.png" alt="Card back" class="card-back">
        </div>
      </div>
      <div class="card-header">
        <div class="card-name">${card.name}</div>
        <div class="card-value">${formatPrice(card.price * card.quantity, card.currency)}</div>
      </div>
      <div class="card-set clickable" data-filter="set" data-value="${card.setName}"><img src="${setIcon}" class="set-icon" alt="${card.setCode}">${card.setName}</div>
      <div class="card-details">
        <span class="badge rarity-${card.rarity} clickable" data-filter="rarity" data-value="${card.rarity}">${card.rarity}</span>
        ${card.foil !== 'normal' ? `<span class="badge foil-${card.foil} clickable" data-filter="foil" data-value="${card.foil}">${card.foil}</span>` : ''}
        ${card.reserved ? `<span class="badge reserved-badge clickable" data-filter="reserved" data-value="yes">RL</span>` : ''}
        ${mainType ? `<span class="badge type-badge clickable" data-filter="type" data-value="${mainType}">${mainType}</span>` : ''}
        ${card.cmc !== undefined && !card.type_line?.includes('Land') ? `<span class="badge cmc-badge clickable" data-filter="cmc" data-value="${card.cmc}">⬡${card.cmc}</span>` : ''}
        ${nameCounts[card.name] >= 2 ? `<span class="badge duplicate-badge">x${nameCounts[card.name]}</span>` : ''}
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
      inner.style.transform = `rotateX(${-y * 25}deg) rotateY(${x * 25}deg)`;
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
      applyFilters();
    });
  });
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
  const symbols = { USD: '$', CAD: 'CA$', EUR: '€', GBP: '£', AUD: 'A$', JPY: '¥' };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${price.toFixed(2)}`;
}

function updateStats() {
  const totalCards = filteredCollection.reduce((sum, c) => sum + c.quantity, 0);
  const totalValue = filteredCollection.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const currency = collection[0]?.currency || 'USD';
  document.getElementById('total-cards').textContent = totalCards;
  document.getElementById('total-value').textContent = formatPrice(totalValue, currency);
}

async function loadCollection() {
  const response = await fetch('data/Collection.csv');
  const text = await response.text();
  const lines = text.split('\n').slice(1);
  
  collection = lines
    .filter(line => line.trim())
    .map(line => {
      const parts = parseCSVLine(line);
      return {
        name: parts[0],
        setCode: parts[1],
        setName: parts[2],
        collectorNumber: parts[3],
        foil: parts[4],
        rarity: parts[5],
        quantity: parseInt(parts[6]) || 1,
        scryfallId: parts[8],
        price: parseFloat(parts[9]) || 0,
        condition: parts[12],
        language: parts[13],
        currency: parts[14] || 'USD'
      };
    });
  
  maxPriceValue = Math.ceil(Math.max(...collection.map(c => c.price)));
  setupPriceSlider();
  
  filteredCollection = [...collection];
  filteredCollection.sort((a, b) => (b.price * b.quantity) - (a.price * a.quantity));
  updateStats();
  
  // Load cached full data if available
  for (const card of collection) {
    const cached = await getCardData(card.scryfallId);
    if (cached) Object.assign(card, cached);
  }
  
  populateKeywordFilter();
  
  if (typeof onCollectionLoaded === 'function') {
    onCollectionLoaded();
  }
  
  return collection;
}

function setupPriceSlider() {
  const slider = document.getElementById('price-range');
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
  const search = document.getElementById('search').value.toLowerCase();
  const setFilter = document.getElementById('set-filter').value.toLowerCase();
  const rarity = document.getElementById('rarity-filter').value;
  const foil = document.getElementById('foil-filter').value;
  const typeFilter = document.getElementById('type-filter')?.value || '';
  const colorFilter = document.getElementById('color-filter')?.value || '';
  const keywordFilter = document.getElementById('keyword-filter')?.value || '';
  const reservedFilter = document.getElementById('reserved-filter')?.value || '';
  const sort = document.getElementById('sort').value;
  const [priceMin, priceMax] = priceSlider ? priceSlider.get().map(Number) : [0, maxPriceValue];
  const cmcFilter = window.cmcFilter;
  
  // Get selected color identity
  const colorIdentityChecks = document.querySelectorAll('.color-checkboxes input:checked');
  const selectedColors = [...colorIdentityChecks].map(c => c.value);
  
  filteredCollection = collection.filter(card => {
    const matchesType = !typeFilter || (card.type_line && card.type_line.includes(typeFilter));
    const matchesColor = !colorFilter || matchCardColor(card, colorFilter);
    const matchesIdentity = selectedColors.length === 0 || matchColorIdentity(card, selectedColors);
    const matchesKeyword = !keywordFilter || (card.keywords && card.keywords.includes(keywordFilter));
    const matchesCmc = cmcFilter === undefined || (cmcFilter === 6 ? card.cmc >= 6 : card.cmc === cmcFilter);
    const matchesReserved = !reservedFilter || (reservedFilter === 'yes' ? card.reserved : !card.reserved);
    
    return card.name.toLowerCase().includes(search) &&
      (!setFilter || card.setName.toLowerCase().includes(setFilter)) &&
      (!rarity || card.rarity === rarity) &&
      (!foil || card.foil === foil) &&
      matchesType &&
      matchesColor &&
      matchesIdentity &&
      matchesKeyword &&
      matchesCmc &&
      matchesReserved &&
      card.price >= priceMin && card.price <= priceMax;
  });
  
  if (sort !== 'recent') {
    filteredCollection.sort((a, b) => {
      switch(sort) {
        case 'name': return a.name.localeCompare(b.name);
        case 'rarity': return b.rarity.localeCompare(a.rarity);
        case 'set': return a.setName.localeCompare(b.setName);
        default: return (b.price * b.quantity) - (a.price * a.quantity);
      }
    });
  }
  
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
document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('set-filter').addEventListener('input', applyFilters);
document.getElementById('rarity-filter').addEventListener('change', applyFilters);
document.getElementById('foil-filter').addEventListener('change', applyFilters);
document.getElementById('sort').addEventListener('change', applyFilters);
document.getElementById('type-filter')?.addEventListener('change', applyFilters);
document.getElementById('color-filter')?.addEventListener('change', applyFilters);
document.getElementById('keyword-filter')?.addEventListener('change', applyFilters);
document.getElementById('reserved-filter')?.addEventListener('change', applyFilters);
document.querySelectorAll('.color-checkboxes input').forEach(cb => cb.addEventListener('change', applyFilters));

document.getElementById('clear-filters')?.addEventListener('click', () => {
  document.getElementById('search').value = '';
  document.getElementById('set-filter').value = '';
  document.getElementById('rarity-filter').value = '';
  document.getElementById('foil-filter').value = '';
  document.getElementById('type-filter') && (document.getElementById('type-filter').value = '');
  document.getElementById('color-filter') && (document.getElementById('color-filter').value = '');
  document.getElementById('keyword-filter') && (document.getElementById('keyword-filter').value = '');
  document.getElementById('reserved-filter') && (document.getElementById('reserved-filter').value = '');
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
    menuLoadBtn.textContent = '📥 Loading...';
    await loadFullCardData(null, true);
    updateMenuLoadBtn();
    populateKeywordFilter();
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
  const nouislider = document.createElement('script');
  nouislider.src = 'https://cdn.jsdelivr.net/npm/nouislider@15/dist/nouislider.min.js';
  nouislider.onload = () => {
    loadCollection().then(() => {
      setupAutocomplete('search', 'search-autocomplete', () => [...new Set(collection.map(c => c.name))]);
      setupAutocomplete('set-filter', 'set-autocomplete', () => [...new Set(collection.map(c => c.setName))]);
    });
  };
  document.head.appendChild(nouislider);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
