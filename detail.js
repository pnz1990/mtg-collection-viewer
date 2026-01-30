const params = new URLSearchParams(window.location.search);
const scryfallId = params.get('id');

async function loadCardDetails() {
  if (!scryfallId) {
    document.getElementById('detail-container').innerHTML = '<div class="loading">No card specified</div>';
    return;
  }

  try {
    const [cardResponse, csvResponse] = await Promise.all([
      fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
        headers: {
          'User-Agent': 'MTGCollectionViewer/1.0',
          'Accept': 'application/json'
        }
      }),
      fetch('Collection.csv')
    ]);
    
    const card = await cardResponse.json();
    const csvText = await csvResponse.text();
    const collectionCard = parseCollectionData(csvText, scryfallId);
    
    renderCardDetails(card, collectionCard);
  } catch (error) {
    document.getElementById('detail-container').innerHTML = '<div class="loading">Failed to load card details</div>';
    console.error('Error loading card:', error);
  }
}

function parseCollectionData(csvText, scryfallId) {
  const lines = csvText.split('\n').slice(1);
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts[8] === scryfallId) {
      return {
        quantity: parseInt(parts[6]) || 1,
        price: parseFloat(parts[9]) || 0,
        foil: parts[4],
        condition: parts[12]
      };
    }
  }
  return null;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function renderManaSymbols(text) {
  if (!text) return '';
  return text.replace(/\{([^}]+)\}/g, (match, symbol) => {
    const sym = symbol.toLowerCase();
    if (sym === 't') return '<i class="ms ms-tap ms-cost"></i>';
    if (sym === 'q') return '<i class="ms ms-untap ms-cost"></i>';
    return `<i class="ms ms-${sym} ms-cost"></i>`;
  });
}

function renderCardDetails(card, collectionCard) {
  const imageUrl = card.image_uris?.large || card.card_faces?.[0]?.image_uris?.large;
  const artCropUrl = card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop;
  const oracleText = card.oracle_text || card.card_faces?.map(f => f.oracle_text).join('\n---\n') || 'N/A';
  const flavorText = card.flavor_text || '';
  const foilClass = collectionCard?.foil && collectionCard.foil !== 'normal' ? collectionCard.foil : '';
  const colorIdentity = card.color_identity || [];
  
  // Set dynamic background with art crop
  if (artCropUrl) {
    document.body.style.setProperty('--art-bg', `url(${artCropUrl})`);
    document.body.classList.add('has-art-bg');
  }
  
  // Create particle container
  const particleContainer = document.createElement('div');
  particleContainer.id = 'particles';
  particleContainer.className = 'particles';
  document.body.appendChild(particleContainer);
  
  // Start particles with color identity (empty = colorless/grey)
  createParticles(colorIdentity.length > 0 ? colorIdentity : ['C']);
  
  document.getElementById('detail-container').innerHTML = `
    <div class="detail-content">
      <div class="detail-left">
        <div class="detail-image-wrapper ${foilClass}">
          <div class="detail-image-inner">
            <img src="${imageUrl}" alt="${card.name}" class="detail-image">
            <img src="back.png" alt="Card back" class="detail-back">
          </div>
        </div>
      </div>
      
      <div class="detail-info">
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
              <span class="stat-value">$${(collectionCard.price * collectionCard.quantity).toFixed(2)}</span>
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
        
        ${card.oracle_text ? `
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
            <span class="meta-value">${card.set_name} (${card.set.toUpperCase()} #${card.collector_number})</span>
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
                  <span class="format-name">${format}</span>
                  <span class="status-badge">${status}</span>
                </div>
              `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
  
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
    inner.style.transform = `rotateX(${-y * 20}deg) rotateY(${x * 20}deg)`;
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

loadCardDetails();
