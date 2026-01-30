let collection = [];
let filteredCollection = [];
let charts = {};
let imageObserver;
let db;
let priceSlider;
let maxPriceValue = 200;
let currentView = 'list';
let binderPage = 0;
let carouselIndex = 0;
const CARDS_PER_BINDER_PAGE = 18;

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

async function fetchCardImage(scryfallId, size = 'small') {
  const cacheKey = `${scryfallId}_${size}`;
  // Check cache first
  const cached = await getCachedImage(cacheKey);
  if (cached) return cached;
  
  // Fetch from API with delay to avoid throttling
  await new Promise(r => setTimeout(r, 100));
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

function setupImageObserver() {
  imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(async entry => {
      if (!entry.isIntersecting) return;
      const wrapper = entry.target;
      const img = wrapper.querySelector('.card-image');
      const scryfallId = wrapper.closest('.card').dataset.scryfallId;
      
      if (img.src) return; // Already loaded
      imageObserver.unobserve(wrapper);
      
      const url = await fetchCardImage(scryfallId);
      if (url) img.src = url;
    });
  }, { rootMargin: '200px' }); // Load 200px before visible
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
        language: parts[13]
      };
    });
  
  maxPriceValue = Math.ceil(Math.max(...collection.map(c => c.price)));
  setupPriceSlider();
  
  filteredCollection = [...collection];
  filteredCollection.sort((a, b) => (b.price * b.quantity) - (a.price * a.quantity));
  setupImageObserver();
  updateStats();
  renderCharts();
  renderCollection();
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

function updateStats() {
  const totalCards = filteredCollection.reduce((sum, c) => sum + c.quantity, 0);
  const totalValue = filteredCollection.reduce((sum, c) => sum + c.price * c.quantity, 0);
  document.getElementById('total-cards').textContent = totalCards;
  document.getElementById('total-value').textContent = `$${totalValue.toFixed(2)}`;
}

function countBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    acc[k] = (acc[k] || 0) + item.quantity;
    return acc;
  }, {});
}

function getPriceRange(price) {
  if (price < 5) return '<$5';
  if (price < 20) return '$5-20';
  if (price < 50) return '$20-50';
  if (price < 100) return '$50-100';
  return '$100+';
}

function renderCharts() {
  const colors = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FFEB3B', '#795548'];
  
  const createChart = (id, data, label) => {
    const ctx = document.getElementById(id).getContext('2d');
    if (charts[id]) charts[id].destroy();
    const labels = Object.keys(data);
    const values = Object.values(data);
    charts[id] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { color: '#e0e0e0', boxWidth: 12, padding: 8 } } },
        animation: { animateRotate: true, duration: 800 }
      }
    });
  };
  
  createChart('rarity-chart', countBy(collection, 'rarity'));
  const setCounts = countBy(collection, 'setName');
  const topSets = Object.entries(setCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const otherCount = Object.entries(setCounts).slice(6).reduce((s, [, v]) => s + v, 0);
  const setData = Object.fromEntries(topSets);
  if (otherCount > 0) setData['Other'] = otherCount;
  createChart('set-chart', setData);
  createChart('finish-chart', countBy(collection, 'foil'));
  createChart('price-chart', countBy(collection, c => getPriceRange(c.price)));
}

function renderCollection() {
  const container = document.getElementById('collection');
  container.innerHTML = filteredCollection.map(card => {
    const foilClass = card.foil !== 'normal' ? card.foil : '';
    return `
    <div class="card ${foilClass}" data-scryfall-id="${card.scryfallId}">
      <a href="detail.html?id=${card.scryfallId}" class="card-link">
        <div class="card-image-wrapper">
          <div class="card-image-inner">
            <img alt="${card.name}" class="card-image">
            <img src="back.png" alt="Card back" class="card-back">
          </div>
        </div>
        <div class="card-header">
          <div class="card-name">${card.name}</div>
          <div class="card-value">$${(card.price * card.quantity).toFixed(2)}</div>
        </div>
        <div class="card-set">${card.setName} (${card.setCode})</div>
        <div class="card-details">
          <span class="badge rarity-${card.rarity}">${card.rarity}</span>
          ${card.foil !== 'normal' ? `<span class="badge foil-${card.foil}">${card.foil}</span>` : ''}
          ${card.quantity > 1 ? `<span class="badge quantity">x${card.quantity}</span>` : ''}
        </div>
      </a>
    </div>`;
  }).join('');
  
  // Observe images for lazy loading
  container.querySelectorAll('.card-image-wrapper').forEach(wrapper => {
    imageObserver.observe(wrapper);
    
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
    wrapper.addEventListener('touchstart', startDrag, { passive: false });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove);
    wrapper.addEventListener('click', e => { if (hasMoved) e.preventDefault(); });
  });
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
  binderPage = 0;
  carouselIndex = 0;
  if (currentView === 'list') renderCollection();
  else if (currentView === 'binder') renderBinder();
  else renderCarousel();
}

