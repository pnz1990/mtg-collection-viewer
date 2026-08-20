const EDHREC_TOP_COMMANDERS = [
  "The Ur-Dragon","Edgar Markov","Y'shtola, Night's Blessed","Atraxa, Praetors' Voice","Krenko, Mob Boss",
  "Kaalia of the Vast","Vivi Ornitier","Ms. Bumbleflower","Sauron, the Dark Lord","Teval, the Balanced Scale",
  "Pantlaza, Sun-Favored","Fire Lord Azula","Lathril, Blade of the Elves","Giada, Font of Hope","The Wise Mothman",
  "Jodah, the Unifier","Yuriko, the Tiger's Shadow","Nekusar, the Mindrazer","Kenrith, the Returned King","Baylen, the Haymaker",
  "Isshin, Two Heavens as One","Valgavoth, Harrower of Souls","Toph, the First Metalbender","Kefka, Court Mage","Cloud, Ex-SOLDIER",
  "Hearthhull, the Worldseed","Miirym, Sentinel Wyrm","Sephiroth, Fabled SOLDIER","Chatterfang, Squirrel General","Ulalek, Fused Atrocity",
  "Bello, Bard of the Brambles","Hashaton, Scarab's Fist","Esika, God of the Tree","Hakbal of the Surging Soul",
  "Frodo, Adventurous Hobbit // Sam, Loyal Attendant","Muldrotha, the Gravetide","Flubs, the Fool","Glarb, Calamity's Augur",
  "Ygra, Eater of All","Ashling, the Limitless","Rin and Seri, Inseparable","The Necrobloom","Animar, Soul of Elements",
  "Arcades, the Strategist","Caesar, Legion's Emperor","Mr. House, President and CEO","Aragorn, the Uniter","Wilhelt, the Rotcleaver",
  "Breya, Etherium Shaper","Arabella, Abandoned Doll","Meren of Clan Nel Toth","Oloro, Ageless Ascetic","Gishath, Sun's Avatar",
  "Teysa Karlov","Zhulodok, Void Gorger","Shorikai, Genesis Engine","Kinnan, Bonder Prodigy","Ureni of the Unwritten",
  "Go-Shintai of Life's Origin","Tom Bombadil","Korvold, Fae-Cursed King","Atla Palani, Nest Tender","Helga, Skittish Seer",
  "Maralen, Fae Ascendant","Kuja, Genome Sorcerer","K'rrik, Son of Yawgmoth","Ghyrson Starn, Kelermorph","Urza, Lord High Artificer",
  "Zurgo Stormrender","Zaxara, the Exemplary","Xyris, the Writhing Storm","Tidus, Yuna's Guardian","The First Sliver",
  "Zinnia, Valley's Voice","Felothar the Steadfast","Queen Marchesa","The Wandering Minstrel","Eriette of the Charmed Apple",
  "Choco, Seeker of Paradise","Kotis, the Fangkeeper","Ezio Auditore da Firenze",'Henzie "Toolbox" Torre',"Omnath, Locus of Creation",
  "Voja, Jaws of the Conclave","Sisay, Weatherlight Captain","Terra, Magical Adept","Avatar Aang","Captain N'ghathrod",
  "Sidar Jabari of Zhalfir","Urtet, Remnant of Memnarch","Betor, Ancestor's Voice","Terra, Herald of Hope","Ragost, Deft Gastronaut",
  "Obeka, Splitter of Seconds","Auntie Ool, Cursewretch","Kilo, Apogee Mind","Alela, Cunning Conqueror","Atraxa, Grand Unifier",
  "Magda, Brazen Outlaw","Aminatou, Veil Piercer"
];

let ownedCommanders = [];
let edhrecRanks = new Map();

const commanderSlug = name => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const colourLabel = identity => identity?.length ? identity.join(' · ') : 'Colourless';
const edhrecEntryFor = card => edhrecRanks.get(card.name.toLowerCase()) || null;
const rankFor = card => edhrecEntryFor(card)?.rank || null;

async function hydrateCommanderCandidates(cards, status) {
  const ids = [...new Set(cards.map(card => card.scryfallId).filter(Boolean))];
  const metadata = new Map();
  for (let i = 0; i < ids.length; i += 75) {
    const batch = ids.slice(i, i + 75);
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: batch.map(id => ({ id })) })
    });
    if (!response.ok) throw new Error(`Scryfall returned ${response.status}`);
    const payload = await response.json();
    payload.data.forEach(card => metadata.set(card.id, card));
    status.textContent = `Checking legendary creatures… ${Math.min(i + 75, ids.length)} / ${ids.length}`;
    if (i + 75 < ids.length) await new Promise(resolve => setTimeout(resolve, 100));
  }
  return metadata;
}

