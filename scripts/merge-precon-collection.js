const fs = require('node:fs');
const Core = require('../js/collection-core.js');

const text = value => String(value ?? '').trim();
const clean = value => text(value).toLowerCase();
const printingKey = card => [clean(card.name), text(card.setCode).toUpperCase(), text(card.collectorNumber),
  Core.cleanFinish(card.finish), clean(card.language || 'en')].join('|');

function parsePreconList(source) {
  return String(source || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map((line, index) => {
    const match = line.match(/^(\d+)\s+(.+?)\s+\(([A-Z0-9]+)\)\s+(\S+)(?:\s+\*F\*)?$/i);
    if (!match) throw new Error(`Invalid deck-list line ${index + 1}: ${line}`);
    return {
      quantity: Number(match[1]), name: match[2].replace(/\s+\/\s+/g, ' // '),
      setCode: match[3].toUpperCase(), collectorNumber: match[4],
      finish: /\*F\*$/i.test(line) ? 'foil' : 'normal', language: 'en'
    };
  });
}

function csvObjects(csvText) {
  const rows = Core.parseCSV(csvText);
  if (!rows.length) throw new Error('The collection CSV is empty.');
  const sourceHeaders = rows[0].map(text);
  const required = ['Binder Name', 'Binder Type'];
  const headers = [...required.filter(header => !sourceHeaders.includes(header)), ...sourceHeaders];
  const objects = rows.slice(1).filter(row => row.some(cell => text(cell))).map(row =>
    Object.fromEntries(sourceHeaders.map((header, index) => [header, row[index] ?? ''])));
  return { headers, objects };
}

function csvValue(value) {
  const raw = String(value ?? '');
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function stringifyCsv(headers, objects) {
  return [headers.map(csvValue).join(','), ...objects.map(row => headers.map(header => csvValue(row[header])).join(','))].join('\r\n') + '\r\n';
}

function rowCard(row) {
  return {
    name: row.Name, setCode: row['Set code'], collectorNumber: row['Collector number'],
    finish: row.Foil, language: row.Language || 'en'
  };
}

function createRow(headers, wanted, binderName, meta, defaults) {
  const row = Object.fromEntries(headers.map(header => [header, '']));
  Object.assign(row, {
    'Binder Name': binderName, 'Binder Type': 'binder', Name: wanted.name,
    'Set code': wanted.setCode, 'Set name': meta.set_name || '',
    'Collector number': wanted.collectorNumber, Foil: wanted.finish,
    Rarity: meta.rarity || 'unknown', Quantity: wanted.quantity,
    'ManaBox ID': '', 'Scryfall ID': meta.id || '', 'Purchase price': '',
    Misprint: 'false', Altered: 'false', Condition: defaults.condition || 'near_mint',
    Language: wanted.language || 'en', 'Purchase price currency': defaults.currency || 'AUD', Added: ''
  });
  return row;
}

function mergePrecons(csvText, decks, metadata = {}) {
  const { headers, objects } = csvObjects(csvText);
  const defaults = {
    condition: objects.map(row => text(row.Condition)).find(Boolean) || 'near_mint',
    currency: objects.map(row => text(row['Purchase price currency'])).find(Boolean) || 'AUD'
  };
  const audit = [];

  for (const deck of decks) {
    let allocated = 0, added = 0;
    for (const wanted of deck.cards) {
      const key = printingKey(wanted);
      const matches = row => printingKey(rowCard(row)) === key;
      const targetRows = objects.filter(row => matches(row) && clean(row['Binder Name']) === clean(deck.binderName));
      let targetQuantity = targetRows.reduce((sum, row) => sum + Number(row.Quantity || 1), 0);
      let needed = Math.max(0, wanted.quantity - targetQuantity);
      let target = targetRows[0] || null;

      for (const source of objects.filter(row => matches(row) && !text(row['Binder Name'])) ) {
        if (!needed) break;
        const available = Number(source.Quantity || 1);
        const take = Math.min(available, needed);
        if (target) target.Quantity = Number(target.Quantity || 1) + take;
        else if (take === available) {
          source['Binder Name'] = deck.binderName; source['Binder Type'] = 'binder'; target = source;
        } else {
          target = { ...source, 'Binder Name': deck.binderName, 'Binder Type': 'binder', Quantity: take };
          objects.push(target);
        }
        if (take < available) source.Quantity = available - take;
        else if (source !== target) source.__remove = true;
        needed -= take; allocated += take;
      }

      if (needed) {
        if (target) target.Quantity = Number(target.Quantity || 1) + needed;
        else {
          const meta = metadata[key];
          if (!meta) throw new Error(`Missing Scryfall metadata for ${wanted.name} (${wanted.setCode}) ${wanted.collectorNumber}`);
          objects.push(createRow(headers, { ...wanted, quantity: needed }, deck.binderName, meta, defaults));
        }
        added += needed;
      }
    }
    audit.push({ binderName: deck.binderName, entries: deck.cards.length,
      quantity: deck.cards.reduce((sum, card) => sum + card.quantity, 0), allocated, added });
  }

  const finalObjects = objects.filter(row => !row.__remove);
  return { csv: stringifyCsv(headers, finalObjects), rows: finalObjects, audit };
}

async function fetchScryfallMetadata(cards) {
  const unique = [...new Map(cards.map(card => [printingKey(card), card])).values()];
  const metadata = {};
  for (let index = 0; index < unique.length; index += 75) {
    const chunk = unique.slice(index, index + 75);
    const response = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json',
        'User-Agent': 'ArcaneArchiveCollectionImporter/1.0' },
      body: JSON.stringify({ identifiers: chunk.map(card => ({ set: card.setCode.toLowerCase(), collector_number: card.collectorNumber })) })
    });
    if (!response.ok) throw new Error(`Scryfall collection request failed (${response.status}).`);
    const payload = await response.json();
    for (const card of payload.data || []) metadata[printingKey({
      name: card.name, setCode: card.set, collectorNumber: card.collector_number,
      finish: chunk.find(item => item.setCode === card.set.toUpperCase() && item.collectorNumber === card.collector_number)?.finish || 'normal', language: 'en'
    })] = card;
    for (const missing of payload.not_found || []) throw new Error(`Scryfall could not find ${missing.set} #${missing.collector_number}.`);
    if (index + 75 < unique.length) await new Promise(resolve => setTimeout(resolve, 120));
  }
  return metadata;
}

async function main(args) {
  if (args.length < 3) throw new Error('Usage: node scripts/merge-precon-collection.js SOURCE OUTPUT "Binder=deck.txt" [...]');
  const [sourcePath, outputPath, ...deckArgs] = args;
  const decks = deckArgs.map(value => {
    const split = value.indexOf('=');
    if (split < 1) throw new Error(`Invalid deck argument: ${value}`);
    return { binderName: value.slice(0, split), cards: parsePreconList(fs.readFileSync(value.slice(split + 1), 'utf8')) };
  });
  const metadata = await fetchScryfallMetadata(decks.flatMap(deck => deck.cards));
  const result = mergePrecons(fs.readFileSync(sourcePath, 'utf8'), decks, metadata);
  fs.writeFileSync(outputPath, result.csv, 'utf8');
  process.stdout.write(`${JSON.stringify(result.audit, null, 2)}\n`);
}

if (require.main === module) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = { printingKey, parsePreconList, csvObjects, stringifyCsv, mergePrecons };
