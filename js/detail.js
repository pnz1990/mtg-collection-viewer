const params = new URLSearchParams(window.location.search);
const scryfallId = params.get('id');
const isReveal = params.get('reveal') === '1';

// IndexedDB for caching full card details
const DB_NAME = 'mtg-detail-cache';
const DB_VERSION = 1;
let detailDb = null;

async function openDetailDb() {
  if (detailDb) return detailDb;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => e.target.result.createObjectStore('cards', { keyPath: 'id' });
    req.onsuccess = e => { detailDb = e.target.result; resolve(detailDb); };
    req.onerror = () => resolve(null);
  });
}

async function getCachedCard(id) {
  const db = await openDetailDb();
  if (!db) return null;
  return new Promise(resolve => {
    const tx = db.transaction('cards', 'readonly');
    const req = tx.objectStore('cards').get(id);
    req.onsuccess = () => resolve(req.result?.data);
    req.onerror = () => resolve(null);
  });
}

async function cacheCard(id, data) {
  const db = await openDetailDb();
  if (!db) return;
  const tx = db.transaction('cards', 'readwrite');
  tx.objectStore('cards').put({ id, data, cached: Date.now() });
}

async function loadCardDetails() {
  if (!scryfallId) {
    document.getElementById('detail-container').innerHTML = '<div class="loading">No card specified</div>';
    return;
  }

  try {
    const csvResponse = await fetch('data/Collection.csv');
    const csvText = await csvResponse.text();
    const collectionCard = parseCollectionData(csvText, scryfallId);
    await loadAudExchangeRate();
    
    // Try cache first
    let card = await getCachedCard(scryfallId);
    
    if (!card) {
      // Add delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 150));
      
      let cardResponse;
      try {
        cardResponse = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
          headers: { 'Accept': 'application/json' }
        });
      } catch (e) {
        document.getElementById('detail-container').innerHTML = '<div class="loading">Scryfall is throttling requests. Please try again in a minute.</div>';
        return;
      }
      
      if (cardResponse.status === 429) {
        document.getElementById('detail-container').innerHTML = '<div class="loading">Scryfall is throttling requests. Please try again in a minute.</div>';
        return;
      }
      if (!cardResponse.ok) throw new Error('Card not found');
      
      card = await cardResponse.json();
      await cacheCard(scryfallId, card);
    }
    
    renderCardDetails(card, collectionCard);
  } catch (error) {
    document.getElementById('detail-container').innerHTML = '<div class="loading">Failed to load card details</div>';
    console.error('Error loading card:', error);
  }
}

function parseCollectionData(csvText, scryfallId) {
  const parsed = MTGCollectionCore.parseManaBoxCSV(csvText, { defaultCurrency: 'AUD' });
  const versions = parsed.cards.filter(card => card.scryfallId === scryfallId);
  if (!versions.length) return null;
  return {
    quantity: versions.reduce((sum, card) => sum + card.quantity, 0),
    foil: versions[0].foil,
    condition: versions[0].condition || 'unknown'
  };
}

function formatDetailPrice(price, currency = 'USD') {
  const symbols = { USD: '$', CAD: 'CA$', EUR: '€', GBP: '£', AUD: 'A$', JPY: '¥' };
  const symbol = symbols[currency] || currency + ' ';
  return `${symbol}${price.toFixed(2)}`;
}

function getDetailPrice(collectionCard, scryfallCard) {
  const usd = MTGCollectionCore.marketPrice({ foil: collectionCard.foil, scryfallPrices: scryfallCard.prices });
  return { price: usd * getUsdToAudRate() * collectionCard.quantity, currency: 'AUD' };
}

function renderManaSymbols(text) {
  if (!text) return '';
  return text.replace(/\{([^}]+)\}/g, (match, symbol) => {
    let sym = symbol.toLowerCase().replace(/\//g, '');
    if (sym === 't') return '<i class="ms ms-tap ms-cost"></i>';
    if (sym === 'q') return '<i class="ms ms-untap ms-cost"></i>';
    return `<i class="ms ms-${sym} ms-cost"></i>`;
  });
}

