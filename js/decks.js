let deckCollection = [], activeDeck = null, deckMetadata = new Map();
async function hydrateDeckMetadata(status) {
  const ids = [...new Set(deckCollection.map(card => card.scryfallId).filter(Boolean))];
  for (let index = 0; index < ids.length; index += 75) {
    const batch = ids.slice(index, index + 75);
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({identifiers: batch.map(id => ({id}))})
    });
    if (!response.ok) throw new Error(`Scryfall metadata returned ${response.status}.`);
    const payload = await response.json();
    payload.data.forEach(card => deckMetadata.set(card.id, card));
    status.textContent = `Loading deck metadata… ${Math.min(index + 75, ids.length)} / ${ids.length}`;
    if (index + 75 < ids.length) await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function initDecks() {
  const status = document.getElementById('decks-status');
  try {
    const [csvResponse, indexResponse] = await Promise.all([fetch('data/Collection.csv'), fetch('data/decks/index.json')]);
    if (!csvResponse.ok || !indexResponse.ok) throw new Error('Collection or deck index is missing.');
    deckCollection = MTGCollectionCore.parseManaBoxCSV(await csvResponse.text(), {defaultCurrency:'AUD'}).cards;
    await hydrateDeckMetadata(status);
    const files = await indexResponse.json();
    const decks = await Promise.all(files.map(file => fetch(`data/decks/${file}`).then(response => response.json())));
    const tabs = document.getElementById('deck-tabs');
    tabs.innerHTML = decks.map((deck,index)=>`<button data-index="${index}" class="${index===0?'active':''}">${deck.name}</button>`).join('');
    tabs.addEventListener('click', event => { const button=event.target.closest('button'); if(!button)return; activeDeck=decks[button.dataset.index]; tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button)); renderConfiguredDeck(); });
    activeDeck = decks[0]; renderConfiguredDeck();
    status.className='collection-status success'; status.textContent=`${decks.length} deck pages ready.`;
  } catch(error) { status.className='collection-status error'; status.textContent=error.message; }
}
function configuredLines() { return (activeDeck?.mainboard || []).map(item => typeof item === 'string' ? `1 ${item}` : `${item.quantity || 1} ${item.name}${item.setCode ? ` (${item.setCode}) ${item.collectorNumber || ''}` : ''}`).join('\n'); }
function renderConfiguredDeck(){ document.getElementById('deck-input').value=configuredLines(); analyseDeck(); }
function analyseDeck(){
  const parsed=MTGCollectionCore.parseDeckList(document.getElementById('deck-input').value);
  const match=MTGCollectionCore.matchDeckList(parsed,deckCollection);
  const type=(name)=>[...deckMetadata.values()].find(card=>card.name.toLowerCase()===name.toLowerCase())?.type_line||'';
  const mana=(name)=>[...deckMetadata.values()].find(card=>card.name.toLowerCase()===name.toLowerCase())?.cmc||0;
  const lands=parsed.filter(c=>/\bLand\b/i.test(type(c.name))).reduce((s,c)=>s+c.quantity,0);
  const creatures=parsed.filter(c=>/\bCreature\b/i.test(type(c.name))).reduce((s,c)=>s+c.quantity,0);
  const avg=parsed.length?parsed.reduce((s,c)=>s+mana(c.name)*c.quantity,0)/parsed.reduce((s,c)=>s+c.quantity,0):0;
  document.getElementById('deck-metrics').innerHTML=[['Cards required',match.required],['Still required',match.missing],['Lands',lands],['Creatures',creatures],['Average mana value',avg.toFixed(2)],['Removed pool',activeDeck?.removed?.length||0],['Upgrade pool',activeDeck?.sideboard?.length||0],['Wishlist',activeDeck?.wishlist?.length||0]].map(([a,b])=>`<article class="metric-card"><span>${a}</span><strong>${b}</strong></article>`).join('');
  const groups={owned:[],partial:[],missing:[]}; match.results.forEach(item=>groups[item.missing===0?'owned':item.owned+item.alternativeOwned>0?'partial':'missing'].push(item));
  document.getElementById('deck-results').innerHTML=Object.entries(groups).map(([group,items])=>`<details open><summary>${group[0].toUpperCase()+group.slice(1)} <span>${items.length}</span></summary><div class="deck-match-list">${items.map(item=>`<div><strong>${item.quantity} ${item.name}</strong><span>exact ${item.owned} · alternate ${item.alternativeOwned} · missing ${item.missing}</span></div>`).join('')||'<p>None</p>'}</div></details>`).join('');
}
document.getElementById('analyse-deck').addEventListener('click',analyseDeck);
document.getElementById('load-configured').addEventListener('click',renderConfiguredDeck);
initDecks();