function renderOwnedCommanders() {
  const query = document.getElementById('commander-search').value.trim().toLowerCase();
  const colour = document.getElementById('commander-colour').value;
  const visible = ownedCommanders.filter(card =>
    (!query || card.name.toLowerCase().includes(query)) &&
    (!colour || (colour === 'C' ? card.color_identity.length === 0 : card.color_identity.includes(colour)))
  );
  document.getElementById('commander-ranking-grid').innerHTML = visible.map(card => {
    const rank = rankFor(card);
    const image = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || 'images/back.png';
    return `<a class="commander-ranking-card" href="https://edhrec.com/commanders/${commanderSlug(card.name)}" target="_blank" rel="noopener">
      <img src="${image}" alt="${card.name}" loading="lazy">
      <div class="commander-ranking-copy">
        <strong class="edhrec-rank">${rank ? `Rank #${rank.toLocaleString('en-AU')}` : 'Not yet ranked'}</strong>
        <span>${rank ? `${edhrecEntryFor(card).decks.toLocaleString('en-AU')} decks · ` : ''}${card.ownedQuantity} owned · ${colourLabel(card.color_identity)}</span>
      </div>
    </a>`;
  }).join('') || '<p class="empty-note">No owned commanders match those filters.</p>';
}

async function initCommanderRankings() {
  const status = document.getElementById('commander-rank-status');
  try {
    const response = await fetch('data/Collection.csv');
    if (!response.ok) throw new Error('Collection.csv could not be loaded.');
    const rankingResponse = await fetch('data/edhrec-rankings.json');
    if (!rankingResponse.ok) throw new Error('The EDHREC ranking snapshot could not be loaded.');
    const rankingData = await rankingResponse.json();
    edhrecRanks = new Map(rankingData.commanders.map(entry => [entry.name.toLowerCase(), entry]));
    const parsed = MTGCollectionCore.parseManaBoxCSV(await response.text(), { defaultCurrency: 'AUD' });
    if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
    const metadata = await hydrateCommanderCandidates(parsed.cards, status);
    const byOracle = new Map();
    parsed.cards.forEach(owned => {
      const card = metadata.get(owned.scryfallId);
      if (!card || !/\bLegendary\b.*\bCreature\b/i.test(card.type_line || '') || card.legalities?.commander !== 'legal') return;
      const key = card.oracle_id || card.name.toLowerCase();
      const existing = byOracle.get(key);
      if (existing) existing.ownedQuantity += owned.quantity;
      else byOracle.set(key, { ...card, ownedQuantity: owned.quantity });
    });
    ownedCommanders = [...byOracle.values()].sort((a, b) =>
      (rankFor(a) || Number.MAX_SAFE_INTEGER) - (rankFor(b) || Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name)
    );
    const ranked = ownedCommanders.filter(rankFor).length;
    const highest = ownedCommanders.find(rankFor);
    document.getElementById('commander-rank-summary').innerHTML = [
      ['Owned commanders', ownedCommanders.length, 'Unique legal legendary creatures'],
      ['EDHREC ranked', ranked, 'Owned commanders with a current rank'],
      ['Highest ranked', highest ? `#${rankFor(highest)} · ${highest.name}` : 'None', 'Among your owned collection']
    ].map(([label, value, note]) => `<article class="metric-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    status.className = 'collection-status success';
    status.innerHTML = `EDHREC commander leaderboard snapshot from ${rankingData.updated} · <a href="https://edhrec.com/commanders" target="_blank" rel="noopener">view the live leaderboard</a>.`;
    renderOwnedCommanders();
  } catch (error) {
    status.className = 'collection-status error';
    status.textContent = `Commander rankings could not load: ${error.message}`;
  }
}

document.getElementById('commander-search').addEventListener('input', renderOwnedCommanders);
document.getElementById('commander-colour').addEventListener('change', renderOwnedCommanders);
document.getElementById('menu-toggle').addEventListener('click', () => {
  document.getElementById('menu-dropdown').classList.toggle('show');
  document.getElementById('menu-overlay').classList.toggle('show');
});
document.getElementById('menu-overlay').addEventListener('click', () => {
  document.getElementById('menu-dropdown').classList.remove('show');
  document.getElementById('menu-overlay').classList.remove('show');
});
initCommanderRankings();
