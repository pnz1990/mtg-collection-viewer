const fs = require('fs');
const path = require('path');
const Pack = require('../js/pack-puller-core.js');

const root = path.resolve(__dirname, '..');
const productId = process.argv[2] || 'marvel-super-heroes-collector';
const manifestPath = path.join(root, 'data', 'pack-pullers', `${productId}.json`);
const outputPath = path.join(root, 'data', 'pack-pullers', 'generated', `${productId}-cards.json`);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function fetchSet(setCode) {
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${setCode.toLowerCase()} lang:en`)}&unique=prints&order=set`;
  const cards = [];
  while (url) {
    const response = await fetch(url, { headers: { 'User-Agent': 'ArcaneArchive-PackPullers/1.0', Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Scryfall ${setCode} request failed with ${response.status}`);
    const page = await response.json();
    cards.push(...(page.data || []));
    url = page.has_more ? page.next_page : '';
    if (url) await sleep(120);
  }
  return cards;
}

function imageUris(card) {
  const faces = (card.card_faces || []).map(face => ({ name: face.name, imageUris: face.image_uris || null }));
  return { imageUris: card.image_uris || card.card_faces?.[0]?.image_uris || null, cardFaces: faces };
}

function compact(card) {
  const eligibleFinishes = Pack.eligibleFinishes(card, manifest);
  const treatments = Pack.treatmentTags(card, manifest);
  return {
    id: card.id,
    oracleId: card.oracle_id || '',
    name: card.name,
    fullName: card.name,
    setCode: card.set.toUpperCase(),
    setName: card.set_name,
    collectorNumber: card.collector_number,
    rarity: card.rarity,
    typeLine: card.type_line || '',
    colorIdentity: card.color_identity || [],
    layout: card.layout,
    finishes: card.finishes || [],
    eligibleFinishes,
    treatments,
    slotTags: Pack.slotTags(card, manifest, treatments, eligibleFinishes),
    collectorBoosterExclusive: Pack.collectorBoosterExclusive(card, manifest),
    specialInfo: Pack.specialInfo(card, manifest) || null,
    prices: card.prices || {},
    priceUpdatedAt: new Date().toISOString(),
    scryfallUri: card.scryfall_uri,
    oracleText: card.oracle_text || (card.card_faces || []).map(face => face.oracle_text).filter(Boolean).join('\n\n'),
    ...imageUris(card)
  };
}

(async () => {
  const candidateSets = await Promise.all(manifest.setCodes.map(fetchSet));
  const cards = candidateSets.flat().filter(card => Pack.isEligibleCard(card, manifest)).map(compact);
  cards.sort((a, b) => manifest.setCodes.indexOf(a.setCode) - manifest.setCodes.indexOf(b.setCode) || Pack.compareCollectorNumbers(a.collectorNumber, b.collectorNumber));
  const generated = {
    productId: manifest.id,
    generatedAt: new Date().toISOString(),
    source: 'Scryfall API card records filtered by the committed Wizards-derived product manifest',
    cards
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(generated, null, 2)}\n`);
  const totals = Object.fromEntries(manifest.setCodes.map(code => [code, cards.filter(card => card.setCode === code).length]));
  console.log(`Generated ${cards.length} eligible printings at ${path.relative(root, outputPath)}.`);
  console.log(totals);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
