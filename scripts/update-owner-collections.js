const fs = require('node:fs');
const path = require('node:path');
const { csvObjects, stringifyCsv } = require('./merge-precon-collection.js');

const clean = value => String(value ?? '').trim().toLowerCase();

function replacePreservingBinders(currentCsv, replacementCsv, binderNames = []) {
  const current = csvObjects(currentCsv);
  const replacement = csvObjects(replacementCsv);
  const preserved = new Set(binderNames.map(clean));
  const headers = [...new Set([...replacement.headers, ...current.headers])];
  const incoming = replacement.objects.filter(row => !preserved.has(clean(row['Binder Name'])));
  const retained = current.objects.filter(row => preserved.has(clean(row['Binder Name'])));
  return {
    csv: stringifyCsv(headers, [...incoming, ...retained]),
    incomingRows: incoming.length,
    retainedRows: retained.length
  };
}

function quantity(rows) {
  return rows.reduce((sum, row) => sum + Number(row.Quantity || 1), 0);
}

function updateOne(repoRoot, spec) {
  const target = path.join(repoRoot, 'data', 'collections', `${spec.owner}.csv`);
  const result = replacePreservingBinders(
    fs.readFileSync(target, 'utf8'), fs.readFileSync(spec.source, 'utf8'), spec.binders
  );
  fs.writeFileSync(target, result.csv, 'utf8');
  const parsed = csvObjects(result.csv);
  return { owner: spec.owner, rows: parsed.objects.length, quantity: quantity(parsed.objects), ...result };
}

function main(args) {
  if (args.length !== 3) throw new Error('Usage: node scripts/update-owner-collections.js MONTY.csv EDWARD.csv HARRY.csv');
  const repoRoot = path.resolve(__dirname, '..');
  const specs = [
    { owner: 'monty', source: args[0], binders: ['Blood Rites', 'Eternal Might', 'Hosts of Mordor'] },
    { owner: 'edward', source: args[1], binders: ['Riders of Rohan', 'Elven Council'] },
    { owner: 'harry', source: args[2], binders: [] }
  ];
  process.stdout.write(`${JSON.stringify(specs.map(spec => updateOne(repoRoot, spec)), null, 2)}\n`);
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { replacePreservingBinders };
