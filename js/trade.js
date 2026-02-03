// Trade Calculator
let selectedCards = new Map(); // scryfallId -> card
let receivingCards = []; // { name, set, foil, price, scryfallId, imageUrl, versions }
let imageObserver;
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

function getScryPrice(card) {
  if (!card.scryfallPrices) return card.price || 0;
  const p = card.scryfallPrices;
  if (card.foil === 'etched' && p.usd_etched) return parseFloat(p.usd_etched) || 0;
  if (card.foil === 'foil' && p.usd_foil) return parseFloat(p.usd_foil) || 0;
  return parseFloat(p.usd) || 0;
}

function updateSelectionInfo() {
  let total = 0;
  selectedCards.forEach(card => { total += getScryPrice(card) * card.quantity; });
  document.getElementById('selected-count').textContent = selectedCards.size;
  document.getElementById('selected-value').textContent = `$${total.toFixed(2)}`;
}

function renderCollection(append = false) {
  const container = document.getElementById('collection');
  const loadMoreBtn = document.getElementById('load-more');
  
  if (!append) {
    displayedCards = 0;
    container.innerHTML = '';
  }
  
  const cardsToShow = filteredCollection.slice(displayedCards, displayedCards + CARDS_PER_PAGE);
  const html = cardsToShow.map(card => {
    const isSelected = selectedCards.has(card.scryfallId);
    const price = getScryPrice(card);
    return `
    <div class="card ${card.foil !== 'normal' ? card.foil : ''} ${isSelected ? 'selected' : ''}" 
         data-scryfall-id="${card.scryfallId}" data-selectable="true">
      <div class="card-image-wrapper">
        <div class="card-image-inner">
          <img alt="${card.name}" class="card-image">
        </div>
        <div class="select-overlay">${isSelected ? '✓' : '+'}</div>
      </div>
      <div class="card-header">
        <div class="card-name">${card.name}</div>
        <div class="card-value">$${(price * card.quantity).toFixed(2)}</div>
      </div>
      <div class="card-set">${card.setName}</div>
      <div class="card-details">
        <span class="badge rarity-${card.rarity}">${card.rarity}</span>
        ${card.foil !== 'normal' ? `<span class="badge foil-${card.foil}">${card.foil}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  
  if (append) {
    container.insertAdjacentHTML('beforeend', html);
  } else {
    container.innerHTML = html;
  }
  
  displayedCards += cardsToShow.length;
  loadMoreBtn.style.display = displayedCards < filteredCollection.length ? 'block' : 'none';
  
  // Observe images
  container.querySelectorAll('.card:not([data-observed])').forEach(card => {
    card.dataset.observed = '1';
    const wrapper = card.querySelector('.card-image-wrapper');
    if (wrapper) imageObserver.observe(wrapper);
  });
  
  // Click to select
  container.querySelectorAll('.card[data-selectable]').forEach(card => {
    card.onclick = (e) => {
      e.preventDefault();
      const id = card.dataset.scryfallId;
      const cardData = collection.find(c => c.scryfallId === id);
      if (selectedCards.has(id)) {
        selectedCards.delete(id);
        card.classList.remove('selected');
        card.querySelector('.select-overlay').textContent = '+';
      } else {
        selectedCards.set(id, cardData);
        card.classList.add('selected');
        card.querySelector('.select-overlay').textContent = '✓';
      }
      updateSelectionInfo();
    };
  });
}

function goToStep(step) {
  document.querySelectorAll('.trade-step').forEach(s => s.classList.add('hidden'));
  document.getElementById(`step${step}`).classList.remove('hidden');
  document.querySelectorAll('.trade-steps .step').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.step) === step);
    s.classList.toggle('completed', parseInt(s.dataset.step) < step);
  });
}

async function parseReceiveList(text) {
  const lines = text.trim().split('\n').filter(l => l.trim() && !l.startsWith('//'));
  const cards = [];
  
  for (const line of lines) {
    let qty = 1, name = line.trim(), set = null, foil = false;
    
    // Parse quantity
    const qtyMatch = name.match(/^(\d+)x?\s+/);
    if (qtyMatch) { qty = parseInt(qtyMatch[1]); name = name.slice(qtyMatch[0].length); }
    
    // Parse foil marker
    if (name.includes('*F')) { foil = true; name = name.replace('*F', '').trim(); }
    
    // Parse set code [XXX]
    const setMatch = name.match(/\[([A-Z0-9]+)\]/i);
    if (setMatch) { set = setMatch[1].toLowerCase(); name = name.replace(setMatch[0], '').trim(); }
    
    cards.push({ qty, name, set, foil });
  }
  
  return cards;
}

async function fetchCardVersions(name) {
  try {
    const response = await fetch(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(name)}"&unique=prints`);
    if (!response.ok) return [];
    const data = await response.json();
    return data.data.map(c => ({
      scryfallId: c.id,
      name: c.name,
      set: c.set,
      setName: c.set_name,
      imageUrl: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small,
      prices: c.prices,
      collectorNumber: c.collector_number
    }));
  } catch (e) { return []; }
}