function renderBinder(direction = null) {
  const leftPage = document.querySelector('.binder-page-left');
  const rightPage = document.querySelector('.binder-page-right');
  const pagesContainer = document.querySelector('.binder-pages');
  
  const renderPageCards = (cards) => cards.map(card => {
    const foilClass = card.foil !== 'normal' ? card.foil : '';
    return `
      <div class="binder-card ${foilClass}" data-scryfall-id="${card.scryfallId}">
        <a href="detail.html?id=${card.scryfallId}">
          <img alt="${card.name}" class="card-image">
        </a>
      </div>
    `}).join('') + Array(Math.max(0, 9 - cards.length)).fill('<div class="binder-card"></div>').join('');
  
  const loadImages = () => {
    document.querySelectorAll('.binder-card[data-scryfall-id]').forEach(card => {
      const img = card.querySelector('img');
      const id = card.dataset.scryfallId;
      fetchCardImage(id).then(url => { if (url) img.src = url; });
    });
  };
  
  const updateNav = () => {
    const start = binderPage * CARDS_PER_BINDER_PAGE;
    document.getElementById('binder-page-num').textContent = `${binderPage + 1} / ${Math.ceil(filteredCollection.length / CARDS_PER_BINDER_PAGE) || 1}`;
    document.querySelector('.binder-prev').disabled = binderPage === 0;
    document.querySelector('.binder-next').disabled = start + CARDS_PER_BINDER_PAGE >= filteredCollection.length;
  };
  
  if (direction === 'next') {
    const prevStart = (binderPage - 1) * CARDS_PER_BINDER_PAGE;
    const prevCards = filteredCollection.slice(prevStart, prevStart + CARDS_PER_BINDER_PAGE);
    const currStart = binderPage * CARDS_PER_BINDER_PAGE;
    const currCards = filteredCollection.slice(currStart, currStart + CARDS_PER_BINDER_PAGE);
    
    // Show new pages underneath
    leftPage.innerHTML = renderPageCards(currCards.slice(0, 9));
    rightPage.innerHTML = renderPageCards(currCards.slice(9, 18));
    
    // Create flipping page with front (old right) and back (new left)
    const flipPage = document.createElement('div');
    flipPage.className = 'flip-page flip-page-next';
    flipPage.innerHTML = `
      <div class="flip-page-inner">
        <div class="flip-page-front">${renderPageCards(prevCards.slice(9, 18))}</div>
        <div class="flip-page-back">${renderPageCards(currCards.slice(0, 9))}</div>
      </div>
    `;
    pagesContainer.appendChild(flipPage);
    
    loadImages();
    
    requestAnimationFrame(() => {
      flipPage.classList.add('flipping');
      flipPage.addEventListener('animationend', () => flipPage.remove(), { once: true });
    });
    
  } else if (direction === 'prev') {
    const nextStart = (binderPage + 1) * CARDS_PER_BINDER_PAGE;
    const nextCards = filteredCollection.slice(nextStart, nextStart + CARDS_PER_BINDER_PAGE);
    const currStart = binderPage * CARDS_PER_BINDER_PAGE;
    const currCards = filteredCollection.slice(currStart, currStart + CARDS_PER_BINDER_PAGE);
    
    // Show new pages underneath
    leftPage.innerHTML = renderPageCards(currCards.slice(0, 9));
    rightPage.innerHTML = renderPageCards(currCards.slice(9, 18));
    
    // Create flipping page with front (new right) and back (old left)
    const flipPage = document.createElement('div');
    flipPage.className = 'flip-page flip-page-prev';
    flipPage.innerHTML = `
      <div class="flip-page-inner">
        <div class="flip-page-front">${renderPageCards(currCards.slice(9, 18))}</div>
        <div class="flip-page-back">${renderPageCards(nextCards.slice(0, 9))}</div>
      </div>
    `;
    pagesContainer.appendChild(flipPage);
    
    loadImages();
    
    requestAnimationFrame(() => {
      flipPage.classList.add('flipping');
      flipPage.addEventListener('animationend', () => flipPage.remove(), { once: true });
    });
    
  } else {
    const start = binderPage * CARDS_PER_BINDER_PAGE;
    const pageCards = filteredCollection.slice(start, start + CARDS_PER_BINDER_PAGE);
    leftPage.innerHTML = renderPageCards(pageCards.slice(0, 9));
    rightPage.innerHTML = renderPageCards(pageCards.slice(9, 18));
    loadImages();
  }
  
  updateNav();
}

