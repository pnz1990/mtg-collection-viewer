const DASHBOARD_CONFIG = {
  franchises: {
    'Lord of the Rings': ['LTR', 'LTC', 'LTCF'],
    'Marvel': ['SPM', 'FIN'],
    'Spider-Man': ['SPM'],
    'Avatar': ['TLA', 'TLE'],
    'Strixhaven': ['STX', 'STA', 'C21', 'SOS', 'SOA', 'SOC']
  },
  commanderStaples: ['Sol Ring', 'Arcane Signet', 'Command Tower', 'Swords to Plowshares', 'Path to Exile',
    'Counterspell', 'Cyclonic Rift', 'Rhystic Study', 'Smothering Tithe', 'Lightning Greaves', 'Swiftfoot Boots']
};

const privacyDefaults = {
  hideTotalValue: false, hideBinderNames: false,
  disableTradeBinder: false, disableWishlist: false, disableDeckPages: false,
  disableTilt: false, disableFoilEffects: false
};
let dashboardPreset = 'all';

function dashboardSettings() {
  try { return { ...privacyDefaults, ...JSON.parse(localStorage.getItem('mtg-dashboard-settings') || '{}') }; }
  catch (_) { return { ...privacyDefaults }; }
}

function dashboardMoney(value, currency) {
  try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency || 'AUD' }).format(value || 0); }
  catch (_) { return `${currency || 'AUD'} ${(value || 0).toFixed(2)}`; }
}

function currentMarketPrice(card) {
  return window.MTGCollectionCore.marketPrice(card) * getUsdToAudRate();
}