function formatFormatName(format) {
  const labels = { standardbrawl: 'Standard Brawl', competitivebrawl: 'Competitive Brawl', oathbreaker: 'Oathbreaker' };
  return labels[format] || format.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

function renderCardDetails(card, collectionCard) {
  const faceImages = card.card_faces?.map(face => face.image_uris?.large).filter(Boolean) || [];
  const imageUrl = card.image_uris?.large || faceImages[0];
  const oracleText = card.oracle_text || card.card_faces?.map(f => f.oracle_text).join('\n---\n') || 'N/A';
  const flavorText = card.flavor_text || '';
  const foilClass = collectionCard?.foil && collectionCard.foil !== 'normal' ? collectionCard.foil : '';
  const colorIdentity = card.color_identity || [];
  
  const revealClass = isReveal ? 'reveal' : '';
  
  document.getElementById('detail-container').innerHTML = `
    <div class="detail-content">
      <div class="detail-left">
        <div class="detail-image-wrapper ${foilClass} ${revealClass}">
          <div class="detail-image-inner">
            <img src="${imageUrl}" alt="${card.name}" class="detail-image" id="detail-card-face">
            <img src="images/back.png" alt="Card back" class="detail-back">
          </div>
        </div>
        ${faceImages.length > 1 ? `<div class="face-switcher" aria-label="Card faces">${card.card_faces.map((face, index) => `<button type="button" data-face-index="${index}" class="${index === 0 ? 'active' : ''}">${index === 0 ? 'Front' : 'Back'} · ${face.name}</button>`).join('')}</div>` : ''}
      </div>
      
      <div class="detail-info ${revealClass}">
        <div class="card-title">
          <h2>${card.name}</h2>
          <div class="mana-cost">${renderManaSymbols(card.mana_cost)}</div>
        </div>
        
        ${collectionCard ? `
        <div class="collection-info">
          <h3>Your Collection</h3>
          <div class="collection-stats">
            <div class="stat">
              <span class="stat-label">Quantity</span>
              <span class="stat-value">${collectionCard.quantity}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Value</span>
              <span class="stat-value">${(() => { const p = getDetailPrice(collectionCard, card); return formatDetailPrice(p.price, p.currency); })()}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Finish</span>
              <span class="stat-value">${collectionCard.foil}</span>
            </div>
            <div class="stat">
              <span class="stat-label">Condition</span>
              <span class="stat-value">${collectionCard.condition.replace('_', ' ')}</span>
            </div>
          </div>
        </div>
        ` : ''}
        
        <div class="type-line">${card.type_line}</div>
        
        ${oracleText !== 'N/A' ? `
        <div class="oracle-box">
          ${renderManaSymbols(oracleText).split('\n').map(line => `<p>${line}</p>`).join('')}
        </div>
        ` : ''}
        
        ${flavorText ? `<div class="flavor-text">"${flavorText}"</div>` : ''}
        
        ${card.power ? `
        <div class="stats-box">
          <span class="power-toughness">${card.power}/${card.toughness}</span>
        </div>
        ` : ''}
        
        ${card.loyalty ? `
        <div class="stats-box">
          <span class="loyalty">Loyalty: ${card.loyalty}</span>
        </div>
        ` : ''}
        
        <div class="meta-info">
          <div class="meta-row">
            <span class="meta-label">Set:</span>
            <span class="meta-value"><img src="https://svgs.scryfall.io/sets/${card.set}.svg" class="set-icon" onerror="this.src='https://svgs.scryfall.io/sets/default.svg'"> ${card.set_name} (${card.set.toUpperCase()} #${card.collector_number})</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Rarity:</span>
            <span class="meta-value rarity-${card.rarity}">${card.rarity.toUpperCase()}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Artist:</span>
            <span class="meta-value">${card.artist || 'Unknown'}</span>
          </div>
        </div>
        
        <div class="legality-section">
          <h3>Format Legality</h3>
          <div class="legality-grid">
            ${Object.entries(card.legalities)
              .filter(([_, status]) => status === 'legal' || status === 'restricted' || status === 'banned')
              .map(([format, status]) => `
                <div class="legality-item ${status}">
                  <span class="format-name">${formatFormatName(format)}</span>
                  <span class="status-badge">${status}</span>
                </div>
              `).join('')}
          </div>
        </div>
        
        <div class="external-links">
          <h3>Explore</h3>
          <div class="link-buttons">
            <a href="${card.scryfall_uri}" target="_blank" class="ext-btn scryfall">Scryfall</a>
            <a href="https://edhrec.com/cards/${card.name.toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-')}" target="_blank" class="ext-btn edhrec">EDHRec</a>
            <a href="https://commanderspellbook.com/search/?q=${encodeURIComponent(card.name)}" target="_blank" class="ext-btn spellbook">Combos</a>
            <a href="https://www.mtggoldfish.com/price/${card.set}/${encodeURIComponent(card.name.replace(/'/g, ''))}" target="_blank" class="ext-btn goldfish">MTGGoldfish</a>
            <a href="https://www.reddit.com/r/magicTCG/search?q=${encodeURIComponent(card.name)}&restrict_sr=1" target="_blank" class="ext-btn reddit">Reddit</a>
            <a href="https://twitter.com/search?q=mtg+${encodeURIComponent('"' + card.name + '"')}" target="_blank" class="ext-btn twitter">Twitter</a>
          </div>
        </div>
        
        <div id="upgrades-section"></div>
      </div>
    </div>
  `;
  
  document.querySelectorAll('.face-switcher button').forEach(button => button.addEventListener('click', () => {
    const index = Number(button.dataset.faceIndex);
    document.getElementById('detail-card-face').src = faceImages[index];
    document.getElementById('detail-card-face').alt = card.card_faces[index].name;
    document.querySelectorAll('.face-switcher button').forEach(item => item.classList.toggle('active', item === button));
  }));

  // Load possible upgrades
  loadUpgrades(card, collectionCard);
  
  // Add 3D tilt effect on click+drag
  const wrapper = document.querySelector('.detail-image-wrapper');
  const inner = wrapper.querySelector('.detail-image-inner');
  let isDragging = false;
  
  const startDrag = e => {
    isDragging = true;
    e.preventDefault();
  };
  
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
    const rect = wrapper.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = (clientX - rect.left) / rect.width - 0.5;
    const y = (clientY - rect.top) / rect.height - 0.5;
    inner.style.transform = `rotateX(${-y * 60}deg) rotateY(${x * 120}deg)`;
    inner.style.boxShadow = `${x * -30}px ${15 + y * -15}px 40px rgba(0,0,0,0.5)`;
    inner.style.setProperty('--shimmer-x', `${50 + x * 100}%`);
    inner.style.setProperty('--shimmer-y', `${50 + y * 100}%`);
  };
  
  wrapper.addEventListener('mousedown', startDrag);
  wrapper.addEventListener('touchstart', startDrag, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
  document.addEventListener('mousemove', onMove);
  document.addEventListener('touchmove', onMove);
  
  // Add context menu for trading binder
  wrapper.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, scryfallId);
  });
}

