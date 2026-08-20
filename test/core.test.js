const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/collection-core.js');
const collectionExport = require('../js/collection-export.js');
const exploreLinks = require('../js/explore-links.js');
const preconMerge = require('../scripts/merge-precon-collection.js');
const collectionUpdate = require('../scripts/update-owner-collections.js');
const packPuller = require('../js/pack-puller-core.js');
const packManifest = require('../data/pack-pullers/marvel-super-heroes-collector.json');
const packIndex = require('../data/pack-pullers/generated/marvel-super-heroes-collector-cards.json');
const fs = require('node:fs');

const csv = `Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Condition,Language,Purchase price currency,Added date
Main,collection,"Fire // Ice",MH2,Modern Horizons 2,290,normal,uncommon,2,1,sf-1,3.50,near_mint,en,AUD,2026-01-01
Main,collection,"Fire // Ice",MH2,Modern Horizons 2,290,normal,uncommon,1,1,sf-1,5.50,near_mint,en,AUD,2026-01-01
Trade,trade,"Fire // Ice",MH2,Modern Horizons 2,290,foil,uncommon,1,1,sf-1,,excellent,ja,AUD,2026-02-01
,collection,Sol Ring,CMM,Commander Masters,396,etched,uncommon,1,2,,12.00,near_mint,en,AUD,`;

test('ManaBox parser maps fields and preserves versions', () => {
  const result = core.parseManaBoxCSV(csv);
  assert.equal(result.errors.length, 0);
  assert.equal(result.cards.length, 3);
  assert.equal(result.cards[0].binderName, 'Main');
  assert.equal(result.cards[2].foil, 'etched');
});

test('duplicate rows merge quantities and weighted purchase price', () => {
  const result = core.parseManaBoxCSV(csv);
  assert.equal(result.duplicateRows, 1);
  assert.equal(result.cards[0].quantity, 3);
  assert.equal(result.cards[0].purchasePrice.toFixed(2), '4.17');
});

test('foil, etched and binder locations remain distinct', () => {
  const result = core.parseManaBoxCSV(csv);
  assert.equal(result.cards.filter(card => card.name === 'Fire // Ice').length, 2);
});

const exportCards = [
  {
    name: 'Éowyn, Shieldmaiden', setCode: 'LTR', setName: 'The Lord of the Rings',
    collectorNumber: '10', foil: 'normal', condition: 'near_mint', language: 'en',
    binderName: 'Main', ownerName: "Monty's Manor", purchasePrice: 2.5, quantity: 2
  },
  {
    name: 'Lightning Bolt', setCode: 'M11', setName: 'Magic 2011',
    collectorNumber: '149', foil: 'foil', condition: 'excellent', language: 'en',
    binderName: 'Trade, Box', ownerName: "Mitch's Museum", purchasePrice: 1, quantity: 1
  }
];

test('collection export formats TXT, Arena, Moxfield and card names', () => {
  const rows = collectionExport.buildExportModel(exportCards, { grouped: false });
  assert.equal(collectionExport.formatTxt(rows), '2 Éowyn, Shieldmaiden (LTR) 10\n1 Lightning Bolt (M11) 149');
  assert.equal(collectionExport.formatArena(rows), '2 Éowyn, Shieldmaiden\n1 Lightning Bolt');
  assert.equal(collectionExport.formatMoxfield(rows), collectionExport.formatArena(rows));
  assert.equal(collectionExport.formatNames(rows, { grouped: false }), 'Éowyn, Shieldmaiden\nÉowyn, Shieldmaiden\nLightning Bolt');
});

test('CSV export has required headers, quoting and purchase prices', () => {
  const csvExport = collectionExport.formatCsv(collectionExport.buildExportModel(exportCards, { grouped: false }));
  assert.match(csvExport, /^"Quantity","Name","Set Code","Set Name","Collector Number","Finish","Condition","Language","Binder","Owner","Purchase Price"/);
  assert.match(csvExport, /"Trade, Box"/);
  assert.match(csvExport, /"2\.50"/);
});

test('grouped export combines copies and ungrouped export keeps printings', () => {
  const group = { quantity: 3, records: exportCards.map(card => ({ ...card, name: 'Shared Card' })) };
  const grouped = collectionExport.buildExportModel([group], { grouped: true });
  const ungrouped = collectionExport.buildExportModel(group.records, { grouped: false });
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].quantity, 3);
  assert.equal(collectionExport.formatNames(grouped, { grouped: true }), '3 Shared Card');
  assert.equal(ungrouped.length, 2);
});

test('export only includes the currently supplied filtered cards', () => {
  const visible = exportCards.filter(card => card.setCode === 'LTR');
  const output = collectionExport.formatTxt(collectionExport.buildExportModel(visible, { grouped: false }));
  assert.match(output, /Éowyn/);
  assert.doesNotMatch(output, /Lightning Bolt/);
});

