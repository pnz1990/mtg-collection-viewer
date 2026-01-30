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
                <a href="detail.html?id=${card.scryfallId}" class="timeline-card ${foilClass}">
                  <img src="" data-scryfall-id="${card.scryfallId}" class="timeline-card-img" alt="${card.name}">
                  <div class="timeline-card-name">${card.name}</div>
                  <div class="timeline-card-price">${formatPrice(card.price, card.currency)}</div>
                </a>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
  `).join('');
  
  // Lazy load images
  loadTimelineImages();
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

async function loadTimelineImages() {
  const images = document.querySelectorAll('.timeline-card-img[data-scryfall-id]');
  for (const img of images) {
    const id = img.dataset.scryfallId;
    if (!id || img.src) continue;
    const url = await fetchCardImage(id, 'small');
    if (url) img.src = url;
  }
}

async function onCollectionLoaded() {
  await loadSetData();
  renderTimeline();
}

function onFiltersApplied() {
  renderTimeline();
}