function createParticles(colors) {
  const colorMap = {
    W: ['#fffbd5', '#f0e6c0'],
    U: ['#0e68ab', '#4a90c2'],
    B: ['#1a1a1a', '#0a0a0a'],
    R: ['#d32f2f', '#ff6659'],
    G: ['#388e3c', '#6abf69'],
    C: ['#9e9e9e', '#bdbdbd']
  };
  
  const particleColors = colors.flatMap(c => colorMap[c] || colorMap.C);
  const container = document.getElementById('particles');
  
  function spawnParticle() {
    const particle = document.createElement('div');
    particle.className = 'particle';
    const color = particleColors[Math.floor(Math.random() * particleColors.length)];
    const size = 3 + Math.random() * 5;
    const x = Math.random() * 100;
    const duration = 8 + Math.random() * 12;
    
    particle.style.cssText = `
      left: ${x}%;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      animation-duration: ${duration}s;
      opacity: ${0.3 + Math.random() * 0.4};
    `;
    
    container.appendChild(particle);
    setTimeout(() => particle.remove(), duration * 1000);
  }
  
  // Spawn particles periodically
  for (let i = 0; i < 15; i++) {
    setTimeout(() => spawnParticle(), i * 200);
  }
  setInterval(spawnParticle, 500);
}

