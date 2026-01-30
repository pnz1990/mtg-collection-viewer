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
  const response = await fetch('Collection.csv');
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
  const sort = document.getElementById('sort').value;
  const [priceMin, priceMax] = priceSlider ? priceSlider.get().map(Number) : [0, maxPriceValue];
  
  filteredCollection = collection.filter(card => {
    return card.name.toLowerCase().includes(search) &&
      (!setFilter || card.setName.toLowerCase().includes(setFilter)) &&
      (!rarity || card.rarity === rarity) &&
      (!foil || card.foil === foil) &&
      card.price >= priceMin && card.price <= priceMax;
  });
  
  filteredCollection.sort((a, b) => {
    switch(sort) {
      case 'name': return a.name.localeCompare(b.name);
      case 'rarity': return b.rarity.localeCompare(a.rarity);
      case 'set': return a.setName.localeCompare(b.setName);
      default: return (b.price * b.quantity) - (a.price * a.quantity);
    }
  });
  
  updateStats();
  if (typeof onFiltersApplied === 'function') {
    onFiltersApplied();
  }
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

// Load noUiSlider then collection
const nouislider = document.createElement('script');
nouislider.src = 'https://cdn.jsdelivr.net/npm/nouislider@15/dist/nouislider.min.js';
nouislider.onload = () => {
  loadCollection().then(() => {
    setupAutocomplete('search', 'search-autocomplete', () => [...new Set(collection.map(c => c.name))]);
    setupAutocomplete('set-filter', 'set-autocomplete', () => [...new Set(collection.map(c => c.setName))]);
  });
};
document.head.appendChild(nouislider);
