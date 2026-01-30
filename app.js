let collection = [];
let filteredCollection = [];
const imageCache = new Map();

async function loadCollection() {
  const response = await fetch('Collection.csv');
  const text = await response.text();
  const lines = text.split('\n').slice(1);
  
  collection = lines
    .filter(line => line.trim())
    .map(line => {
      const parts = parseCSVLine(line);
      return {
        name: parts[0],
        setCode: parts[1],
        setName: parts[2],
        collectorNumber: parts[3],
        foil: parts[4],
        rarity: parts[5],
        quantity: parseInt(parts[6]) || 1,
        scryfallId: parts[8],
        price: parseFloat(parts[9]) || 0,
        condition: parts[12],
        language: parts[13]
      };
    });
  
  filteredCollection = [...collection];
  updateStats();
  renderCollection();
  loadImages();
}

async function loadImages() {
  const batchSize = 10;
  
  for (let i = 0; i < filteredCollection.length; i += batchSize) {
    const batch = filteredCollection.slice(i, i + batchSize);
    
    await Promise.all(batch.map(async (card) => {
      if (imageCache.has(card.scryfallId)) return;
      
      try {
        const response = await fetch(`https://api.scryfall.com/cards/${card.scryfallId}`, {
          headers: {
            'User-Agent': 'MTGCollectionViewer/1.0',
            'Accept': 'application/json'
          }
        });
        const data = await response.json();
        const imageUrl = data.image_uris?.small || data.card_faces?.[0]?.image_uris?.small;
        
        if (imageUrl) {
          imageCache.set(card.scryfallId, imageUrl);
          const imgElement = document.querySelector(`[data-scryfall-id="${card.scryfallId}"] img`);
          if (imgElement) imgElement.src = imageUrl;
        }
      } catch (error) {
        console.error(`Failed to load image for ${card.name}:`, error);
      }
    }));
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
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

function updateStats() {
  const totalCards = filteredCollection.reduce((sum, card) => sum + card.quantity, 0);
  const totalValue = filteredCollection.reduce((sum, card) => sum + (card.price * card.quantity), 0);
  
  document.getElementById('total-cards').textContent = totalCards;
  document.getElementById('total-value').textContent = `$${totalValue.toFixed(2)}`;
}

function renderCollection() {
  const container = document.getElementById('collection');
  container.innerHTML = filteredCollection.map(card => {
    const cachedImage = imageCache.get(card.scryfallId) || '';
    return `
    <div class="card" data-scryfall-id="${card.scryfallId}">
      <a href="detail.html?id=${card.scryfallId}" class="card-link">
        <img src="${cachedImage}" alt="${card.name}" class="card-image">
        <div class="card-header">
          <div class="card-name">${card.name}</div>
          <div class="card-value">$${(card.price * card.quantity).toFixed(2)}</div>
        </div>
        <div class="card-set">${card.setName} (${card.setCode})</div>
        <div class="card-details">
          <span class="badge rarity-${card.rarity}">${card.rarity}</span>
          ${card.foil !== 'normal' ? `<span class="badge foil-${card.foil}">${card.foil}</span>` : ''}
          ${card.quantity > 1 ? `<span class="badge quantity">x${card.quantity}</span>` : ''}
        </div>
      </a>
    </div>
  `;
  }).join('');
}

function applyFilters() {
  const search = document.getElementById('search').value.toLowerCase();
  const rarity = document.getElementById('rarity-filter').value;
  const foil = document.getElementById('foil-filter').value;
  const sort = document.getElementById('sort').value;
  
  filteredCollection = collection.filter(card => {
    const matchesSearch = card.name.toLowerCase().includes(search);
    const matchesRarity = !rarity || card.rarity === rarity;
    const matchesFoil = !foil || card.foil === foil;
    return matchesSearch && matchesRarity && matchesFoil;
  });
  
  filteredCollection.sort((a, b) => {
    switch(sort) {
      case 'value': return (b.price * b.quantity) - (a.price * a.quantity);
      case 'rarity': return b.rarity.localeCompare(a.rarity);
      case 'set': return a.setName.localeCompare(b.setName);
      default: return a.name.localeCompare(b.name);
    }
  });
  
  updateStats();
  renderCollection();
  loadImages();
}

document.getElementById('search').addEventListener('input', applyFilters);
document.getElementById('rarity-filter').addEventListener('change', applyFilters);
document.getElementById('foil-filter').addEventListener('change', applyFilters);
document.getElementById('sort').addEventListener('change', applyFilters);

loadCollection();
