(async function () {
  const Core = window.MTGCollectionCore;
  const owners = await fetch('data/collections/index.json').then(r => r.json());
  const nav = document.getElementById('site-nav');
  nav.innerHTML = `<a class="brand" href="index.html">Arcane Archive</a><div class="nav-links"><a href="all-collections.html">All Collections</a><a href="pack-pullers.html">Pack Pullers</a><a class="basket-link" href="trade-basket.html">Trade Basket (<span data-basket-count>0</span>)</a></div>`;
  document.getElementById('home-libraries').innerHTML = owners.map(owner =>
    `<a class="library-link" href="library.html?owner=${owner.id}"><strong>${owner.name}</strong><span id="owner-${owner.id}">Checking collection…</span></a>`).join('');
  let cards = [], uploaded = 0;
  await Promise.all(owners.map(async owner => {
    const label = document.getElementById(`owner-${owner.id}`);
    try {
      const response = await fetch(owner.file); if (!response.ok) throw new Error();
      const parsed = Core.parseManaBoxCSV(await response.text());
      const owned = Core.applyOwnerMetadata(parsed.cards, owner); cards.push(...owned); uploaded++;
      label.textContent = `${owned.reduce((sum, card) => sum + card.quantity, 0).toLocaleString()} cards`;
    } catch (_) { label.textContent = 'Collection not yet uploaded'; }
  }));
  const groups = Core.groupCardsByName(cards);
  document.getElementById('home-summary').textContent = `${cards.reduce((sum,c)=>sum+c.quantity,0).toLocaleString()} group cards · ${groups.length.toLocaleString()} unique names · ${uploaded} uploaded libraries`;
  let basket=[]; try{basket=JSON.parse(localStorage.getItem('mtg-trade-basket-v1')||'[]')}catch(_){}
  document.querySelectorAll('[data-basket-count]').forEach(el=>el.textContent=basket.reduce((s,i)=>s+i.quantityRequested,0));
})();
