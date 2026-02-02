// Binder view specific code
let binderPage = 0;
const CARDS_PER_BINDER_PAGE = 18;
const CARDS_PER_MOBILE_PAGE = 4;

function renderBinder(direction = null) {
  const binder = document.getElementById('binder');
  const leftPage = document.querySelector('.binder-page-left');
  const rightPage = document.querySelector('.binder-page-right');
  const pagesContainer = document.querySelector('.binder-pages');
  const mobile = isMobile();
  
  const renderPageCards = (cards) => cards.map(card => {
    const foilClass = card.foil !== 'normal' ? card.foil : '';
    return `
      <div class="binder-card ${foilClass}" data-scryfall-id="${card.scryfallId}">
        <a href="detail.html?id=${card.scryfallId}">
          <img alt="${card.name}" class="card-image">
        </a>
      </div>
    `}).join('') + Array(Math.max(0, 9 - cards.length)).fill('<div class="binder-card"></div>').join('');
  
  const loadImages = () => {
    const size = mobile ? 'normal' : 'small';
    document.querySelectorAll('.binder-card[data-scryfall-id]').forEach(card => {
      const img = card.querySelector('img');
      const id = card.dataset.scryfallId;
      fetchCardImage(id, size).then(url => { if (url) img.src = url; });
    });
  };
  
  // Mobile single-page logic
  if (mobile) {
    binder.classList.remove('mobile-show-left');
    const mobileStart = binderPage * CARDS_PER_MOBILE_PAGE;
    const currCards = filteredCollection.slice(mobileStart, mobileStart + CARDS_PER_MOBILE_PAGE);
    const totalMobilePages = Math.ceil(filteredCollection.length / CARDS_PER_MOBILE_PAGE);
    
    document.getElementById('binder-page-num').textContent = `${binderPage + 1} / ${totalMobilePages}`;
    document.querySelector('.binder-mobile-prev').disabled = binderPage === 0;
    document.querySelector('.binder-mobile-next').disabled = binderPage >= totalMobilePages - 1;
    
    if (direction === 'next') {
      const prevStart = (binderPage - 1) * CARDS_PER_MOBILE_PAGE;
      const oldCards = filteredCollection.slice(prevStart, prevStart + CARDS_PER_MOBILE_PAGE);
      
      rightPage.innerHTML = renderPageCards(currCards);
      
      const flipPage = document.createElement('div');
      flipPage.className = 'flip-page flip-page-next';
      flipPage.innerHTML = `<div class="flip-page-inner"><div class="flip-page-front">${renderPageCards(oldCards)}</div></div>`;
      pagesContainer.appendChild(flipPage);
      loadImages();
      
      requestAnimationFrame(() => {
        flipPage.classList.add('flipping');
        flipPage.addEventListener('animationend', () => flipPage.remove(), { once: true });
      });
      
    } else if (direction === 'prev') {
      const nextStart = (binderPage + 1) * CARDS_PER_MOBILE_PAGE;
      const oldCards = filteredCollection.slice(nextStart, nextStart + CARDS_PER_MOBILE_PAGE);
      
      rightPage.innerHTML = renderPageCards(currCards);
      
      const flipPage = document.createElement('div');
      flipPage.className = 'flip-page flip-page-prev';
      flipPage.innerHTML = `<div class="flip-page-inner"><div class="flip-page-front">${renderPageCards(oldCards)}</div></div>`;
      pagesContainer.appendChild(flipPage);
      loadImages();
      
      requestAnimationFrame(() => {
        flipPage.classList.add('flipping');
        flipPage.addEventListener('animationend', () => flipPage.remove(), { once: true });
      });
      
    } else {
      rightPage.innerHTML = renderPageCards(currCards);
      loadImages();
    }
    
    setupBinderHover();
    return;
  }
  
  // Desktop two-page logic
  const updateNav = () => {
    document.getElementById('binder-page-num').textContent = `${binderPage + 1} / ${Math.ceil(filteredCollection.length / CARDS_PER_BINDER_PAGE) || 1}`;
    document.querySelector('.binder-prev').disabled = binderPage === 0;
    document.querySelector('.binder-next').disabled = (binderPage + 1) * CARDS_PER_BINDER_PAGE >= filteredCollection.length;
  };
  
  if (direction === 'next') {
    const prevStart = (binderPage - 1) * CARDS_PER_BINDER_PAGE;
    const prevCards = filteredCollection.slice(prevStart, prevStart + CARDS_PER_BINDER_PAGE);
    const currStart = binderPage * CARDS_PER_BINDER_PAGE;
    const currCards = filteredCollection.slice(currStart, currStart + CARDS_PER_BINDER_PAGE);
    
    // Clone current right page for flip animation (already has images loaded)
    const rightClone = rightPage.cloneNode(true);
    
    // Set new content immediately underneath
    leftPage.innerHTML = renderPageCards(currCards.slice(0, 9));
    rightPage.innerHTML = renderPageCards(currCards.slice(9, 18));
    loadImages();
    
    // Create flip overlay using cloned content
    const flipPage = document.createElement('div');
    flipPage.className = 'flip-page flip-page-next';
    flipPage.innerHTML = `<div class="flip-page-inner"><div class="flip-page-front"></div><div class="flip-page-back"></div></div>`;
    flipPage.querySelector('.flip-page-front').appendChild(rightClone);
    flipPage.querySelector('.flip-page-front').innerHTML = rightClone.innerHTML;
    flipPage.querySelector('.flip-page-back').innerHTML = leftPage.innerHTML;
    pagesContainer.appendChild(flipPage);
    
    // Load images in flip back
    flipPage.querySelectorAll('.flip-page-back .binder-card[data-scryfall-id]').forEach(card => {
      const img = card.querySelector('img');
      const id = card.dataset.scryfallId;
      fetchCardImage(id, 'small').then(url => { if (url) img.src = url; });
    });
    
    requestAnimationFrame(() => {
      flipPage.classList.add('flipping');
      flipPage.addEventListener('animationend', () => {
        flipPage.remove();
        setupBinderHover();
      }, { once: true });
    });
    
  } else if (direction === 'prev') {
    const nextStart = (binderPage + 1) * CARDS_PER_BINDER_PAGE;
    const nextCards = filteredCollection.slice(nextStart, nextStart + CARDS_PER_BINDER_PAGE);
    const currStart = binderPage * CARDS_PER_BINDER_PAGE;
    const currCards = filteredCollection.slice(currStart, currStart + CARDS_PER_BINDER_PAGE);
    
    // Clone current left page for flip animation (already has images loaded)
    const leftClone = leftPage.cloneNode(true);
    
    // Set new content immediately underneath
    leftPage.innerHTML = renderPageCards(currCards.slice(0, 9));
    rightPage.innerHTML = renderPageCards(currCards.slice(9, 18));
    loadImages();
    
    // Create flip overlay using cloned content
    const flipPage = document.createElement('div');
    flipPage.className = 'flip-page flip-page-prev';
    flipPage.innerHTML = `<div class="flip-page-inner"><div class="flip-page-front"></div><div class="flip-page-back"></div></div>`;
    flipPage.querySelector('.flip-page-front').innerHTML = leftClone.innerHTML;
    flipPage.querySelector('.flip-page-back').innerHTML = rightPage.innerHTML;
    pagesContainer.appendChild(flipPage);
    
    // Load images in flip back
    flipPage.querySelectorAll('.flip-page-back .binder-card[data-scryfall-id]').forEach(card => {
      const img = card.querySelector('img');
      const id = card.dataset.scryfallId;
      fetchCardImage(id, 'small').then(url => { if (url) img.src = url; });
    });
    
    requestAnimationFrame(() => {
      flipPage.classList.add('flipping');
      flipPage.addEventListener('animationend', () => {
        flipPage.remove();
        setupBinderHover();
      }, { once: true });
    });
    
  } else {
    const start = binderPage * CARDS_PER_BINDER_PAGE;
    const pageCards = filteredCollection.slice(start, start + CARDS_PER_BINDER_PAGE);
    leftPage.innerHTML = renderPageCards(pageCards.slice(0, 9));
    rightPage.innerHTML = renderPageCards(pageCards.slice(9, 18));
    loadImages();
  }
  
  updateNav();
  setupBinderHover();
}

