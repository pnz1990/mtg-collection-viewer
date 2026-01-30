// Timeline view
let setData = {};

async function loadSetData() {
  const cached = localStorage.getItem('mtg-sets');
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < 86400000) { // 24h cache
      setData = data;
      return;
    }
  }
  
  try {
    const response = await fetch('https://api.scryfall.com/sets');
    const json = await response.json();
    setData = {};
    json.data.forEach(set => {
      setData[set.code] = { name: set.name, released: set.released_at };
    });
    localStorage.setItem('mtg-sets', JSON.stringify({ data: setData, timestamp: Date.now() }));
  } catch (e) {
    console.error('Failed to load set data:', e);
  }
}

function renderTimeline() {
  const container = document.getElementById('timeline');
  
  // Group cards by set, then by year
  const setGroups = {};
  filteredCollection.forEach(card => {
    const code = card.setCode.toLowerCase();
    if (!setGroups[code]) {
      setGroups[code] = {
        name: card.setName,
        released: setData[code]?.released || '1993-01-01',
        cards: []
      };
    }
    setGroups[code].cards.push(card);
  });
  
  // Sort sets by release date descending
  const sortedSets = Object.entries(setGroups)
    .sort((a, b) => b[1].released.localeCompare(a[1].released));
  
  // Group by year
  const yearGroups = {};
  sortedSets.forEach(([code, set]) => {
    const year = set.released.substring(0, 4);
    if (!yearGroups[year]) yearGroups[year] = [];
    yearGroups[year].push({ code, ...set });
  });
  
  const years = Object.keys(yearGroups).sort((a, b) => b - a);
  
  container.innerHTML = years.map(year => `
    <div class="timeline-year">
      <div class="year-header">${year}</div>
      ${yearGroups[year].map(set => `
        <div class="timeline-set">
          <div class="set-header" onclick="this.parentElement.classList.toggle('collapsed')">
            <img src="https://svgs.scryfall.io/sets/${set.code}.svg" class="set-icon">
            <span class="set-name">${set.name}</span>
            <span class="set-date">${formatDate(set.released)}</span>
            <span class="set-count">${set.cards.reduce((s, c) => s + c.quantity, 0)} cards</span>
            <span class="set-toggle">▼</span>
          </div>
          <div class="set-cards">
            ${set.cards.map(card => {
              const foilClass = card.foil !== 'normal' ? card.foil : '';
              return `
                <div class="timeline-card ${foilClass}" data-scryfall-id="${card.scryfallId}">
                  <a href="detail.html?id=${card.scryfallId}" class="card-link">
                    <div class="card-image-wrapper">
                      <div class="card-image-inner">
                        <img alt="${card.name}" class="card-image">
                        <img src="back.png" alt="Card back" class="card-back">
                      </div>
                    </div>
                  </a>
                  <div class="timeline-card-name">${card.name}</div>
                  <div class="timeline-card-price">${formatPrice(card.price, card.currency)}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
  
  // Load images and setup interactions
  setupTimelineCards();
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function setupTimelineCards() {
  document.querySelectorAll('.timeline-card').forEach(card => {
    const wrapper = card.querySelector('.card-image-wrapper');
    const inner = wrapper.querySelector('.card-image-inner');
    const img = card.querySelector('.card-image');
    const id = card.dataset.scryfallId;
    
    // Load image
    fetchCardImage(id, 'small').then(url => { if (url) img.src = url; });
    
    // Drag interaction
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
}

async function onCollectionLoaded() {
  await loadSetData();
  renderTimeline();
}

function onFiltersApplied() {
  renderTimeline();
}
