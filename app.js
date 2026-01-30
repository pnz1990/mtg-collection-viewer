let collection = [];
let filteredCollection = [];
const imageCache = new Map();
let charts = {};

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
  
  const maxPrice = Math.max(...collection.map(c => c.price));
  document.getElementById('price-max').max = Math.ceil(maxPrice);
  document.getElementById('price-min').max = Math.ceil(maxPrice);
  document.getElementById('price-max').value = Math.ceil(maxPrice);
  
  filteredCollection = [...collection];
  filteredCollection.sort((a, b) => a.name.localeCompare(b.name));
  updateStats();
  renderCharts();
  renderCollection();
  loadImages();
}

async function loadImages() {
  const batchSize = 10;
  for (let i = 0; i < filteredCollection.length; i += batchSize) {
    const batch = filteredCollection.slice(i, i + batchSize);
    await Promise.all(batch.map(async (card) => {
      if (imageCache.has(card.scryfallId)) return;
      try {
        const response = await fetch(`https://api.scryfall.com/cards/${card.scryfallId}`);
        const data = await response.json();
        const imageUrl = data.image_uris?.small || data.card_faces?.[0]?.image_uris?.small;
        if (imageUrl) {
          imageCache.set(card.scryfallId, imageUrl);
          const imgElement = document.querySelector(`[data-scryfall-id="${card.scryfallId}"] .card-image`);
          if (imgElement) imgElement.src = imageUrl;
        }
      } catch (e) {}
    }));
    await new Promise(r => setTimeout(r, 100));
  }
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
    const cachedImage = imageCache.get(card.scryfallId) || '';
    const foilClass = card.foil !== 'normal' ? card.foil : '';
    return `
    <div class="card ${foilClass}" data-scryfall-id="${card.scryfallId}">
      <a href="detail.html?id=${card.scryfallId}" class="card-link">
        <div class="card-image-wrapper">
          <div class="card-image-inner">
            <img src="${cachedImage}" alt="${card.name}" class="card-image">
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
  const priceMin = parseFloat(document.getElementById('price-min').value);
  const priceMax = parseFloat(document.getElementById('price-max').value);
  
  filteredCollection = collection.filter(card => {
    return card.name.toLowerCase().includes(search) &&
      (!setFilter || card.setName.toLowerCase().includes(setFilter)) &&
      (!rarity || card.rarity === rarity) &&
      (!foil || card.foil === foil) &&
      card.price >= priceMin && card.price <= priceMax;
  });
  
  filteredCollection.sort((a, b) => {
    switch(sort) {
      case 'value': return (b.price * b.quantity) - (a.price * a.quantity);
      case 'rarity': return b.rarity.localeCompare(a.rarity);
      case 'set': return a.setName.localeCompare(b.setName);
      default: return a.name.localeCompare(b.name);
    }
  });
  
  updateStats();
  renderCollection();
  loadImages();
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

function updatePriceLabel() {
  const min = document.getElementById('price-min').value;
  const max = document.getElementById('price-max').value;
  document.getElementById('price-min-val').textContent = min;
  document.getElementById('price-max-val').textContent = max == document.getElementById('price-max').max ? '∞' : max;
}

// Event listeners
document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('set-filter').addEventListener('input', applyFilters);
document.getElementById('rarity-filter').addEventListener('change', applyFilters);
document.getElementById('foil-filter').addEventListener('change', applyFilters);
document.getElementById('sort').addEventListener('change', applyFilters);
document.getElementById('price-min').addEventListener('input', () => { updatePriceLabel(); applyFilters(); });
document.getElementById('price-max').addEventListener('input', () => { updatePriceLabel(); applyFilters(); });

setupAutocomplete('search', 'search-autocomplete', () => [...new Set(collection.map(c => c.name))]);
setupAutocomplete('set-filter', 'set-autocomplete', () => [...new Set(collection.map(c => c.setName))]);

// Load Chart.js then collection
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
script.onload = loadCollection;
document.head.appendChild(script);