function setupBinderHover() {
  const preview = document.getElementById('card-preview');
  const previewImg = preview.querySelector('img');
  
  document.querySelectorAll('.binder-card[data-scryfall-id]').forEach(card => {
    card.addEventListener('mouseenter', async (e) => {
      const id = card.dataset.scryfallId;
      const url = await fetchCardImage(id, 'normal');
      if (url) {
        previewImg.src = url;
        preview.classList.remove('hidden');
      }
    });
    
    card.addEventListener('mousemove', (e) => {
      const x = Math.min(e.clientX + 20, window.innerWidth - 320);
      const y = Math.min(e.clientY - 100, window.innerHeight - 450);
      preview.style.left = x + 'px';
      preview.style.top = Math.max(10, y) + 'px';
    });
    
    card.addEventListener('mouseleave', () => {
      preview.classList.add('hidden');
    });
  });
}

function onCollectionLoaded() {
  binderPage = 0;
  renderBinder();
}

function onFiltersApplied() {
  binderPage = 0;
  renderBinder();
}

// Event listeners
document.querySelector('.binder-prev').addEventListener('click', () => {
  binderPage--;
  renderBinder('prev');
});
document.querySelector('.binder-next').addEventListener('click', () => {
  binderPage++;
  renderBinder('next');
});
document.querySelector('.binder-mobile-prev').addEventListener('click', () => {
  binderPage--;
  renderBinder('prev');
});
document.querySelector('.binder-mobile-next').addEventListener('click', () => {
  binderPage++;
  renderBinder('next');
});
