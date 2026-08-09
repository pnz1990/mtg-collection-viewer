(function () {
  const Pack = window.MTGPackPullerCore;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const state = { product:null, manifest:null, cards:[], filtered:[], rate:null, rateUpdated:'', shown:160, view:localStorage.getItem('pack-puller-view') || 'list', opening:{} };
  const productId = new URLSearchParams(location.search).get('product') || '';
  const openingKey = `pack-puller-opening:${productId}`;
  const rateKey = 'pack-puller-usd-aud-v1';
  const priceKey = `pack-puller-prices:${productId}`;
  const slotLabels = () => Object.fromEntries((state.manifest.slots || []).map(slot => [slot.id, slot.label]));
  const treatmentLabel = value => ({'main-set':'Main set','city-basic':'City basic','scene':'Scene','logo':'Logo','borderless-land':'Borderless land','cosmic-foil':'Cosmic foil','gauntlet':'Gauntlet','classic-comic':'Classic comic','source-material':'Source Material','commander-booster-fun':'Commander Booster Fun','extended-art':'Extended art',borderless:'Borderless',showcase:'Showcase'}[value] || value.replaceAll('-', ' '));
  const money = (value, currency) => Number.isFinite(value) ? new Intl.NumberFormat(currency === 'AUD' ? 'en-AU' : 'en-US', { style:'currency', currency }).format(value) : 'Price unavailable';
  const imageUrl = card => card.imageUris?.small || card.cardFaces?.[0]?.imageUris?.small || 'images/back.png';

  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch (_) { return fallback; } }
  function setStatus(message, error = false) { $('pack-status').textContent = message; $('pack-status').classList.toggle('error', error); $('pack-status').hidden = !message; }
  async function fetchJson(url) { const response = await fetch(url); if (!response.ok) throw new Error(`${url} returned ${response.status}`); return response.json(); }
  async function loadProduct() {
    const products = await fetchJson('data/pack-pullers/index.json');
    state.product = products.find(product => product.id === productId && product.enabled);
    if (!state.product) throw new Error('That Pack Puller product is not available. Choose a supported product from Pack Pullers.');
    [state.manifest, state.index] = await Promise.all([fetchJson(state.product.manifest), fetchJson(state.product.generatedIndex)]);
    if (state.index.productId !== state.product.id) throw new Error('The generated card index does not match this product manifest.');
    state.cards = state.index.cards;
    const cachedPrices = readJson(priceKey, null);
    if (cachedPrices && Date.now() - cachedPrices.timestamp < 3600000) applyPriceMap(cachedPrices.cards);
    state.opening = readJson(openingKey, {});
  }
  function applyPriceMap(map = {}) { state.cards.forEach(card => { if (map[card.id]) { card.prices = map[card.id].prices; card.priceUpdatedAt = map[card.id].updatedAt; } }); }

  async function loadRate(force = false) {
    const cached = Pack.parseCachedRate(localStorage.getItem(rateKey), Date.now(), 86400000);
    if (cached && !force) { state.rate = cached.rate; state.rateUpdated = cached.updatedAt; renderRate(); return; }
    $('refresh-rate').disabled = true;
    try {
      const response = await fetch('https://api.frankfurter.dev/v2/rate/USD/AUD');
      if (!response.ok) throw new Error(`Rate service returned ${response.status}`);
      const data = await response.json();
      if (!(Number(data.rate) > 0)) throw new Error('Invalid exchange rate');
      state.rate = Number(data.rate); state.rateUpdated = data.date || new Date().toISOString();
      localStorage.setItem(rateKey, JSON.stringify({ rate:state.rate, updatedAt:state.rateUpdated, timestamp:Date.now(), provider:'Frankfurter' }));
    } catch (_) {
      const stale = readJson(rateKey, null);
      if (stale?.rate) { state.rate = Number(stale.rate); state.rateUpdated = `${stale.updatedAt} (cached)`; }
      else { state.rate = null; state.rateUpdated = 'Live rate unavailable'; }
    } finally { $('refresh-rate').disabled = false; renderRate(); applyFilters(); }
  }
  function renderRate() {
    $('rate-summary').textContent = state.rate ? `Currency conversion: 1 USD ≈ ${state.rate.toFixed(4)} AUD` : 'AUD conversion unavailable — USD prices remain visible';
    $('rate-updated').textContent = state.rateUpdated ? `Updated: ${state.rateUpdated} · Frankfurter` : '';
  }

  function populateControls() {
    $('product-title').textContent = `${state.product.name} — ${state.product.boosterType}`;
    $('product-summary').textContent = `${state.cards.length.toLocaleString()} explicitly eligible printings · ${state.manifest.setCodes.join(' · ')} · verified ${state.manifest.verifiedDate}`;
    $('filter-set').insertAdjacentHTML('beforeend', state.manifest.setCodes.map(code => `<option>${code}</option>`).join(''));
    const treatments = [...new Set(state.cards.flatMap(card => card.treatments))].sort();
    $('filter-treatment').insertAdjacentHTML('beforeend', treatments.map(tag => `<option value="${esc(tag)}">${esc(treatmentLabel(tag))}</option>`).join(''));
    $('filter-slot').insertAdjacentHTML('beforeend', state.manifest.slots.filter(slot => !slot.nonCard).map(slot => `<option value="${esc(slot.id)}">${esc(slot.label)}</option>`).join(''));
    const mindStones = state.manifest.specialCards || [];
    if (mindStones.length) { $('special-note').hidden = false; $('special-note').innerHTML = `<strong>Headliner reference</strong> — ${mindStones.map(item => `${esc(item.name)} #${esc(item.collectorNumber)}: ${esc(item.treatment)}. ${esc(item.probabilityText || '')} ${esc(item.languageNote || '')}`).join('<br>')}`; }
    $('source-panel').innerHTML = `<strong>Data and eligibility</strong><p>Booster eligibility is based on official Wizards product information. Card images, metadata and Scryfall market estimates are provided by Scryfall. AUD values use the displayed exchange rate. Product collation can be corrected by Wizards and prices may be missing or delayed.</p><p>${state.manifest.officialSources.map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)}</a>`).join(' · ')} · <a href="https://scryfall.com/sets/msh" target="_blank" rel="noopener noreferrer">Scryfall card search</a> · <a href="https://scryfall.com/docs/api" target="_blank" rel="noopener noreferrer">Scryfall attribution</a></p>`;
  }
  function filters() { return { search:$('pack-search').value, setCode:$('filter-set').value, rarity:$('filter-rarity').value, color:$('filter-colour').value, type:$('filter-type').value, treatment:$('filter-treatment').value, finish:$('filter-finish').value, slot:$('filter-slot').value, exclusive:$('filter-exclusive').checked, priceAvailable:$('filter-priced').checked, minAud:$('filter-min').value, maxAud:$('filter-max').value, rate:state.rate }; }
  function applyFilters() {
    const active = filters();
    state.filtered = Pack.sortCards(Pack.filterCards(state.cards, active), $('pack-sort').value, state.manifest.setCodes, state.rate);
    state.shown = 160; renderChips(active); renderResults();
  }
  function renderChips(active) {
    const values = [['Search',active.search],['Set',active.setCode],['Rarity',active.rarity],['Colour',active.color],['Type',active.type],['Treatment',active.treatment && treatmentLabel(active.treatment)],['Finish',active.finish],['Slot',active.slot && slotLabels()[active.slot]],['Min AUD',active.minAud],['Max AUD',active.maxAud]];
    if (active.exclusive) values.push(['','Collector Booster exclusive']); if (active.priceAvailable) values.push(['','Price available']);
    $('active-filters').innerHTML = values.filter(([,value]) => value).map(([label,value]) => `<span>${label ? `${esc(label)}: ` : ''}${esc(value)}</span>`).join('');
  }
  function finishPrice(card, finish) {
    const usd = Pack.priceForFinish(card, finish), aud = Pack.convertUsdToAud(usd, state.rate);
    return `<div><strong>${finish === 'foil' ? 'Traditional foil' : 'Non-foil'}</strong><span>${money(usd,'USD')}</span><small>${Number.isFinite(aud) ? `Approx. ${money(aud,'AUD')}` : 'AUD unavailable'}</small></div>`;
  }
  function renderCard(card) {
    const slots = slotLabels(); const quantity = Number(state.opening[card.id] || 0);
    const priceStamp = card.priceUpdatedAt ? `<small>Price snapshot ${esc(new Date(card.priceUpdatedAt).toLocaleString())}</small>` : '<small>Price unavailable</small>';
    return `<article class="pull-row ${quantity ? 'pulled' : ''}" data-card-id="${esc(card.id)}"><img loading="lazy" src="${esc(imageUrl(card))}" alt="${esc(card.name)}"><div class="pull-main"><h2>${esc(card.name)}</h2>${card.fullName !== card.name ? `<p>${esc(card.fullName)}</p>` : ''}<p><strong>${esc(card.setCode)} #${esc(card.collectorNumber)}</strong> · ${esc(card.setName)} · ${esc(card.rarity)} · ${esc(card.typeLine)}</p><div class="pull-tags">${card.treatments.map(tag => `<span>${esc(treatmentLabel(tag))}</span>`).join('')}${card.collectorBoosterExclusive ? '<span>Collector exclusive</span>' : ''}</div></div><div class="pull-slots"><p>${card.slotTags.map(tag => esc(slots[tag] || tag)).join(' · ') || 'Verified product range'}</p>${card.specialInfo ? `<p><strong>${esc(card.specialInfo.probabilityText || card.specialInfo.notes || '')}</strong></p>` : ''}</div><div class="pull-price">${card.eligibleFinishes.map(finish => finishPrice(card, finish)).join('')}${priceStamp}</div><div class="pull-actions"><a href="detail.html?id=${encodeURIComponent(card.id)}&source=pack-puller&product=${encodeURIComponent(productId)}">Open details</a><button type="button" data-pull="${esc(card.id)}">${quantity ? `Pulled ×${quantity}` : 'Mark as pulled'}</button></div></article>`;
  }
  function renderResults() {
    const visible = state.filtered.slice(0, state.shown);
    $('result-count').textContent = `${state.filtered.length.toLocaleString()} eligible printing${state.filtered.length === 1 ? '' : 's'}`;
    $('pack-results').className = `pack-results ${state.view === 'grid' ? 'small-grid' : 'compact-list'}`;
    $('pack-results').innerHTML = visible.map(renderCard).join('') || '<div class="collection-status">No eligible printings match these filters.</div>';
    $('load-more').hidden = state.shown >= state.filtered.length;
    $('view-list').classList.toggle('active', state.view === 'list'); $('view-grid').classList.toggle('active', state.view === 'grid');
    renderOpeningCount();
  }
  function renderOpeningCount() { $('opening-count').textContent = Object.values(state.opening).reduce((sum, value) => sum + Number(value), 0); }
  function saveOpening() { localStorage.setItem(openingKey, JSON.stringify(state.opening)); renderOpeningCount(); renderResults(); }
  function openingText() { return state.cards.filter(card => state.opening[card.id]).map(card => `${state.opening[card.id]} ${card.name} (${card.setCode}) ${card.collectorNumber}${card.eligibleFinishes.length === 1 && card.eligibleFinishes[0] === 'foil' ? ' *F*' : ''}`).join('\n'); }
  function renderOpening() {
    const cards = state.cards.filter(card => state.opening[card.id]);
    $('opening-items').innerHTML = cards.length ? cards.map(card => `<div class="opening-item"><span>${esc(card.name)} · ${esc(card.setCode)} #${esc(card.collectorNumber)}</span><label>Quantity <input type="number" min="1" max="99" value="${state.opening[card.id]}" data-opening-quantity="${esc(card.id)}"></label></div>`).join('') : '<p>No cards marked during this opening.</p>';
  }
  async function copyOpening() { try { await navigator.clipboard.writeText(openingText()); setStatus('Pulled cards copied.'); } catch (_) { setStatus('Copy failed. You can export the text instead.', true); } }
  function exportOpening() { const blob = new Blob([openingText()], { type:'text/plain;charset=utf-8' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${productId}-pulls.txt`; link.click(); URL.revokeObjectURL(link.href); }

  async function refreshPrices() {
    const button = $('refresh-prices'); button.disabled = true; const priceMap = {}; let done = 0;
    try {
      for (let i=0; i<state.cards.length; i+=75) {
        const batch = state.cards.slice(i,i+75);
        setStatus(`Refreshing Scryfall prices… ${done} / ${state.cards.length}`);
        const response = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ identifiers:batch.map(card => ({ id:card.id })) }) });
        if (!response.ok) throw new Error(`Scryfall returned ${response.status}`);
        const data = await response.json();
        (data.data || []).forEach(card => { priceMap[card.id] = { prices:card.prices, updatedAt:new Date().toISOString() }; });
        done += batch.length; await new Promise(resolve => setTimeout(resolve, 120));
      }
      applyPriceMap(priceMap); localStorage.setItem(priceKey, JSON.stringify({ timestamp:Date.now(), cards:priceMap }));
      setStatus(`Prices refreshed for ${Object.keys(priceMap).length.toLocaleString()} printings.`); applyFilters();
    } catch (error) { if (Object.keys(priceMap).length) { applyPriceMap(priceMap); applyFilters(); } setStatus(`Price refresh stopped after ${done} cards: ${error.message}`, true); }
    finally { button.disabled = false; }
  }

  function bindEvents() {
    ['pack-search','filter-set','filter-rarity','filter-colour','filter-type','filter-treatment','filter-finish','filter-slot','filter-exclusive','filter-priced','filter-min','filter-max','pack-sort'].forEach(id => $(id).addEventListener(id === 'pack-search' || id.includes('min') || id.includes('max') ? 'input' : 'change', applyFilters));
    $('clear-filters').addEventListener('click', () => { ['pack-search','filter-set','filter-rarity','filter-colour','filter-type','filter-treatment','filter-finish','filter-slot','filter-min','filter-max'].forEach(id => $(id).value=''); $('filter-exclusive').checked=false; $('filter-priced').checked=false; applyFilters(); });
    $('view-list').addEventListener('click', () => { state.view='list'; localStorage.setItem('pack-puller-view','list'); renderResults(); }); $('view-grid').addEventListener('click', () => { state.view='grid'; localStorage.setItem('pack-puller-view','grid'); renderResults(); });
    $('quick-mode').addEventListener('change', event => document.body.classList.toggle('quick-pack', event.target.checked));
    $('load-more').addEventListener('click', () => { state.shown += 160; renderResults(); });
    $('refresh-rate').addEventListener('click', () => loadRate(true)); $('refresh-prices').addEventListener('click', refreshPrices);
    $('pack-results').addEventListener('click', event => { const button=event.target.closest('[data-pull]'); if(!button)return; const id=button.dataset.pull; state.opening[id]=(state.opening[id]||0)+1; saveOpening(); });
    $('opening-toggle').addEventListener('click', () => { renderOpening(); $('opening-panel').hidden=false; }); $('close-opening').addEventListener('click',()=>$('opening-panel').hidden=true);
    $('opening-items').addEventListener('input', event => { if(!event.target.dataset.openingQuantity)return; state.opening[event.target.dataset.openingQuantity]=Math.max(1,Number(event.target.value)||1); localStorage.setItem(openingKey,JSON.stringify(state.opening)); renderOpeningCount(); });
    $('copy-opening').addEventListener('click',copyOpening); $('export-opening').addEventListener('click',exportOpening); $('clear-opening').addEventListener('click',()=>{if(confirm('Clear the cards marked in this opening?')){state.opening={};saveOpening();renderOpening();}});
  }
  async function init() { try { await loadProduct(); populateControls(); bindEvents(); await loadRate(); applyFilters(); setStatus(''); } catch (error) { setStatus(error.message || 'The Pack Puller could not be loaded.', true); document.querySelector('.pack-browser').hidden=true; } }
  init();
})();