test('empty exports are safe and CSV retains its header', () => {
  assert.equal(collectionExport.formatTxt([]), '');
  assert.equal(collectionExport.formatArena([]), '');
  assert.equal(collectionExport.formatNames([]), '');
  assert.equal(collectionExport.formatCsv([]).split('\r\n').length, 1);
});

test('clipboard export uses the provided Clipboard API', async () => {
  let copied = '';
  await collectionExport.copyText('1 Sol Ring', { writeText: async value => { copied = value; } });
  assert.equal(copied, '1 Sol Ring');
});

test('download filenames are stable and export content is UTF-8', () => {
  const date = new Date(2026, 6, 30);
  assert.equal(collectionExport.filename("Monty's Manor", 'txt', date), 'Montys-Manor-2026-07-30.txt');
  assert.equal(new TextDecoder().decode(collectionExport.utf8Bytes('Éowyn')), 'Éowyn');
});

test('Current View exports every filtered record beyond rendered pagination', () => {
  const full = Array.from({ length: 150 }, (_, index) => ({
    ...exportCards[0], name: `Filtered Card ${index + 1}`, quantity: 1
  }));
  const prepared = collectionExport.prepareExport(full, [...full, exportCards[1]], {
    scope: 'current', grouped: false
  });
  assert.equal(prepared.rows.length, 150);
  assert.equal(prepared.quantity, 150);
  assert.doesNotMatch(collectionExport.formatTxt(prepared.rows), /Lightning Bolt/);
});

test('Entire Library ignores the filtered source without mutating it', () => {
  const current = [exportCards[0]];
  const snapshot = JSON.stringify(current);
  const prepared = collectionExport.prepareExport(current, exportCards, {
    scope: 'library', grouped: false
  });
  assert.equal(prepared.rows.length, 2);
  assert.match(collectionExport.formatTxt(prepared.rows), /Lightning Bolt/);
  assert.equal(JSON.stringify(current), snapshot);
});

test('individual library full export contains only that owner dataset', () => {
  const monty = exportCards.filter(card => card.ownerName === "Monty's Manor");
  const prepared = collectionExport.prepareExport([], monty, { scope: 'library', grouped: false });
  assert.equal(prepared.rows.length, 1);
  assert.equal(prepared.rows[0].owner, "Monty's Manor");
});

