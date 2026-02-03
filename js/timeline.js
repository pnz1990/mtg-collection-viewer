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
            <img src="https://svgs.scryfall.io/sets/${set.code}.svg" class="set-icon" onerror="this.src='https://svgs.scryfall.io/sets/default.svg'">
            <span class="set-name">${set.name}</span>
            <span class="set-date">${formatDate(set.released)}</span>
            <span class="set-count">${set.cards.reduce((s, c) => s + c.quantity, 0)} cards</span>
            <span class="set-toggle">▼</span>
          </div>
          <div class="set-cards">
            ${set.cards.map(card => renderCardHTML(card)).join('')}
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
  const container = document.getElementById('timeline');
  
  // Load images
  container.querySelectorAll('.card[data-scryfall-id]').forEach(card => {
    const img = card.querySelector('.card-image');
    const id = card.dataset.scryfallId;
    fetchCardImage(id, 'small').then(url => { if (url) img.src = url; });
  });
  
  // Setup interactions (drag, click filters)
  setupCardInteractions(container);
}

async function onCollectionLoaded() {
  await loadSetData();
  renderTimeline();
  
  // Setup collapsible filters
  document.getElementById('filters-toggle')?.addEventListener('click', function() {
    this.classList.toggle('expanded');
    document.getElementById('filters-content').classList.toggle('collapsed');
  });
}

function onFiltersApplied() {
  renderTimeline();
}
