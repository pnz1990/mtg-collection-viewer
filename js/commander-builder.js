const CATEGORIES = {
  'Ramp': [/\badd \{/, /search your library for (?:a|up to one) (?:basic )?land/, /treasure token/, /costs? \{?\d\}? less/],
  'Card draw': [/\bdraw (?:a|one|two|three|\d+) cards?/, /investigate/, /impulse draw/],
  'Targeted removal': [/\bdestroy target\b/, /\bexile target\b/, /deals? \d+ damage to any target/, /return target .* to (?:its|their) owner's hand/],
  'Board wipes': [/\bdestroy all\b/, /\bexile all\b/, /each creature gets -/, /deals? \d+ damage to each creature/],
  'Protection': [/\bhexproof\b/, /\bindestructible\b/, /\bprotection from\b/, /\bphase out\b/, /counter target spell that targets/],
  'Recursion': [/return target .* from your graveyard/, /cast .* from your graveyard/, /put target .* from a graveyard/],
  'Graveyard setup': [/\bmill\b/, /\bdiscard\b/, /surveil/],
  'Token generation': [/create (?:a|two|three|\d+) .* tokens?/, /populate/],
  'Finishers': [/\bdouble strike\b/, /\beach opponent loses\b/, /\bextra turn\b/, /\btrample\b/],
  'Lands': [/\bland\b/]
};
let builderCards = [];
const normalizeText = card => `${card.oracle_text || ''} ${(card.keywords || []).join(' ')} ${card.type_line || ''}`.toLowerCase();
function classify(card, commander) {
  const text = normalizeText(card);
  const groups = Object.entries(CATEGORIES).filter(([, patterns]) => patterns.some(pattern => pattern.test(text))).map(([name]) => name);
  const commanderTypes = (commander.type_line?.split('—')[1] || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (commanderTypes.some(type => (card.type_line || '').toLowerCase().includes(type))) groups.push('Tribal synergy');
  return [...new Set(groups.length ? groups : ['Other playable'])];
}
async function hydrate(cards, status) {
  const ids = [...new Set(cards.map(card => card.scryfallId).filter(Boolean))];
  for (let i = 0; i < ids.length; i += 75) {
    const batch = ids.slice(i, i + 75);
    try {
      const response = await fetch('https://api.scryfall.com/cards/collection', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({identifiers:batch.map(id => ({id}))}) });
      if (!response.ok) throw new Error(`Scryfall returned ${response.status}`);
      const data = await response.json();
      data.data.forEach(meta => cards.filter(card => card.scryfallId === meta.id).forEach(card => Object.assign(card, meta)));
      status.textContent = `Loading card metadata… ${Math.min(i + 75, ids.length)} / ${ids.length}`;
      if (i + 75 < ids.length) await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) { status.className = 'collection-status warning'; status.textContent = `Some Scryfall metadata could not be loaded: ${error.message}`; break; }
  }
}
async function initBuilder() {
  const status = document.getElementById('builder-status');
  try {
    const response = await fetch('data/Collection.csv');
    if (!response.ok) throw new Error('data/Collection.csv is missing');
    const parsed = MTGCollectionCore.parseManaBoxCSV(await response.text(), {defaultCurrency:'AUD'});
    if (parsed.errors.length) throw new Error(parsed.errors.join(' '));
    builderCards = parsed.cards; await hydrate(builderCards, status);
    const commanders = builderCards.filter(card => /\bLegendary\b.*\bCreature\b/i.test(card.type_line || '') && card.legalities?.commander !== 'not_legal');
    const select = document.getElementById('commander-select');
    select.innerHTML = commanders.sort((a,b)=>a.name.localeCompare(b.name)).map(card => `<option value="${card.scryfallId}">${card.name} · ${card.setCode}</option>`).join('');
    status.className = 'collection-status success'; status.textContent = `${builderCards.length} owned versions ready; ${commanders.length} possible commanders found.`;
  } catch (error) { status.className = 'collection-status error'; status.textContent = error.message; }
}
function analyse() {
  const commander = builderCards.find(card => card.scryfallId === document.getElementById('commander-select').value);
  if (!commander) return;
  const identity = commander.color_identity || [];
  const playable = builderCards.filter(card => card.scryfallId !== commander.scryfallId && (card.color_identity || []).every(color => identity.includes(color)) && card.legalities?.commander !== 'not_legal' && !/\bToken\b/i.test(card.type_line || ''));
  const grouped = {};
  playable.forEach(card => classify(card, commander).forEach(group => (grouped[group] ||= []).push(card)));
  const ordered = [...Object.keys(CATEGORIES), 'Tribal synergy', 'Other playable'];
  document.getElementById('commander-summary').innerHTML = [
    ['Commander', commander.name], ['Colour identity', identity.join(' · ') || 'Colourless'],
    ['Playable owned versions', playable.length], ['Physical cards', playable.reduce((s,c)=>s+c.quantity,0)]
  ].map(([a,b])=>`<article class="metric-card"><span>${a}</span><strong>${b}</strong></article>`).join('');
  document.getElementById('builder-results').innerHTML = ordered.filter(group => grouped[group]?.length).map(group =>
    `<details open><summary>${group} <span>${grouped[group].length}</span></summary><div class="suggestion-cards">${grouped[group].sort((a,b)=>(a.cmc||0)-(b.cmc||0)).slice(0,20).map(card=>`<a href="detail.html?id=${card.scryfallId}">${card.name}<small>MV ${card.cmc || 0} · ${card.setCode}</small></a>`).join('')}</div></details>`).join('');
  const caps = {'Ramp':10,'Card draw':10,'Targeted removal':10,'Board wipes':4,'Protection':5,'Recursion':5,'Graveyard setup':5,'Token generation':8,'Tribal synergy':18,'Finishers':6,'Lands':38};
  const selected = new Map([[commander.name, commander]]);
  ordered.forEach(group => (grouped[group] || []).slice(0, caps[group] || 6).forEach(card => selected.set(card.name, card)));
  document.getElementById('candidate-list').value = [...selected.values()].slice(0,100).map(card => `1 ${card.name} (${card.setCode}) ${card.collectorNumber}`).join('\n');
}
document.getElementById('analyse-commander').addEventListener('click', analyse);
document.getElementById('copy-candidates').addEventListener('click', () => navigator.clipboard.writeText(document.getElementById('candidate-list').value));
initBuilder();
