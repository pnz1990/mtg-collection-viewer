const params = new URLSearchParams(window.location.search);
const scryfallId = params.get('id');

async function loadCardDetails() {
  if (!scryfallId) {
    document.getElementById('detail-container').innerHTML = '<div class="loading">No card specified</div>';
    return;
  }

  try {
    const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
      headers: {
        'User-Agent': 'MTGCollectionViewer/1.0',
        'Accept': 'application/json'
      }
    });
    const card = await response.json();
    
    renderCardDetails(card);
  } catch (error) {
    document.getElementById('detail-container').innerHTML = '<div class="loading">Failed to load card details</div>';
    console.error('Error loading card:', error);
  }
}

function renderCardDetails(card) {
  const imageUrl = card.image_uris?.large || card.card_faces?.[0]?.image_uris?.large;
  const oracleText = card.oracle_text || card.card_faces?.map(f => f.oracle_text).join('\n---\n') || 'N/A';
  const flavorText = card.flavor_text || '';
  
  document.getElementById('detail-container').innerHTML = `
    <div class="detail-content">
      <div>
        <img src="${imageUrl}" alt="${card.name}" class="detail-image">
      </div>
      
      <div class="detail-info">
        <h2>${card.name}</h2>
        
        <div class="detail-section">
          <h3>Card Information</h3>
          <div class="detail-grid">
            <span class="detail-label">Mana Cost:</span>
            <span class="detail-value">${card.mana_cost || 'N/A'}</span>
            
            <span class="detail-label">Type:</span>
            <span class="detail-value">${card.type_line}</span>
            
            <span class="detail-label">Rarity:</span>
            <span class="detail-value">${card.rarity}</span>
            
            <span class="detail-label">Set:</span>
            <span class="detail-value">${card.set_name} (${card.set.toUpperCase()})</span>
            
            <span class="detail-label">Collector #:</span>
            <span class="detail-value">${card.collector_number}</span>
            
            ${card.power ? `<span class="detail-label">Power/Toughness:</span>
            <span class="detail-value">${card.power}/${card.toughness}</span>` : ''}
            
            ${card.loyalty ? `<span class="detail-label">Loyalty:</span>
            <span class="detail-value">${card.loyalty}</span>` : ''}
            
            <span class="detail-label">Artist:</span>
            <span class="detail-value">${card.artist || 'Unknown'}</span>
          </div>
        </div>
        
        <div class="detail-section">
          <h3>Oracle Text</h3>
          <div class="oracle-text">
            ${oracleText}
            ${flavorText ? `<div class="flavor-text">${flavorText}</div>` : ''}
          </div>
        </div>
        
        <div class="detail-section">
          <h3>Legality</h3>
          <div class="detail-grid">
            ${Object.entries(card.legalities)
              .filter(([_, status]) => status === 'legal' || status === 'restricted' || status === 'banned')
              .slice(0, 8)
              .map(([format, status]) => `
                <span class="detail-label">${format.charAt(0).toUpperCase() + format.slice(1)}:</span>
                <span class="detail-value">${status}</span>
              `).join('')}
          </div>
        </div>
        
        ${card.prices ? `
        <div class="detail-section">
          <h3>Prices</h3>
          <div class="detail-grid">
            ${card.prices.usd ? `<span class="detail-label">USD:</span><span class="detail-value">$${card.prices.usd}</span>` : ''}
            ${card.prices.usd_foil ? `<span class="detail-label">USD Foil:</span><span class="detail-value">$${card.prices.usd_foil}</span>` : ''}
            ${card.prices.eur ? `<span class="detail-label">EUR:</span><span class="detail-value">€${card.prices.eur}</span>` : ''}
          </div>
        </div>
        ` : ''}
      </div>
    </div>
  `;
}

loadCardDetails();
