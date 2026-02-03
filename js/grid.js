// Grid view specific code
let imageObserver;
let charts = {};
const CARDS_PER_PAGE = 30;
let displayedCards = 0;

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
  }, { rootMargin: '400px' });
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
  
  const createChart = (id, data, type = 'doughnut', onClick) => {
    const canvas = document.getElementById(id);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (charts[id]) charts[id].destroy();
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    const config = type === 'bar' ? {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }]
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#e0e0e0' }, grid: { color: '#333' } },
          y: { ticks: { color: '#e0e0e0' }, grid: { display: false } }
        },
        onClick: (e, els) => { if (els.length && onClick) onClick(labels[els[0].index]); }
      }
    } : {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 0 }]
      },
      options: {
        responsive: true,
        plugins: { 
          legend: { 
            position: 'bottom', 
            labels: { color: '#e0e0e0', boxWidth: 12, padding: 8 },
            onClick: (e, item, legend) => { if (onClick) onClick(item.text); }
          } 
        },
        animation: { animateRotate: true, duration: 800 },
        onClick: (e, els) => { if (els.length && onClick) onClick(labels[els[0].index]); }
      }
    };
    charts[id] = new Chart(ctx, config);
  };
  
  createChart('rarity-chart', countBy(collection, 'rarity'), 'doughnut', v => {
    document.getElementById('rarity-filter').value = v;
    applyFilters();
  });
  
  const setCounts = countBy(collection, 'setName');
  const topSets = Object.entries(setCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  createChart('set-chart', Object.fromEntries(topSets), 'doughnut', v => {
    document.getElementById('set-filter').value = v;
    applyFilters();
  });
  
  createChart('finish-chart', countBy(collection, 'foil'), 'doughnut', v => {
    document.getElementById('foil-filter').value = v;
    applyFilters();
  });
  
  createChart('price-chart', countBy(collection, c => getPriceRange(getCardPrice(c))), 'doughnut', v => {
    const ranges = { '<$5': [0,5], '$5-20': [5,20], '$20-50': [20,50], '$50-100': [50,100], '$100+': [100, maxPriceValue] };
    if (ranges[v] && priceSlider) { priceSlider.set(ranges[v]); applyFilters(); }
  });
  
  // Value by set (bar chart)
  const setValues = {};
  collection.forEach(c => {
    setValues[c.setName] = (setValues[c.setName] || 0) + getCardPrice(c) * c.quantity;
  });
  const topSetValues = Object.entries(setValues).sort((a, b) => b[1] - a[1]).slice(0, 6);
  createChart('set-value-chart', Object.fromEntries(topSetValues.map(([k, v]) => [k, Math.round(v)])), 'bar', v => {
    document.getElementById('set-filter').value = v;
    applyFilters();
  });
  
  // Price stats
  const prices = collection.map(c => getCardPrice(c)).sort((a, b) => a - b);
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
  const median = prices.length % 2 ? prices[Math.floor(prices.length / 2)] : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2;
  const currency = getPriceSource() === 'scryfall' ? 'USD' : (collection[0]?.currency || 'USD');
  
  document.getElementById('stat-avg').textContent = formatPrice(avg, currency);
  document.getElementById('stat-median').textContent = formatPrice(median, currency);
  document.getElementById('stat-max').textContent = formatPrice(prices[prices.length - 1], currency);
  document.getElementById('stat-min').textContent = formatPrice(prices[0], currency);
  
  // By condition
  createChart('condition-chart', countBy(collection, 'condition'));
  
  // Value by rarity (bar chart)
  const rarityValues = {};
  collection.forEach(c => {
    rarityValues[c.rarity] = (rarityValues[c.rarity] || 0) + getCardPrice(c) * c.quantity;
  });
  const rarityOrder = ['mythic', 'rare', 'uncommon', 'common'];
  const sortedRarityValues = Object.fromEntries(
    rarityOrder.filter(r => rarityValues[r]).map(r => [r, Math.round(rarityValues[r])])
  );
  createChart('rarity-value-chart', sortedRarityValues, 'bar', v => {
    document.getElementById('rarity-filter').value = v;
    applyFilters();
  });
  
  // Full data charts (only if loaded)
  if (isFullDataLoaded()) {
    document.getElementById('type-chart-box').style.display = '';
    document.getElementById('color-chart-box').style.display = '';
    document.getElementById('cmc-chart-box').style.display = '';
    
    // By Type
    const types = {};
    collection.forEach(c => {
      if (!c.type_line) return;
      const mainType = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Planeswalker', 'Battle']
        .find(t => c.type_line.includes(t)) || 'Other';
      types[mainType] = (types[mainType] || 0) + c.quantity;
    });
    createChart('type-chart', types, 'doughnut', v => {
      document.getElementById('type-filter').value = v;
      applyFilters();
    });
    
    // By Color
    const colorNames = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
    const colorMap = { White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G', Colorless: 'C', Multi: 'M' };
    const colorCounts = { White: 0, Blue: 0, Black: 0, Red: 0, Green: 0, Colorless: 0, Multi: 0 };
    collection.forEach(c => {
      if (!c.colors) return;
      if (c.colors.length === 0) colorCounts.Colorless += c.quantity;
      else if (c.colors.length > 1) colorCounts.Multi += c.quantity;
      else colorCounts[colorNames[c.colors[0]]] += c.quantity;
    });
    createChart('color-chart', Object.fromEntries(Object.entries(colorCounts).filter(([,v]) => v > 0)), 'doughnut', v => {
      document.getElementById('color-filter').value = colorMap[v] || '';
      applyFilters();
    });
    
    // Mana Curve
    const cmcCounts = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
    collection.forEach(c => {
      if (c.cmc === undefined || (c.type_line && c.type_line.includes('Land'))) return;
      const bucket = c.cmc >= 6 ? '6+' : String(Math.floor(c.cmc));
      cmcCounts[bucket] += c.quantity;
    });
    createChart('cmc-chart', cmcCounts, 'bar', v => {
      window.cmcFilter = v === '6+' ? 6 : parseInt(v);
      applyFilters();
    });
    
    // Avg CMC by Type
    document.getElementById('avg-cmc-chart-box').style.display = '';
    const typeCmc = {};
    const typeCount = {};
    collection.forEach(c => {
      if (c.cmc === undefined || !c.type_line || c.type_line.includes('Land')) return;
      const mainType = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker']
        .find(t => c.type_line.includes(t)) || 'Other';
      typeCmc[mainType] = (typeCmc[mainType] || 0) + c.cmc * c.quantity;
      typeCount[mainType] = (typeCount[mainType] || 0) + c.quantity;
    });
    const avgCmc = {};
    for (const type of Object.keys(typeCmc)) {
      avgCmc[type] = Math.round((typeCmc[type] / typeCount[type]) * 10) / 10;
    }
    createChart('avg-cmc-chart', avgCmc, 'bar');
    
    // Reserved List charts
    const reservedCards = collection.filter(c => c.reserved);
    if (reservedCards.length > 0) {
      document.getElementById('reserved-count-box').style.display = '';
      document.getElementById('reserved-value-box').style.display = '';
      document.getElementById('reserved-type-box').style.display = '';
      document.getElementById('reserved-top-box').style.display = '';
      
      // Reserved count vs non-reserved
      createChart('reserved-count-chart', {
        'Reserved': reservedCards.length,
        'Non-Reserved': collection.length - reservedCards.length
      }, 'doughnut', v => {
        document.getElementById('reserved-filter').value = v === 'Reserved' ? 'yes' : 'no';
        applyFilters();
      });
      
      // Reserved value vs non-reserved
      const reservedValue = reservedCards.reduce((s, c) => s + getCardPrice(c) * c.quantity, 0);
      const totalValue = collection.reduce((s, c) => s + getCardPrice(c) * c.quantity, 0);
      createChart('reserved-value-chart', {
        'Reserved': Math.round(reservedValue),
        'Non-Reserved': Math.round(totalValue - reservedValue)
      }, 'doughnut', v => {
        document.getElementById('reserved-filter').value = v === 'Reserved' ? 'yes' : 'no';
        applyFilters();
      });
      
      // Reserved by type
      const rlTypes = {};
      reservedCards.forEach(c => {
        const t = getMainType(c.type_line) || 'Other';
        rlTypes[t] = (rlTypes[t] || 0) + c.quantity;
      });
      createChart('reserved-type-chart', rlTypes, 'doughnut', v => {
        document.getElementById('reserved-filter').value = 'yes';
        document.getElementById('type-filter').value = v === 'Other' ? '' : v;
        applyFilters();
      });
      
      // Top reserved by value
      const topRL = [...reservedCards].sort((a, b) => b.price - a.price).slice(0, 6);
      createChart('reserved-top-chart', Object.fromEntries(topRL.map(c => [c.name, Math.round(c.price)])), 'bar');
    }
  }
}

function renderCollection(append = false) {
  const container = document.getElementById('collection');
  const loadMoreBtn = document.getElementById('load-more');
  
  if (!append) {
    displayedCards = 0;
    container.innerHTML = '';
  }
  
  // Count duplicates by name
  const nameCounts = {};
  filteredCollection.forEach(c => {
    nameCounts[c.name] = (nameCounts[c.name] || 0) + c.quantity;
  });
  
  const cardsToShow = filteredCollection.slice(displayedCards, displayedCards + CARDS_PER_PAGE);
  const html = cardsToShow.map(card => renderCardHTML(card, nameCounts)).join('');
  
  if (append) {
    container.insertAdjacentHTML('beforeend', html);
  } else {
    container.innerHTML = html;
  }
  
  displayedCards += cardsToShow.length;
  
  // Show/hide load more button
  if (loadMoreBtn) {
    loadMoreBtn.style.display = displayedCards < filteredCollection.length ? 'block' : 'none';
  }
  
  // Observe new images for lazy loading
  const newCards = container.querySelectorAll('.card:not([data-observed])');
  newCards.forEach(card => {
    card.dataset.observed = '1';
    const wrapper = card.querySelector('.card-image-wrapper');
    if (wrapper) imageObserver.observe(wrapper);
  });
  
  // Setup interactions for new cards
  setupCardInteractions(container);
}

async function onCollectionLoaded() {
  setupImageObserver();
  
  // Setup collapsible sections
  document.getElementById('charts-toggle')?.addEventListener('click', function() {
    this.classList.toggle('expanded');
    document.getElementById('dashboard').classList.toggle('collapsed');
  });
  document.getElementById('achievements-toggle')?.addEventListener('click', function() {
    this.classList.toggle('expanded');
    document.getElementById('achievements').classList.toggle('collapsed');
  });
  
  // Load more button
  document.getElementById('load-more')?.addEventListener('click', () => renderCollection(true));
  
  // Wait for Chart.js if not ready
  const initCharts = () => {
    if (typeof Chart !== 'undefined') {
      renderCharts();
    } else {
      setTimeout(initCharts, 50);
    }
  };
  initCharts();
  
  renderAchievements();
  renderCollection();
  
  document.getElementById('random-card')?.addEventListener('click', () => {
    const randomCard = collection[Math.floor(Math.random() * collection.length)];
    window.location.href = `detail.html?id=${randomCard.scryfallId}&reveal=1`;
  });
  
  // Load full data button
  const loadBtn = document.getElementById('load-full-data');
  if (loadBtn) {
    updateLoadButton();
    
    loadBtn.addEventListener('click', async () => {
      loadBtn.classList.add('loading');
      loadBtn.classList.remove('loaded');
      loadBtn.textContent = '📥 Loading... 0%';
      
      await loadFullCardData((done, total) => {
        const pct = Math.round((done / total) * 100);
        loadBtn.textContent = `📥 Loading... ${pct}%`;
      }, true); // force refresh
      
      updateLoadButton();
      renderCharts();
      renderAchievements();
      applyFilters();
    });
  }
}

function updateLoadButton() {
  const loadBtn = document.getElementById('load-full-data');
  if (!loadBtn) return;
  
  if (isFullDataLoaded()) {
    loadBtn.classList.remove('loading');
    loadBtn.classList.add('loaded');
    loadBtn.textContent = '🔄 Refresh Data';
  } else {
    loadBtn.classList.remove('loading', 'loaded');
    loadBtn.textContent = '📥 Load Full Data';
  }
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
  
  // Type and color counts (if full data loaded)
  const types = { Creature: 0, Instant: 0, Sorcery: 0, Artifact: 0, Enchantment: 0, Land: 0, Planeswalker: 0 };
  const colors = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  let colorless = 0, fiveColor = false, lowCmc = 0, highCmc = 0;
  
  collection.forEach(c => {
    rarities[c.rarity] = (rarities[c.rarity] || 0) + c.quantity;
    if (c.foil !== 'normal') foils[c.foil] = (foils[c.foil] || 0) + c.quantity;
    if (c.price > maxPrice) maxPrice = c.price;
    languages.add(c.language);
    
    // Full data stats
    if (c.type_line) {
      for (const t of Object.keys(types)) {
        if (c.type_line.includes(t)) types[t] += c.quantity;
      }
    }
    if (c.colors) {
      if (c.colors.length === 0) colorless += c.quantity;
      if (c.colors.length === 5) fiveColor = true;
      c.colors.forEach(col => colors[col] = (colors[col] || 0) + c.quantity);
    }
    if (c.cmc !== undefined) {
      if (c.cmc <= 2) lowCmc += c.quantity;
      if (c.cmc >= 6) highCmc += c.quantity;
    }
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
  
  // Full data badges
  if (isFullDataLoaded()) {
    badges.push(
      { icon: '🐉', name: 'Bestiary', desc: '100+ creatures', unlocked: types.Creature >= 100 },
      { icon: '⚡', name: 'Spell Slinger', desc: '50+ instants/sorceries', unlocked: (types.Instant + types.Sorcery) >= 50 },
      { icon: '🏰', name: 'Land Lord', desc: '50+ lands', unlocked: types.Land >= 50 },
      { icon: '🌈', name: 'Rainbow', desc: 'Own a 5-color card', unlocked: fiveColor },
      { icon: '⚙️', name: 'Steel King', desc: '20+ colorless cards', unlocked: colorless >= 20 },
      { icon: '🗡️', name: 'Artificer', desc: '30+ artifacts', unlocked: types.Artifact >= 30 },
      { icon: '📜', name: 'Enchanter', desc: '30+ enchantments', unlocked: types.Enchantment >= 30 },
      { icon: '👤', name: 'Superfriends', desc: '10+ planeswalkers', unlocked: types.Planeswalker >= 10 },
      { icon: '🏃', name: 'Speed Demon', desc: '50+ cards CMC ≤2', unlocked: lowCmc >= 50 },
      { icon: '🦣', name: 'Timmy', desc: '20+ cards CMC 6+', unlocked: highCmc >= 20 },
      { icon: '☀️', name: 'Light Bringer', desc: '30+ white cards', unlocked: colors.W >= 30 },
      { icon: '🌊', name: 'Mind Mage', desc: '30+ blue cards', unlocked: colors.U >= 30 },
      { icon: '💀', name: 'Necromancer', desc: '30+ black cards', unlocked: colors.B >= 30 },
      { icon: '🔥', name: 'Pyromancer', desc: '30+ red cards', unlocked: colors.R >= 30 },
      { icon: '🌲', name: 'Druid', desc: '30+ green cards', unlocked: colors.G >= 30 },
    );
  }
  
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

// Load Chart.js before collection loads
const chartjs = document.createElement('script');
chartjs.src = 'https://cdn.jsdelivr.net/npm/chart.js';
chartjs.onload = () => window.chartReady = true;
document.head.appendChild(chartjs);