async function loadUpgrades(card, collectionCard) {
  if (!collectionCard) return;
  
  // Show loading
  document.getElementById('upgrades-section').innerHTML = `
    <div class="upgrades-panel">
      <h3>Other Versions</h3>
      <div class="upgrades-loading">Loading...</div>
    </div>
  `;
  
  const currentPrice = getDetailPrice(collectionCard, card).price / collectionCard.quantity;
  
  try {
    await new Promise(r => setTimeout(r, 200));
    const response = await fetch(`https://api.scryfall.com/cards/search?q=!"${card.name}"+game:paper&unique=prints`);
    if (!response.ok) {
      document.getElementById('upgrades-section').innerHTML = '';
      return;
    }
    
    const data = await response.json();
    // Expand into foil/non-foil versions
    const expanded = [];
    for (const c of data.data) {
      if (c.set === card.set && c.collector_number === card.collector_number) continue;
      const img = c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal;
      if (c.nonfoil) {
        const price = parseFloat(c.prices?.usd || '0');
        expanded.push({ id: c.id, img, setName: c.set_name, price, foil: false, uri: c.scryfall_uri });
      }
      if (c.foil) {
        const price = parseFloat(c.prices?.usd_foil || c.prices?.usd || '0');
        expanded.push({ id: c.id + '-foil', img, setName: c.set_name, price, foil: true, uri: c.scryfall_uri });
      }
    }
    expanded.sort((a, b) => a.price - b.price);
    const upgrades = expanded.filter(u => u.price > currentPrice).slice(0, 12);
    
    if (upgrades.length === 0) {
      document.getElementById('upgrades-section').innerHTML = '';
      return;
    }
    
    document.getElementById('upgrades-section').innerHTML = `
      <div class="upgrades-panel">
        <h3>Other Versions</h3>
        <div class="upgrades-grid">
          ${upgrades.map(u => `
              <div class="upgrade-card ${u.foil ? 'foil' : ''}" data-card-id="${u.id}">
                <div class="upgrade-inner">
                  <img src="${u.img}" alt="${u.setName}" class="upgrade-front">
                  <img src="images/back.png" alt="Card back" class="upgrade-back">
                </div>
                <div class="upgrade-info">
                  <a href="${u.uri}" target="_blank" class="upgrade-set-link">${u.setName}${u.foil ? ' ✨' : ''}</a>
                  <div class="upgrade-price">${u.price > 0 ? '$' + u.price.toFixed(2) : 'No price'}</div>
                </div>
              </div>
            `).join('')}
        </div>
      </div>
    `;
    
    // Add 3D tilt effect
    document.querySelectorAll('.upgrade-card').forEach(card => {
      const inner = card.querySelector('.upgrade-inner');
      let isDragging = false, hasMoved = false;
      
      const startDrag = e => {
        isDragging = true;
        hasMoved = false;
        e.preventDefault();
      };
      
      const endDrag = () => {
        if (isDragging) {
          isDragging = false;
          inner.style.transform = '';
          inner.style.setProperty('--shimmer-x', '50%');
          inner.style.setProperty('--shimmer-y', '50%');
        }
      };
      
      const onMove = e => {
        if (!isDragging) return;
        hasMoved = true;
        const rect = card.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const x = (clientX - rect.left) / rect.width - 0.5;
        const y = (clientY - rect.top) / rect.height - 0.5;
        inner.style.transform = `rotateX(${-y * 60}deg) rotateY(${x * 120}deg)`;
        inner.style.setProperty('--shimmer-x', `${50 + x * 100}%`);
        inner.style.setProperty('--shimmer-y', `${50 + y * 100}%`);
      };
      
      card.addEventListener('mousedown', startDrag);
      card.addEventListener('touchstart', startDrag, { passive: false });
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchend', endDrag);
      document.addEventListener('mousemove', onMove);
      document.addEventListener('touchmove', onMove);
      card.addEventListener('click', e => { if (hasMoved) e.preventDefault(); });
      
      // Add context menu for trading binder
      card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const cardId = card.dataset.cardId;
        showContextMenu(e.clientX, e.clientY, cardId);
      });
    });
  } catch (e) {
    console.error('Failed to load upgrades:', e);
    document.getElementById('upgrades-section').innerHTML = '';
  }
}

loadCardDetails();