function setView(view) {
  currentView = view;
  document.getElementById('list-view').classList.toggle('active', view === 'list');
  document.getElementById('binder-view').classList.toggle('active', view === 'binder');
  document.getElementById('carousel-view').classList.toggle('active', view === 'carousel');
  document.getElementById('collection').classList.toggle('hidden', view !== 'list');
  document.getElementById('binder').classList.toggle('hidden', view !== 'binder');
  document.getElementById('carousel').classList.toggle('hidden', view !== 'carousel');
  if (view === 'list') renderCollection();
  else if (view === 'binder') renderBinder();
  else renderCarousel();
}

function renderCarousel() {
  const container = document.querySelector('.carousel-cards');
  const visibleCount = 5;
  const start = Math.max(0, carouselIndex - 2);
  const end = Math.min(filteredCollection.length, start + visibleCount);
  const visibleCards = filteredCollection.slice(start, end);
  
  container.innerHTML = visibleCards.map((card, i) => {
    const actualIndex = start + i;
    const isActive = actualIndex === carouselIndex;
    const isAdjacent = Math.abs(actualIndex - carouselIndex) === 1;
    const foilClass = card.foil !== 'normal' ? card.foil : '';
    return `
      <div class="carousel-card ${isActive ? 'active' : ''} ${isAdjacent ? 'adjacent' : ''} ${foilClass}" data-index="${actualIndex}" data-scryfall-id="${card.scryfallId}">
        <a href="detail.html?id=${card.scryfallId}">
          <img alt="${card.name}" class="card-image">
        </a>
        <div class="carousel-card-info">
          <div class="carousel-card-name">${card.name}</div>
          <div class="carousel-card-price">$${(card.price * card.quantity).toFixed(2)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('carousel-current').textContent = carouselIndex + 1;
  document.getElementById('carousel-total').textContent = filteredCollection.length;
  document.querySelector('.carousel-prev').disabled = carouselIndex === 0;
  document.querySelector('.carousel-next').disabled = carouselIndex >= filteredCollection.length - 1;
  
  // Load images (use normal size for center card)
  container.querySelectorAll('.carousel-card').forEach(card => {
    const img = card.querySelector('img');
    const id = card.dataset.scryfallId;
    const isActive = card.classList.contains('active');
    fetchCardImage(id, isActive ? 'normal' : 'small').then(url => { if (url) img.src = url; });
  });
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

document.getElementById('list-view').addEventListener('click', () => setView('list'));
document.getElementById('binder-view').addEventListener('click', () => setView('binder'));
document.getElementById('carousel-view').addEventListener('click', () => setView('carousel'));
document.querySelector('.binder-prev').addEventListener('click', () => { binderPage--; renderBinder('prev'); });
document.querySelector('.binder-next').addEventListener('click', () => { binderPage++; renderBinder('next'); });
document.querySelector('.carousel-prev').addEventListener('click', () => { carouselIndex--; renderCarousel(); });
document.querySelector('.carousel-next').addEventListener('click', () => { carouselIndex++; renderCarousel(); });

setupAutocomplete('search', 'search-autocomplete', () => [...new Set(collection.map(c => c.name))]);
setupAutocomplete('set-filter', 'set-autocomplete', () => [...new Set(collection.map(c => c.setName))]);

// Load libraries then collection
const nouislider = document.createElement('script');
nouislider.src = 'https://cdn.jsdelivr.net/npm/nouislider@15/dist/nouislider.min.js';
nouislider.onload = () => {
  const chartjs = document.createElement('script');
  chartjs.src = 'https://cdn.jsdelivr.net/npm/chart.js';
  chartjs.onload = loadCollection;
  document.head.appendChild(chartjs);
};
document.head.appendChild(nouislider);