test('All Collections export includes all owners and keeps owner records separate', () => {
  const shared = exportCards.map(card => ({ ...card, name: 'Sol Ring', setCode: 'CMM', collectorNumber: '396' }));
  const prepared = collectionExport.prepareExport([], shared, { scope: 'library', grouped: true });
  assert.equal(prepared.rows.length, 2);
  const txt = collectionExport.formatTxt(prepared.rows, { includeOwner: true });
  assert.match(txt, /— Monty's Manor/);
  assert.match(txt, /— Mitch's Museum/);
});

test('both export scopes work through every formatter', () => {
  for (const scope of ['current', 'library']) {
    const prepared = collectionExport.prepareExport([exportCards[0]], exportCards, { scope, grouped: true });
    assert.ok(collectionExport.formatTxt(prepared.rows));
    assert.ok(collectionExport.formatCsv(prepared.rows));
    assert.ok(collectionExport.formatArena(prepared.rows, { aggregate: true }));
    assert.ok(collectionExport.formatMoxfield(prepared.rows, { aggregate: true }));
    assert.ok(collectionExport.formatNames(prepared.rows, { grouped: true }));
  }
});

test('empty current view remains disabled-capable while library has cards', () => {
  const current = collectionExport.prepareExport([], exportCards, { scope: 'current', grouped: true });
  const library = collectionExport.prepareExport([], exportCards, { scope: 'library', grouped: true });
  assert.equal(current.quantity, 0);
  assert.equal(current.rows.length, 0);
  assert.equal(library.quantity, 3);
});

test('name-based formats may aggregate owners while detailed rows remain separate', () => {
  const shared = exportCards.map(card => ({ ...card, name: 'Sol Ring' }));
  const prepared = collectionExport.prepareExport([], shared, { scope: 'library', grouped: true });
  assert.equal(prepared.rows.length, 2);
  assert.equal(collectionExport.formatArena(prepared.rows, { aggregate: true }), '3 Sol Ring');
  assert.equal(collectionExport.formatMoxfield(prepared.rows, { aggregate: true }), '3 Sol Ring');
});

test('colour identity contains matching supports mono and two-colour searches', () => {
  assert.equal(core.matchesColorIdentity(['U'], ['U'], 'contains'), true);
  assert.equal(core.matchesColorIdentity(['W', 'U'], ['U'], 'contains'), true);
  assert.equal(core.matchesColorIdentity(['W', 'U', 'R'], ['U', 'R'], 'contains'), true);
  assert.equal(core.matchesColorIdentity(['U'], ['U', 'R'], 'contains'), false);
  assert.equal(core.matchesColorIdentity(['G', 'R'], ['U', 'R'], 'contains'), false);
});

test('colour identity contains matching supports three and five-colour searches', () => {
  assert.equal(core.matchesColorIdentity(['W', 'U', 'B', 'R', 'G'], ['G', 'U', 'R'], 'contains'), true);
  assert.equal(core.matchesColorIdentity(['G', 'U', 'R'], ['G', 'U', 'R'], 'contains'), true);
  assert.equal(core.matchesColorIdentity(['W', 'U', 'B', 'R', 'G'], ['W', 'U', 'B', 'R', 'G'], 'contains'), true);
  assert.equal(core.matchesColorIdentity(['W', 'U', 'B', 'R'], ['W', 'U', 'B', 'R', 'G'], 'contains'), false);
});

test('exact colour identity rejects supersets and subsets', () => {
  assert.equal(core.matchesColorIdentity(['U', 'R'], ['U', 'R'], 'exact'), true);
  assert.equal(core.matchesColorIdentity(['W', 'U', 'R'], ['U', 'R'], 'exact'), false);
  assert.equal(core.matchesColorIdentity(['U'], ['U', 'R'], 'exact'), false);
});

test('colourless is independent from coloured identities', () => {
  assert.equal(core.matchesColorIdentity([], ['C'], 'contains'), true);
  assert.equal(core.matchesColorIdentity(['C'], ['C'], 'exact'), false);
  assert.equal(core.matchesColorIdentity(['U'], ['C'], 'contains'), false);
  assert.equal(core.matchesColorIdentity(['U'], ['C', 'U'], 'contains'), false);
});

test('multi-colour filtering uses Scryfall colour identity', () => {
  const cards = [
    { name:'Izzet', quantity:1, color_identity:['U','R'] },
    { name:'Jeskai', quantity:1, color_identity:['W','U','R'] },
    { name:'Blue', quantity:1, color_identity:['U'] }
  ];
  assert.deepEqual(core.filterCards(cards, { colors:['U','R'], colorMatch:'contains' }).map(card => card.name), ['Izzet','Jeskai']);
  assert.deepEqual(core.filterCards(cards, { colors:['U','R'], colorMatch:'exact' }).map(card => card.name), ['Izzet']);
});

test('colour URL state persists combinations and matching mode', () => {
  const encoded = core.encodeColorFilter(['W', 'U', 'B'], 'exact');
  const params = new URLSearchParams(encoded);
  assert.equal(params.toString(), 'colors=W%2CU%2CB&match=exact');
  assert.deepEqual(core.decodeColorFilter(params), { colors:['W','U','B'], match:'exact' });
});

test('Select All and Clear colour states encode safely', () => {
  assert.deepEqual(core.decodeColorFilter(new URLSearchParams(core.encodeColorFilter(['W','U','B','R','G','C'], 'contains'))),
    { colors:['W','U','B','R','G','C'], match:'contains' });
  assert.deepEqual(core.encodeColorFilter([], 'contains'), {});
});

const exploreCard = {
  primaryName: 'The One Ring',
  oraclePrimaryName: 'The One Ring',
  setCode: 'LTR',
  collectorNumber: '246',
  finish: 'foil',
  scryfallUri: 'https://scryfall.com/card/ltr/246/the-one-ring'
};

test('shared Explore destinations generate the existing detail URLs', () => {
  const links = Object.fromEntries(exploreLinks.getExploreLinks(exploreCard).map(link => [link.id, link.url]));
  assert.equal(links.scryfall, 'https://scryfall.com/card/ltr/246/the-one-ring');
  assert.equal(links.edhrec, 'https://edhrec.com/cards/the-one-ring');
  assert.equal(links.combos, 'https://commanderspellbook.com/search/?q=The%20One%20Ring');
  assert.equal(links.mtggoldfish, 'https://www.mtggoldfish.com/price/LTR/The%20One%20Ring');
  assert.equal(links.mtgmate, 'https://www.mtgmate.com.au/cards/The_One_Ring/LTR/246:foil');
  assert.equal(links.reddit, 'https://www.reddit.com/r/magicTCG/search?q=The%20One%20Ring&restrict_sr=1');
});

test('MTGMate uses canonical names for alternate-name printings and preserves printing data', () => {
  const foil = exploreLinks.getExploreLinks({
    primaryName: 'Patriotic Shield',
    oracleName: 'Sword of Fire and Ice',
    setCode: 'MAR',
    collectorNumber: '100',
    finish: 'Foil'
  }).find(link => link.id === 'mtgmate');
  const normal = exploreLinks.getExploreLinks({
    primaryName: 'Patriotic Shield',
    oracleName: 'Sword of Fire and Ice',
    setCode: 'MAR',
    collectorNumber: '100',
    finish: 'normal'
  }).find(link => link.id === 'mtgmate');

  assert.equal(foil.url, 'https://www.mtgmate.com.au/cards/Sword_of_Fire_and_Ice/MAR/100:foil');
  assert.equal(normal.url, 'https://www.mtgmate.com.au/cards/Sword_of_Fire_and_Ice/MAR/100');
});

test('MTGMate keeps existing normal links, handles punctuation and falls back safely', () => {
  const normal = exploreLinks.getExploreLinks({
    name: 'Sol Ring',
    set: 'cmm',
    collector_number: '396',
    finish: 'normal'
  }).find(link => link.id === 'mtgmate');
  const punctuation = exploreLinks.getExploreLinks({
    name: "Kaya's Guile",
    setCode: 'MH1',
    collectorNumber: '205',
    finish: 'normal'
  }).find(link => link.id === 'mtgmate');

  assert.equal(normal.url, 'https://www.mtgmate.com.au/cards/Sol_Ring/CMM/396');
  const fallback = exploreLinks.getExploreLinks({ primaryName: 'Unknown Card' }, ['mtgmate'])[0];
  assert.equal(punctuation.url, 'https://www.mtgmate.com.au/cards/Kayas_Guile/MH1/205');
  assert.equal(fallback.url, 'https://www.mtgmate.com.au/cards/Unknown%20Card');
});

test('MTGMate preserves full double-faced canonical names for normal and foil cards', () => {
  const tony = {
    primaryName: 'Tony Stark', oracleName: 'Tony Stark // The Invincible Iron Man',
    setCode: 'MSH', collectorNumber: '392', finish: 'foil'
  };
  const tchalla = {
    primaryName: "T'Challa", setCode: 'MSH', collectorNumber: '410', finish: 'normal',
    cardFaces: [{ name: "T'Challa" }, { name: 'Black Panther' }]
  };
  const tonyUrl = exploreLinks.getExploreLinks(tony, ['mtgmate'])[0].url;
  const tchallaUrl = exploreLinks.getExploreLinks(tchalla, ['mtgmate'])[0].url;
  assert.equal(tonyUrl, 'https://www.mtgmate.com.au/cards/Tony_Stark_//_The_Invincible_Iron_Man/MSH/392:foil');
  assert.equal(tchallaUrl, 'https://www.mtgmate.com.au/cards/TChalla_//_Black_Panther/MSH/410');
  assert.match(tonyUrl, /Tony_Stark_\/\/_The_Invincible_Iron_Man/);
});

test('detail and Quick Explore share the same canonical MTGMate URL', () => {
  const card = {
    primaryName: 'Patriotic Shield',
    oracleName: 'Sword of Fire and Ice',
    setCode: 'MAR',
    collectorNumber: '100',
    finish: 'FOIL'
  };
  const url = exploreLinks.getExploreLinks(card, ['mtgmate'])[0].url;
  assert.match(exploreLinks.renderQuickMenu(card), new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(url, 'https://www.mtgmate.com.au/cards/Sword_of_Fire_and_Ice/MAR/100:foil');
});

test('eBay Australia searches by safely encoded card name only', () => {
  const card = { primaryName: 'Nick Fury, Agent of S.H.I.E.L.D. & Friends' };
  const ebay = exploreLinks.getExploreLinks(card).find(link => link.id === 'ebay-au');
  assert.equal(ebay.url, 'https://www.ebay.com.au/sch/i.html?_nkw=Nick%20Fury%2C%20Agent%20of%20S.H.I.E.L.D.%20%26%20Friends');
  assert.doesNotMatch(ebay.url, /binder|owner|condition/i);
});

test('Quick Explore button and menu markup are accessible and externally safe', () => {
  const button = exploreLinks.renderQuickButton(exploreCard, 'card-1');
  const menu = exploreLinks.renderQuickMenu(exploreCard);
  assert.match(button, /class="quick-explore-toggle"/);
  assert.match(button, /aria-label="Quick explore The One Ring"/);
  assert.match(button, /aria-haspopup="menu"/);
  assert.match(button, /aria-expanded="false"/);
  assert.match(button, />⋮<\/button>/);
  assert.equal((menu.match(/role="menuitem"/g) || []).length, 7);
  assert.equal((menu.match(/target="_blank"/g) || []).length, 7);
  assert.equal((menu.match(/rel="noopener noreferrer"/g) || []).length, 7);
  ['Scryfall','EDHRec','Combos','MTGGoldfish','MTGMate','Reddit','eBay Australia']
    .forEach(label => assert.match(menu, new RegExp(label)));
});

test('grid and list renderer share one delegated Quick Explore controller', () => {
  const source = fs.readFileSync(require.resolve('../js/group-app.js'), 'utf8');
  assert.match(source, /Explore\.renderQuickButton/);
  assert.match(source, /Explore\.renderQuickMenu/);
  assert.match(source, /document\.addEventListener\('click'/);
  assert.match(source, /closeQuickExplore\(\);\s*state\.mode='grid'/);
  assert.match(source, /closeQuickExplore\(\);\s*state\.mode='list'/);
  assert.match(source, /function renderResults\(\) \{\s*closeQuickExplore\(\)/);
  assert.match(source, /event\.stopPropagation\(\)/);
  assert.match(source, /event\.key === 'Escape'/);
  assert.match(source, /Math\.min\(innerWidth - menu\.offsetWidth/);
});

test('existing card-detail Explore section remains and uses shared URLs', () => {
  const html = fs.readFileSync(require.resolve('../detail.html'), 'utf8');
  const source = fs.readFileSync(require.resolve('../js/group-detail.js'), 'utf8');
  assert.match(html, /js\/explore-links\.js/);
  assert.match(source, /<h2>Explore<\/h2>/);
  assert.match(source, /Explore\.getExploreLinks/);
  assert.match(source, /\['scryfall', 'edhrec', 'combos', 'mtggoldfish', 'mtgmate', 'reddit', 'ebay-au'\]/);
  assert.match(source, /rel="noopener noreferrer"/);
  assert.match(source, /const primaryName = name;/);
  const card = { primaryName: 'The Soul Stone' };
  const quickEbay = exploreLinks.getExploreLinks(card).find(link => link.id === 'ebay-au');
  const detailEbay = exploreLinks.getExploreLinks(card, ['ebay-au'])[0];
  assert.equal(detailEbay.url, quickEbay.url);
  assert.equal(detailEbay.url, 'https://www.ebay.com.au/sch/i.html?_nkw=The%20Soul%20Stone');
});

test('Quick Explore trigger preserves the original card flow and uses a list action column', () => {
  const source = fs.readFileSync(require.resolve('../js/group-app.js'), 'utf8');
  const styles = fs.readFileSync(require.resolve('../css/group.css'), 'utf8');
  assert.match(source, /<div class="card-tile-header">/);
  assert.match(styles, /\.card-tile-header\{position:absolute/);
  assert.match(styles, /\.quick-explore-toggle\{display:inline-grid/);
  assert.match(styles, /width:1\.875rem;height:1\.875rem/);
  assert.doesNotMatch(styles, /flex:0 0 38px/);
  assert.match(styles, /\.results\.list \.card-tile-header\{position:static;grid-column:3/);
  assert.match(styles, /\.results\.list \.card-visual\{grid-column:1/);
  assert.match(styles, /\.results\.list \.group-card-body,\.results\.list \.printing-card>div\{grid-column:2/);
});

test('totals tolerate missing current prices', () => {
  const cards = core.parseManaBoxCSV(csv).cards;
  cards[0].currentPrice = 8;
  const totals = core.calculateTotals(cards);
  assert.equal(totals.quantity, 5);
  assert.equal(totals.uniqueCards, 2);
  assert.equal(totals.foils, 2);
  assert.ok(Number.isFinite(totals.estimatedValue));
});

test('deck parser supports set/collector and plain formats', () => {
  const deck = core.parseDeckList('1 Fire // Ice (MH2) 290\n2 Sol Ring\n# Sideboard');
  assert.deepEqual(deck[0], { quantity: 1, name: 'Fire // Ice', normalizedName: 'fire // ice', setCode: 'MH2', collectorNumber: '290' });
  assert.equal(deck[1].quantity, 2);
});

test('deck matching separates exact, alternative and missing copies', () => {
  const collection = core.parseManaBoxCSV(csv).cards;
  const deck = core.parseDeckList('2 Fire // Ice (MH2) 290\n2 Sol Ring');
  const match = core.matchDeckList(deck, collection);
  assert.equal(match.results[0].owned, 2);
  assert.equal(match.results[1].owned, 1);
  assert.equal(match.results[1].missing, 1);
  assert.equal(match.missing, 1);
});

test('quoted commas and escaped quotes parse correctly', () => {
  const rows = core.parseCSV("Name,Note\n\"Jace, Vryn's Prodigy\",\"said \"\"hello\"\"\"");
  assert.equal(rows[1][0], "Jace, Vryn's Prodigy");
  assert.equal(rows[1][1], 'said "hello"');
});

const monty = { id: 'monty', name: 'Monty’s Manor', shortName: 'Monty', badgeClass: 'owner-monty' };
const edward = { id: 'edward', name: 'Edward’s Exhibit', shortName: 'Edward', badgeClass: 'owner-edward' };
const ownerCsv = owner => `Binder Name,Binder Type,Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Scryfall ID,Condition,Language
${owner} Main,binder,Cyclonic Rift,CMM,Commander Masters,84,normal,rare,2,rift-1,near_mint,en
${owner} Trade,trade,Sol Ring,CMM,Commander Masters,396,foil,uncommon,1,ring-1,excellent,en`;
const montyCards = core.applyOwnerMetadata(core.parseManaBoxCSV(ownerCsv('Monty')).cards, monty);
const edwardCards = core.applyOwnerMetadata(core.parseManaBoxCSV(ownerCsv('Edward')).cards, edward);
const groupCards = [...montyCards, ...edwardCards];

test('owner metadata creates stable owner-specific collection item IDs', () => {
  assert.equal(montyCards[0].ownerName, 'Monty’s Manor');
  assert.notEqual(montyCards[0].collectionItemId, edwardCards[0].collectionItemId);
});

test('grouping combines names while retaining underlying owner records', () => {
  const groups = core.groupCardsByName(groupCards);
  const rift = groups.find(group => group.name === 'Cyclonic Rift');
  assert.equal(rift.quantity, 4);
  assert.equal(rift.ownerCount, 2);
  assert.equal(rift.records.length, 2);
  assert.deepEqual(rift.owners, { monty: 2, edward: 2 });
});

test('search includes owner, binder, set and card fields', () => {
  assert.equal(core.filterCards(groupCards, { search: 'Edward Trade' }).length, 1);
  assert.equal(core.filterCards(groupCards, { search: 'commander masters' }).length, 4);
});

test('combined filters apply owner, finish, condition and binder simultaneously', () => {
  const result = core.filterCards(groupCards, {
    ownerIds: ['edward'], finish: 'foil', condition: 'excellent', binders: ['Edward Trade']
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].name, 'Sol Ring');
});

test('duplicate filtering uses group totals across owners', () => {
  const totals = new Map(core.groupCardsByName(groupCards).map(group => [group.key, group]));
  assert.equal(core.filterCards(groupCards, { duplicates: true }, { groupTotals: totals }).length, 4);
});

test('trade basket adds, combines and caps requested quantities', () => {
  let items = core.addBasketItem([], montyCards[0], 1);
  items = core.addBasketItem(items, montyCards[0], 2);
  assert.equal(items.length, 1);
  assert.equal(items[0].quantityRequested, 2);
  assert.equal(JSON.parse(JSON.stringify(items))[0].ownerId, 'monty');
});

test('trade basket removes items and groups them by owner', () => {
  let items = core.addBasketItem([], montyCards[0], 1);
  items = core.addBasketItem(items, edwardCards[1], 1);
  assert.equal(Object.keys(core.groupBasketByOwner(items)).length, 2);
  items = core.removeBasketItem(items, montyCards[0].collectionItemId);
  assert.equal(items.length, 1);
});

test('multi-library loading continues when a CSV is missing', async () => {
  const result = await core.loadCollections([monty, edward], async owner => {
    if (owner.id === 'edward') throw new Error('Collection not yet uploaded');
    return ownerCsv('Monty');
  });
  assert.equal(result.cards.length, 2);
  assert.equal(result.successes.length, 1);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].owner.id, 'edward');
});

test('Scryfall USD prices convert to AUD exactly once', () => {
  assert.equal(core.convertUsdToAud(120.5, 1.4332), 172.7006);
  assert.equal(core.convertUsdToAud(null, 1.4332), 0);
  assert.equal(core.convertUsdToAud(10, 0), 0);
});

test('creature-type filtering matches only the subtype portion', () => {
  const cards = [
    { name: 'A', type_line: 'Legendary Creature — Vampire Noble', quantity: 1 },
    { name: 'B', type_line: 'Legendary Creature — Human Hero', quantity: 1 },
    { name: 'Heroic Spell', type_line: 'Instant', quantity: 1 }
  ];
  assert.deepEqual(core.filterCards(cards, { creatureType: 'Vampire' }).map(card => card.name), ['A']);
  assert.deepEqual(core.filterCards(cards, { creatureType: 'Hero' }).map(card => card.name), ['B']);
});

test('search matches both Universes Beyond flavor and Oracle names', () => {
  const cards = [{
    name: 'Roaming Throne', displayName: 'Doom Variant',
    flavorName: 'Doom Variant', oracleName: 'Roaming Throne', quantity: 1
  }];
  assert.equal(core.filterCards(cards, { search: 'Doom Variant' }).length, 1);
  assert.equal(core.filterCards(cards, { search: 'Roaming Throne' }).length, 1);
});

test('identical copies combine across owners but preserve meaningful versions', () => {
  const base = {
    name: 'Jennifer Walters // The Sensational She-Hulk',
    scryfallId: 'same-printing', setCode: 'MSH', collectorNumber: '388',
    foil: 'foil', language: 'en', condition: 'near_mint', quantity: 1
  };
  const groups = core.groupIdenticalCopies([
    { ...base, ownerId: 'monty', ownerName: 'Monty', binderName: 'marvel' },
    { ...base, ownerId: 'mitch', ownerName: 'Mitch', binderName: '' },
    { ...base, ownerId: 'mitch', ownerName: 'Mitch', foil: 'normal' }
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find(group => group.representative.foil === 'foil').quantity, 2);
  assert.equal(groups.find(group => group.representative.foil === 'foil').ownerCount, 2);
});

test('Scryfall session cache expires after one hour', () => {
  const values = new Map();
  const storage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
  const now = 1_000_000;
  core.cacheScryfallCards([{ id: 'card-1', name: 'Cached Card', prices: { usd: '1.00' } }], storage, now);
  assert.equal(core.readCachedScryfall(['card-1'], storage, now + 3_599_999)['card-1'].name, 'Cached Card');
  assert.deepEqual(core.readCachedScryfall(['card-1'], storage, now + 3_600_000), {});
});

test('replacement Monty, Edward and Harry collection CSVs load with correct owner metadata', () => {
  const owners = {
    monty: { id:'monty', name:'Monty’s Manor', shortName:'Monty', badgeClass:'owner-monty' },
    edward: { id:'edward', name:'Edward’s Exhibit', shortName:'Edward', badgeClass:'owner-edward' },
    harry: { id:'harry', name:'Harry’s Haul', shortName:'Harry', badgeClass:'owner-harry' }
  };
  for (const id of Object.keys(owners)) {
    const parsed = core.parseManaBoxCSV(fs.readFileSync(require.resolve(`../data/collections/${id}.csv`), 'utf8'));
    assert.deepEqual(parsed.errors, []);
    assert.ok(parsed.cards.length > 0);
    const owned = core.applyOwnerMetadata(parsed.cards, owners[id]);
    assert.equal(owned[0].ownerId, id);
    assert.equal(owned[0].ownerName, owners[id].name);
  }
});

test('collection replacement preserves configured precon binders and normalises missing binder columns', () => {
  const current = 'Binder Name,Binder Type,Name,Set code,Collector number,Foil,Quantity,Language\r\nBlood Rites,binder,Precon Card,LCC,1,normal,1,en\r\nold,binder,Old Card,TST,2,normal,1,en\r\n';
  const replacement = 'Name,Set code,Collector number,Foil,Quantity,Language\r\nNew Card,NEW,3,normal,2,en\r\n';
  const result = collectionUpdate.replacePreservingBinders(current, replacement, ['Blood Rites']);
  const parsed = core.parseManaBoxCSV(result.csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.cards.some(card => card.name === 'Old Card'), false);
  assert.equal(parsed.cards.find(card => card.name === 'New Card').binderName, '');
  assert.equal(parsed.cards.find(card => card.name === 'Precon Card').binderName, 'Blood Rites');
});

test('Edward precon binders contain exactly 100 physical cards with complete IDs', () => {
  const parsed = core.parseManaBoxCSV(fs.readFileSync(require.resolve('../data/collections/edward.csv'), 'utf8'));
  for (const binder of ['Riders of Rohan', 'Elven Council']) {
    const cards = parsed.cards.filter(card => card.binderName === binder);
    assert.equal(cards.reduce((sum, card) => sum + card.quantity, 0), 100);
    assert.equal(cards.some(card => !card.scryfallId), false);
  }
  assert.equal(parsed.cards.some(card => card.binderName === 'Eleven Council'), false);
});

test('precon merge consumes unassigned copies and keeps identical cards in separate binders', () => {
  const source = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,Scryfall ID,Condition,Language,Purchase price currency\nSol Ring,LTC,Tales of Middle-earth Commander,284,normal,uncommon,1,sf-sol,near_mint,en,AUD\n';
  const card = { quantity:1, name:'Sol Ring', setCode:'LTC', collectorNumber:'284', finish:'normal', language:'en' };
  const meta = { [preconMerge.printingKey(card)]: { id:'sf-sol', set_name:'Tales of Middle-earth Commander', rarity:'uncommon' } };
  const result = preconMerge.mergePrecons(source, [
    { binderName:'Riders of Rohan', cards:[card] },
    { binderName:'Elven Council', cards:[card] }
  ], meta);
  const parsed = core.parseManaBoxCSV(result.csv);
  assert.equal(parsed.cards.reduce((sum, item) => sum + item.quantity, 0), 2);
  assert.deepEqual(parsed.cards.map(item => item.binderName).sort(), ['Elven Council','Riders of Rohan']);
  assert.equal(parsed.warnings.some(warning => /duplicate row/i.test(warning)), false);
});

test('precon import rejects malformed deck lists and empty collection CSVs clearly', () => {
  assert.throws(() => preconMerge.parsePreconList('not a deck line'), /Invalid deck-list line 1/);
  assert.throws(() => preconMerge.csvObjects(''), /collection CSV is empty/i);
});

test('Pack Puller manifest has official product ranges and structured slots', () => {
  assert.equal(packManifest.id, 'marvel-super-heroes-collector');
  assert.deepEqual(packManifest.setCodes, ['MSH','MSC','MAR']);
  assert.equal(packManifest.slots.length, 12);
  assert.ok(packManifest.slots.every(slot => slot.id && slot.label && Number(slot.count) === 1 || slot.count > 1));
  assert.ok(packManifest.officialSources.every(source => source.url.startsWith('https://magic.wizards.com/')));
});

test('Pack Puller eligibility includes and excludes official MSH ranges', () => {
  for (const collector of ['1','286','297','429']) assert.equal(packPuller.isEligibleCard({ set:'msh', collector_number:collector }, packManifest), true);
  for (const collector of ['0','287','296','430']) assert.equal(packPuller.isEligibleCard({ set:'msh', collector_number:collector }, packManifest), false);
});

test('Pack Puller eligibility includes and excludes official MSC ranges', () => {
  for (const collector of ['1','7','291','512','583','833']) assert.equal(packPuller.isEligibleCard({ set:'msc', collector_number:collector }, packManifest), true);
  for (const collector of ['8','290','513','582','834']) assert.equal(packPuller.isEligibleCard({ set:'msc', collector_number:collector }, packManifest), false);
});

test('Pack Puller eligibility includes and excludes official MAR ranges', () => {
  for (const collector of ['41','100']) assert.equal(packPuller.isEligibleCard({ set:'mar', collector_number:collector }, packManifest), true);
  for (const collector of ['40','101']) assert.equal(packPuller.isEligibleCard({ set:'mar', collector_number:collector }, packManifest), false);
});

test('collector-number sorting handles zeroes, suffixes and nonnumeric values', () => {
  const values = ['10b','2','010','10a','A1','1'].sort(packPuller.compareCollectorNumbers);
  assert.deepEqual(values, ['1','2','010','10a','10b','A1']);
});

test('generated Pack Puller cards all satisfy at least one manifest rule', () => {
  assert.equal(packIndex.cards.length, 959);
  assert.equal(packIndex.cards.every(card => packPuller.isEligibleCard(card, packManifest)), true);
  assert.deepEqual(Object.fromEntries(packManifest.setCodes.map(code => [code, packIndex.cards.filter(card => card.setCode === code).length])), { MSH:419, MSC:480, MAR:60 });
});

test('generated Pack Puller data preserves double-faced cards, treatments and slots', () => {
  assert.ok(packIndex.cards.some(card => card.cardFaces.length > 1 && card.fullName.includes('//')));
  assert.ok(packIndex.cards.some(card => card.treatments.includes('source-material') && card.slotTags.includes('source-material')));
  assert.ok(packIndex.cards.some(card => card.treatments.includes('scene')));
  assert.ok(packIndex.cards.every(card => card.slotTags.length > 0));
});

test('Pack Puller pricing respects eligible foil and nonfoil finishes', () => {
  const card = { prices:{ usd:'4.25', usd_foil:'9.50', usd_etched:null } };
  assert.equal(packPuller.priceForFinish(card, 'nonfoil'), 4.25);
  assert.equal(packPuller.priceForFinish(card, 'foil'), 9.5);
  assert.equal(packPuller.priceForFinish({ prices:{ usd:null, usd_foil:null } }, 'foil'), null);
});

test('Pack Puller USD to AUD conversion never invents a missing rate', () => {
  assert.equal(packPuller.convertUsdToAud(10, 1.5), 15);
  assert.equal(packPuller.convertUsdToAud(10, null), null);
  assert.equal(packPuller.convertUsdToAud(null, 1.5), null);
});

test('Pack Puller exchange cache honours its TTL', () => {
  const cached = JSON.stringify({ rate:1.51, timestamp:1000, updatedAt:'2026-08-04' });
  assert.equal(packPuller.parseCachedRate(cached, 1000 + 86399999).rate, 1.51);
  assert.equal(packPuller.parseCachedRate(cached, 1000 + 86400000), null);
  assert.equal(packPuller.parseCachedRate('bad json', 1000), null);
});

test('Pack Puller search and combined filters work together', () => {
  const cards = [
    { name:'The Mind Stone', fullName:'The Mind Stone', setCode:'MSH', rarity:'mythic', colorIdentity:[], typeLine:'Artifact', treatments:['gauntlet'], eligibleFinishes:['foil'], slotTags:['foil-booster-fun'], collectorBoosterExclusive:true, prices:{usd_foil:'100'} },
    { name:'Heroic Intervention', fullName:'Heroic Intervention', setCode:'MAR', rarity:'mythic', colorIdentity:['G'], typeLine:'Instant', treatments:['source-material'], eligibleFinishes:['nonfoil','foil'], slotTags:['source-material'], collectorBoosterExclusive:false, prices:{usd:'5'} }
  ];
  assert.deepEqual(packPuller.filterCards(cards, { search:'mind', setCode:'MSH', treatment:'gauntlet', finish:'foil', exclusive:true }).map(card => card.name), ['The Mind Stone']);
  assert.deepEqual(packPuller.filterCards(cards, { color:'G', type:'Instant', priceAvailable:true, minAud:5, rate:1.5 }).map(card => card.name), ['Heroic Intervention']);
});

test('Pack Puller product lookup and GitHub Pages paths remain relative', () => {
  const products = require('../data/pack-pullers/index.json');
  assert.equal(products.some(product => product.id === 'not-a-product'), false);
  assert.ok(products.every(product => !product.manifest.startsWith('/') && !product.generatedIndex.startsWith('/')));
  const html = fs.readFileSync(require.resolve('../pack-puller.html'), 'utf8');
  const splashSource = fs.readFileSync(require.resolve('../js/pack-pullers.js'), 'utf8');
  assert.match(splashSource, /pack-puller\.html\?product=/);
  assert.doesNotMatch(html, /href="\/mtg-collection-viewer\//);
});

test('card detail supports an unowned Pack Puller source state', () => {
  const source = fs.readFileSync(require.resolve('../js/group-detail.js'), 'utf8');
  assert.match(source, /source'\) === 'pack-puller'/);
  assert.match(source, /PACK PULLER INFORMATION/);
  assert.match(source, /No uploaded library owns this card/);
  assert.match(source, /pack-puller\.html\?product=/);
});