function renderSummaryDashboard() {
  const target = document.getElementById('summary-dashboard');
  if (!target) return;
  const totals = window.MTGCollectionCore.calculateTotals(collection.map(card => ({ ...card, currentPrice: currentMarketPrice(card) })));
  const settings = dashboardSettings();
  const metrics = [
    ['Unique cards', totals.uniqueCards, 'Oracle card names'],
    ['Physical cards', totals.quantity, `${totals.uniqueVersions} owned versions`],
    ['Current value', settings.hideTotalValue ? 'Hidden' : dashboardMoney(totals.estimatedValue, 'AUD'), 'Scryfall USD converted to AUD'],
    ['Priced copies', totals.marketPricedQuantity, 'Copies with a Scryfall price'],
    ['Printings', totals.uniqueVersions, 'Distinct owned versions'],
    ['Foils', totals.foils, 'Foil and etched copies'],
    ['Sets', totals.sets, 'Sets represented'],
    ['Binders', settings.hideBinderNames ? 'Hidden' : totals.binders, 'Named storage locations']
  ];
  target.innerHTML = metrics.map(([label, value, note]) =>
    `<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
  document.getElementById('total-value')?.closest('span')?.toggleAttribute('hidden', settings.hideTotalValue);
}

function renderHighlights() {
  const valueRows = [...collection].sort((a, b) => currentMarketPrice(b) * b.quantity - currentMarketPrice(a) * a.quantity).slice(0, 5);
  const bySet = {};
  collection.forEach(card => {
    const key = card.setName || card.setCode || 'Unknown set';
    bySet[key] = (bySet[key] || 0) + currentMarketPrice(card) * card.quantity;
  });
  const setRows = Object.entries(bySet).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recentRows = collection.filter(card => card.addedDate).sort((a, b) => b.addedDate.localeCompare(a.addedDate)).slice(0, 5);
  const franchiseRows = Object.entries(DASHBOARD_CONFIG.franchises).map(([name, codes]) =>
    [name, collection.filter(card => codes.includes(card.setCode)).reduce((sum, card) => sum + card.quantity, 0)]).sort((a, b) => b[1] - a[1]);
  const write = (id, rows, render) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = rows.length ? rows.map(render).join('') : '<p class="empty-note">No matching data in this CSV.</p>';
  };
  write('valuable-cards', valueRows, card => `<a href="detail.html?id=${encodeURIComponent(card.scryfallId)}"><span>${card.name}</span><strong>${dashboardMoney(currentMarketPrice(card) * card.quantity, 'AUD')}</strong></a>`);
  write('valuable-sets', setRows, ([name, value]) => `<div><span>${name}</span><strong>${dashboardMoney(value, 'AUD')}</strong></div>`);
  write('recent-cards', recentRows, card => `<a href="detail.html?id=${encodeURIComponent(card.scryfallId)}"><span>${card.name}</span><strong>${new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium' }).format(new Date(card.addedDate))}</strong></a>`);
  write('franchise-summary', franchiseRows, ([name, count]) => `<div><span>${name}</span><strong>${count}</strong></div>`);
}

function populateDashboardFilters() {
  const fill = (id, values, label) => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML = `<option value="">All ${label}</option>` + [...new Set(values.filter(Boolean))].sort()
      .map(value => `<option value="${value.replace(/"/g, '&quot;')}">${value}</option>`).join('');
  };
  fill('binder-filter', collection.map(card => card.binderName), 'Binders');
  fill('language-filter', collection.map(card => card.language), 'Languages');
  fill('condition-filter', collection.map(card => card.condition), 'Conditions');
}

function matchesDashboardPreset(card) {
  const type = (card.type_line || '').toLowerCase();
  const name = card.name.toLowerCase();
  const code = card.setCode;
  if (dashboardPreset === 'recent') return card.addedDate && Date.parse(card.addedDate) >= Date.now() - 90 * 86400000;
  if (dashboardPreset === 'duplicates') return collection.filter(c => (c.oracle_id || c.name) === (card.oracle_id || card.name)).reduce((s, c) => s + c.quantity, 0) > 1;
  if (dashboardPreset === 'valuable') return currentMarketPrice(card) >= 20;
  if (dashboardPreset === 'unassigned') return !card.binderName;
  if (dashboardPreset === 'foil') return card.foil !== 'normal';
  if (dashboardPreset === 'mythic') return card.rarity === 'mythic';
  if (['orcs', 'zombies', 'vampires', 'humans'].includes(dashboardPreset)) return type.includes(dashboardPreset.replace(/s$/, ''));
  if (dashboardPreset === 'staples') return DASHBOARD_CONFIG.commanderStaples.some(staple => staple.toLowerCase() === name);
  const group = { lotr: 'Lord of the Rings', marvel: 'Marvel', spiderman: 'Spider-Man', avatar: 'Avatar', strixhaven: 'Strixhaven' }[dashboardPreset];
  return !group || DASHBOARD_CONFIG.franchises[group].includes(code);
}

function applyDashboardFilters() {
  const binder = document.getElementById('binder-filter')?.value || '';
  const language = document.getElementById('language-filter')?.value || '';
  const condition = document.getElementById('condition-filter')?.value || '';
  const quantity = Number(document.getElementById('quantity-filter')?.value || 1);
  const date = document.getElementById('date-filter')?.value || '';
  filteredCollection = filteredCollection.filter(card => matchesDashboardPreset(card) &&
    (!binder || card.binderName === binder) && (!language || card.language === language) &&
    (!condition || card.condition === condition) && card.quantity >= quantity &&
    (!date || (card.addedDate && card.addedDate >= date)));
}

function renderSettings() {
  const target = document.getElementById('privacy-settings');
  if (!target) return;
  const settings = dashboardSettings();
  const labels = {
    hideTotalValue: 'Hide current collection value',
    hideBinderNames: 'Hide binder names', disableTradeBinder: 'Disable trade binder',
    disableWishlist: 'Disable wishlist', disableDeckPages: 'Disable public deck pages',
    disableTilt: 'Disable card tilt', disableFoilEffects: 'Disable foil effects'
  };
  target.innerHTML = Object.entries(labels).map(([key, label]) =>
    `<label><input type="checkbox" data-setting="${key}" ${settings[key] ? 'checked' : ''}> ${label}</label>`).join('');
  target.addEventListener('change', event => {
    const input = event.target.closest('[data-setting]');
    if (!input) return;
    const next = dashboardSettings(); next[input.dataset.setting] = input.checked;
    localStorage.setItem('mtg-dashboard-settings', JSON.stringify(next));
    applyDashboardPrivacy(); renderSummaryDashboard(); renderCollection();
  });
  applyDashboardPrivacy();
}

function applyDashboardPrivacy() {
  const settings = dashboardSettings();
  document.documentElement.classList.toggle('disable-tilt', settings.disableTilt);
  document.documentElement.classList.toggle('disable-foil', settings.disableFoilEffects);
  document.querySelectorAll('a[href="trading-binder.html"]').forEach(el => el.hidden = settings.disableTradeBinder);
  document.querySelectorAll('a[href="wishlist.html"]').forEach(el => el.hidden = settings.disableWishlist);
  document.querySelectorAll('a[href="decks.html"], a[href="commander-builder.html"]').forEach(el => el.hidden = settings.disableDeckPages);
}

const originalDashboardLoaded = onCollectionLoaded;
onCollectionLoaded = async function () {
  await originalDashboardLoaded();
  populateDashboardFilters();
  await loadAudExchangeRate();
  showCollectionStatus('loading', 'Loading current Scryfall market prices…');
  await loadFullCardData((done, total) => {
    showCollectionStatus('loading', `Loading current Scryfall market prices… ${Math.round(done / total * 100)}%`);
  });
  applyFilters();
  renderSummaryDashboard();
  renderHighlights();
  renderSettings();
  const rateDate = localStorage.getItem('mtg-usd-aud-date');
  showCollectionStatus('success', `Collection ready · Scryfall USD prices converted to AUD${rateDate ? ` at the ${rateDate} reference rate` : ''}.`);
};

const originalDashboardApply = applyFilters;
applyFilters = function () {
  originalDashboardApply();
  applyDashboardFilters();
  updateStats();
  onFiltersApplied();
  localStorage.setItem('mtg-dashboard-filter-state', JSON.stringify({
    dashboardPreset, search: document.getElementById('search')?.value || '',
    binder: document.getElementById('binder-filter')?.value || ''
  }));
};

document.querySelectorAll('.quick-actions button').forEach(button => button.addEventListener('click', () => {
  dashboardPreset = button.dataset.preset;
  document.querySelectorAll('.quick-actions button').forEach(item => item.classList.toggle('active', item === button));
  applyFilters();
}));
['binder-filter', 'language-filter', 'condition-filter', 'quantity-filter', 'date-filter'].forEach(id =>
  document.getElementById(id)?.addEventListener('change', applyFilters));
