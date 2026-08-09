(async function () {
  const target = document.getElementById('product-grid');
  const status = document.getElementById('product-status');
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  try {
    const productsResponse = await fetch('data/pack-pullers/index.json');
    if (!productsResponse.ok) throw new Error('The Pack Pullers product list is unavailable.');
    const products = await productsResponse.json();
    const cardsByProduct = await Promise.all(products.map(async product => {
      if (!product.enabled) return [product.id, 0];
      try { const response = await fetch(product.generatedIndex); const data = response.ok ? await response.json() : { cards: [] }; return [product.id, data.cards.length]; }
      catch (_) { return [product.id, 0]; }
    }));
    const counts = Object.fromEntries(cardsByProduct);
    target.innerHTML = products.map(product => `<article class="product-tile ${product.enabled ? '' : 'disabled'}"><div class="pack-art" aria-hidden="true"><span>MARVEL</span><strong>COLLECTOR</strong><small>BOOSTER</small></div><div><p class="eyebrow">${esc(product.boosterType)}</p><h2>${esc(product.name)}</h2><dl><div><dt>Release</dt><dd>${esc(product.releaseYear || String(product.releaseDate).slice(0,4))}</dd></div><div><dt>Sets</dt><dd>MSH · MSC · MAR</dd></div><div><dt>Indexed</dt><dd>${counts[product.id].toLocaleString()} eligible printings</dd></div></dl>${product.enabled ? `<a class="primary-action" href="pack-puller.html?product=${encodeURIComponent(product.id)}">Open Pull Guide</a>` : '<span class="coming-soon">Coming later</span>'}</div></article>`).join('');
    status.hidden = true;
  } catch (error) { status.textContent = error.message || 'Pack Pullers could not be loaded.'; status.classList.add('error'); }
})();
