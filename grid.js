// Grid view specific code
let imageObserver;
let charts = {};

function setupImageObserver() {
  imageObserver = new IntersectionObserver((entries) => {
    entries.forEach(async entry => {
      if (!entry.isIntersecting) return;
      const wrapper = entry.target;
      const img = wrapper.querySelector('.card-image');
      const scryfallId = wrapper.closest('.card').dataset.scryfallId;
      
      if (img.src) return;
      imageObserver.unobserve(wrapper);
      
      const url = await fetchCardImage(scryfallId);
      if (url) img.src = url;
    });
  }, { rootMargin: '200px' });
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
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
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
          <div class="card-value">${formatPrice(card.price * card.quantity, card.currency)}</div>
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

function onCollectionLoaded() {
  setupImageObserver();
  renderCharts();
  renderAchievements();
  renderCollection();
  
  document.getElementById('random-card')?.addEventListener('click', () => {
    const randomCard = collection[Math.floor(Math.random() * collection.length)];
    window.location.href = `detail.html?id=${randomCard.scryfallId}&reveal=1`;
  });
}

function renderAchievements() {
  const container = document.getElementById('achievements');
  if (!container) return;
  
  const totalCards = collection.reduce((sum, c) => sum + c.quantity, 0);
  const totalValue = collection.reduce((sum, c) => sum + c.price * c.quantity, 0);
  const uniqueSets = new Set(collection.map(c => c.setCode)).size;
  const rarities = { mythic: 0, rare: 0, uncommon: 0, common: 0 };
  const foils = { foil: 0, etched: 0 };
  let maxPrice = 0, languages = new Set();
  
  collection.forEach(c => {
    rarities[c.rarity] = (rarities[c.rarity] || 0) + c.quantity;
    if (c.foil !== 'normal') foils[c.foil] = (foils[c.foil] || 0) + c.quantity;
    if (c.price > maxPrice) maxPrice = c.price;
    languages.add(c.language);
  });
  
  const badges = [
    { icon: '🃏', name: 'Collector', desc: '100+ cards', unlocked: totalCards >= 100 },
    { icon: '📚', name: 'Librarian', desc: '500+ cards', unlocked: totalCards >= 500 },
    { icon: '🏛️', name: 'Archivist', desc: '1000+ cards', unlocked: totalCards >= 1000 },
    { icon: '💎', name: 'Mythic Hunter', desc: '10+ mythics', unlocked: rarities.mythic >= 10 },
    { icon: '👑', name: 'Mythic Hoarder', desc: '50+ mythics', unlocked: rarities.mythic >= 50 },
    { icon: '⭐', name: 'Rare Collector', desc: '100+ rares', unlocked: rarities.rare >= 100 },
    { icon: '✨', name: 'Shiny Lover', desc: '25+ foils', unlocked: foils.foil >= 25 },
    { icon: '🌟', name: 'Bling Master', desc: '100+ foils', unlocked: foils.foil >= 100 },
    { icon: '🔮', name: 'Etched Elite', desc: '10+ etched', unlocked: foils.etched >= 10 },
    { icon: '💰', name: 'Big Spender', desc: 'Card over $50', unlocked: maxPrice >= 50 },
    { icon: '💵', name: 'Whale', desc: 'Card over $100', unlocked: maxPrice >= 100 },
    { icon: '🏦', name: 'Vault Keeper', desc: '$500+ total value', unlocked: totalValue >= 500 },
    { icon: '🗺️', name: 'Set Explorer', desc: '10+ different sets', unlocked: uniqueSets >= 10 },
    { icon: '🌍', name: 'World Traveler', desc: '25+ sets', unlocked: uniqueSets >= 25 },
    { icon: '🌐', name: 'Polyglot', desc: '3+ languages', unlocked: languages.size >= 3 },
  ];
  
  container.innerHTML = badges.map(b => `
    <div class="badge ${b.unlocked ? 'unlocked' : 'locked'}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
      <span class="badge-tooltip">${b.desc}</span>
    </div>
  `).join('');
  
  // Toggle tooltip on tap for mobile
  container.querySelectorAll('.badge').forEach(badge => {
    badge.addEventListener('click', () => badge.classList.toggle('show-tooltip'));
  });
}

function onFiltersApplied() {
  renderCollection();
}

// Load Chart.js
const chartjs = document.createElement('script');
chartjs.src = 'https://cdn.jsdelivr.net/npm/chart.js';
document.head.appendChild(chartjs);