async function resolveReceivingCards(parsed) {
  const results = [];
  document.getElementById('receiving-cards').innerHTML = '<div class="loading">Loading card data...</div>';
  
  for (const item of parsed) {
    await new Promise(r => setTimeout(r, 100)); // Rate limit
    const versions = await fetchCardVersions(item.name);
    if (versions.length === 0) {
      results.push({ ...item, error: true, price: 0 });
      continue;
    }
    
    // Find best match
    let match = versions[0];
    if (item.set) {
      const setMatch = versions.find(v => v.set === item.set);
      if (setMatch) match = setMatch;
    }
    
    // Get price
    const prices = match.prices;
    let price = 0;
    if (item.foil && prices.usd_foil) price = parseFloat(prices.usd_foil);
    else if (prices.usd) price = parseFloat(prices.usd);
    else if (prices.usd_foil) price = parseFloat(prices.usd_foil);
    
    // If no set specified, find cheapest
    if (!item.set) {
      let cheapest = price;
      for (const v of versions) {
        const vp = item.foil ? parseFloat(v.prices.usd_foil) : parseFloat(v.prices.usd);
        if (vp && vp < cheapest) { cheapest = vp; match = v; price = vp; }
      }
    }
    
    results.push({
      ...item,
      scryfallId: match.scryfallId,
      setName: match.setName,
      set: match.set,
      imageUrl: match.imageUrl,
      price: price || 0,
      versions
    });
  }
  
  return results;
}

function renderComparison() {
  // Giving side
  let givingTotal = 0;
  const givingHtml = [...selectedCards.values()].map(card => {
    const price = getScryPrice(card) * card.quantity;
    givingTotal += price;
    return `
    <div class="trade-card">
      <img src="https://cards.scryfall.io/small/front/${card.scryfallId[0]}/${card.scryfallId[1]}/${card.scryfallId}.jpg" 
           onerror="this.src='images/back.png'">
      <div class="trade-card-info">
        <div class="trade-card-name">${card.name}</div>
        <div class="trade-card-set">${card.setName} ${card.foil !== 'normal' ? `(${card.foil})` : ''}</div>
        <div class="trade-card-price">$${price.toFixed(2)}</div>
      </div>
    </div>`;
  }).join('');
  
  document.getElementById('giving-cards').innerHTML = givingHtml || '<div class="empty">No cards selected</div>';
  document.getElementById('giving-total').textContent = `$${givingTotal.toFixed(2)}`;
  
  // Receiving side
  let receivingTotal = 0;
  const receivingHtml = receivingCards.map((card, idx) => {
    const totalPrice = card.price * card.qty;
    receivingTotal += totalPrice;
    const hasVersions = card.versions && card.versions.length > 1;
    return `
    <div class="trade-card ${card.error ? 'error' : ''}">
      <img src="${card.imageUrl || 'images/back.png'}" onerror="this.src='images/back.png'">
      <div class="trade-card-info">
        <div class="trade-card-name">${card.qty > 1 ? card.qty + 'x ' : ''}${card.name}</div>
        <div class="trade-card-set">${card.error ? 'Not found' : card.setName} ${card.foil ? '(foil)' : ''}</div>
        <div class="trade-card-price">${card.error ? '?' : '$' + totalPrice.toFixed(2)}</div>
        ${hasVersions ? `<select class="version-select" data-idx="${idx}">
          ${card.versions.map(v => {
            const vp = card.foil ? parseFloat(v.prices.usd_foil) || 0 : parseFloat(v.prices.usd) || 0;
            return `<option value="${v.scryfallId}" ${v.scryfallId === card.scryfallId ? 'selected' : ''}>
              ${v.setName} - $${vp.toFixed(2)}
            </option>`;
          }).join('')}
        </select>` : ''}
      </div>
    </div>`;
  }).join('');
  
  document.getElementById('receiving-cards').innerHTML = receivingHtml || '<div class="empty">No cards entered</div>';
  document.getElementById('receiving-total').textContent = `$${receivingTotal.toFixed(2)}`;
  
  // Balance
  const diff = receivingTotal - givingTotal;
  const balanceEl = document.getElementById('balance-value');
  const indicatorEl = document.getElementById('balance-indicator');
  balanceEl.textContent = `${diff >= 0 ? '+' : ''}$${diff.toFixed(2)}`;
  indicatorEl.className = 'balance-indicator ' + (diff > 0 ? 'positive' : diff < 0 ? 'negative' : 'even');
  
  // Version change handlers
  document.querySelectorAll('.version-select').forEach(sel => {
    sel.onchange = () => {
      const idx = parseInt(sel.dataset.idx);
      const card = receivingCards[idx];
      const newVersion = card.versions.find(v => v.scryfallId === sel.value);
      if (newVersion) {
        card.scryfallId = newVersion.scryfallId;
        card.setName = newVersion.setName;
        card.set = newVersion.set;
        card.imageUrl = newVersion.imageUrl;
        card.price = card.foil ? parseFloat(newVersion.prices.usd_foil) || 0 : parseFloat(newVersion.prices.usd) || 0;
        renderComparison();
      }
    };
  });
}

function onCollectionLoaded() {
  setupImageObserver();
  renderCollection();
  
  document.getElementById('filters-toggle')?.addEventListener('click', function() {
    this.classList.toggle('expanded');
    document.getElementById('filters-content').classList.toggle('collapsed');
  });
  
  document.getElementById('load-more')?.addEventListener('click', () => renderCollection(true));
  document.getElementById('clear-selection')?.addEventListener('click', () => {
    selectedCards.clear();
    renderCollection();
    updateSelectionInfo();
  });
}

function onFiltersApplied() {
  renderCollection();
}

// Navigation
document.getElementById('next-step1').onclick = () => goToStep(2);
document.getElementById('back-step2').onclick = () => goToStep(1);
document.getElementById('next-step2').onclick = async () => {
  const text = document.getElementById('receive-list').value.trim();
  if (!text) { alert('Please enter cards to receive'); return; }
  goToStep(3);
  const parsed = await parseReceiveList(text);
  receivingCards = await resolveReceivingCards(parsed);
  renderComparison();
};
document.getElementById('back-step3').onclick = () => goToStep(2);
document.getElementById('new-trade').onclick = () => {
  selectedCards.clear();
  receivingCards = [];
  document.getElementById('receive-list').value = '';
  goToStep(1);
  renderCollection();
  updateSelectionInfo();
};

// Menu handled by shared.js
