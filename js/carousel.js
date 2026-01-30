// Carousel view specific code
let carouselIndex = 0;

function renderCarousel() {
  const container = document.querySelector('.carousel-cards');
  const scrollY = window.scrollY;
  const visibleCount = 5;
  
  let start = carouselIndex - 2;
  let end = carouselIndex + 3;
  
  let cards = [];
  for (let i = start; i < end; i++) {
    if (i < 0 || i >= filteredCollection.length) {
      cards.push(null);
    } else {
      cards.push({ ...filteredCollection[i], index: i });
    }
  }
  
  container.innerHTML = cards.map((card, i) => {
    if (!card) return '<div class="carousel-card placeholder"></div>';
    const isActive = card.index === carouselIndex;
    const isAdjacent = Math.abs(card.index - carouselIndex) === 1;
    const foilClass = card.foil !== 'normal' ? card.foil : '';
    return `
      <div class="carousel-card ${isActive ? 'active' : ''} ${isAdjacent ? 'adjacent' : ''} ${foilClass}" data-index="${card.index}" data-scryfall-id="${card.scryfallId}">
        <a href="detail.html?id=${card.scryfallId}">
          <img alt="${card.name}" class="card-image" draggable="false">
        </a>
        <div class="carousel-card-info">
          <div class="carousel-card-name">${card.name}</div>
          <div class="carousel-card-price">${formatPrice(card.price * card.quantity, card.currency)}</div>
        </div>
      </div>
    `;
  }).join('');
  
  document.getElementById('carousel-current').textContent = carouselIndex + 1;
  document.getElementById('carousel-total').textContent = filteredCollection.length;
  document.querySelector('.carousel-prev').disabled = carouselIndex === 0;
  document.querySelector('.carousel-next').disabled = carouselIndex >= filteredCollection.length - 1;
  document.querySelector('.carousel-mobile-prev').disabled = carouselIndex === 0;
  document.querySelector('.carousel-mobile-next').disabled = carouselIndex >= filteredCollection.length - 1;
  
  container.querySelectorAll('.carousel-card[data-scryfall-id]').forEach(card => {
    const img = card.querySelector('img');
    const id = card.dataset.scryfallId;
    const isActive = card.classList.contains('active');
    fetchCardImage(id, isActive ? 'normal' : 'small').then(url => { if (url) img.src = url; });
  });
}

function onCollectionLoaded() {
  carouselIndex = 0;
  renderCarousel();
}

function onFiltersApplied() {
  carouselIndex = 0;
  renderCarousel();
}

// Event listeners
document.querySelector('.carousel-prev').addEventListener('click', (e) => { 
  e.preventDefault(); 
  e.stopPropagation();
  const scrollY = window.scrollY;
  carouselIndex--; 
  renderCarousel(); 
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
});
document.querySelector('.carousel-next').addEventListener('click', (e) => { 
  e.preventDefault(); 
  e.stopPropagation();
  const scrollY = window.scrollY;
  carouselIndex++; 
  renderCarousel(); 
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
});
document.querySelector('.carousel-mobile-prev').addEventListener('click', (e) => { 
  e.preventDefault(); 
  const scrollY = window.scrollY;
  carouselIndex--; 
  renderCarousel(); 
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
});
document.querySelector('.carousel-mobile-next').addEventListener('click', (e) => { 
  e.preventDefault(); 
  const scrollY = window.scrollY;
  carouselIndex++; 
  renderCarousel(); 
  requestAnimationFrame(() => window.scrollTo(0, scrollY));
});
