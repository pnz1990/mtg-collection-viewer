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
  renderCollection();
}

function onFiltersApplied() {
  renderCollection();
}

// Load Chart.js
const chartjs = document.createElement('script');
chartjs.src = 'https://cdn.jsdelivr.net/npm/chart.js';
document.head.appendChild(chartjs);
