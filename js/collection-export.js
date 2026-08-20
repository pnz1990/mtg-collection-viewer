(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MTGCollectionExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const text = value => String(value ?? '').trim();

  function unique(values) {
    return [...new Set(values.map(text).filter(Boolean))];
  }

  function rowFromRecords(records, quantity) {
    const list = records || [];
    const card = list[0] || {};
    const priced = list.filter(item => Number(item.purchasePrice) > 0);
    const pricedQuantity = priced.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const purchasePrice = pricedQuantity
      ? priced.reduce((sum, item) => sum + Number(item.purchasePrice) * Number(item.quantity || 0), 0) / pricedQuantity
      : '';
    return {
      quantity: Number(quantity) || list.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      name: text(card.displayName || card.flavorName || card.name),
      setCode: text(card.setCode),
      setName: text(card.setName),
      collectorNumber: text(card.collectorNumber),
      finish: text(card.foil || 'normal'),
      condition: unique(list.map(item => item.condition)).join('; '),
      language: unique(list.map(item => item.language)).join('; '),
      binder: unique(list.map(item => item.binderName)).join('; '),
      owner: unique(list.map(item => item.ownerName || item.ownerShortName)).join('; '),
      purchasePrice
    };
  }

  function buildExportModel(items = [], options = {}) {
    const grouped = options.grouped !== false;
    return items.map(item => grouped
      ? rowFromRecords(item.records || [item.representative], item.quantity)
      : rowFromRecords([item], item.quantity)
    ).filter(row => row.quantity > 0 && row.name);
  }

  function selectSource(scope, currentViewCards = [], fullLibraryCards = []) {
    return scope === 'library' ? fullLibraryCards : currentViewCards;
  }

  function combineIdenticalRecords(records = []) {
    const groups = new Map();
    records.forEach(card => {
      const key = [
        card.ownerId || card.ownerName, card.scryfallId || card.oracleName || card.name,
        card.setCode, card.collectorNumber, card.foil, card.condition, card.language, card.binderName
      ].map(value => text(value).toLowerCase()).join('|');
      if (!groups.has(key)) groups.set(key, { records: [], quantity: 0, representative: card });
      const group = groups.get(key);
      group.records.push(card);
      group.quantity += Number(card.quantity || 0);
    });
    return [...groups.values()];
  }

  function prepareExport(currentViewCards = [], fullLibraryCards = [], options = {}) {
    const scope = options.scope === 'library' ? 'library' : 'current';
    const grouped = options.grouped !== false;
    const source = selectSource(scope, currentViewCards, fullLibraryCards);
    const items = grouped ? combineIdenticalRecords(source) : source;
    return {
      scope, grouped, source,
      quantity: source.reduce((sum, card) => sum + Number(card.quantity || 0), 0),
      rows: buildExportModel(items, { grouped })
    };
  }

  function aggregateByName(rows = []) {
    const groups = new Map();
    rows.forEach(row => {
      const key = text(row.name).toLowerCase();
      if (!groups.has(key)) groups.set(key, { ...row, quantity: 0 });
      groups.get(key).quantity += Number(row.quantity || 0);
    });
    return [...groups.values()];
  }

  function formatTxt(rows = [], options = {}) {
    return rows.map(row =>
      `${row.quantity} ${row.name}${row.setCode ? ` (${row.setCode})` : ''}${row.collectorNumber ? ` ${row.collectorNumber}` : ''}${options.includeOwner && row.owner ? ` — ${row.owner}` : ''}`
    ).join('\n');
  }

  function formatArena(rows = [], options = {}) {
    const output = options.aggregate ? aggregateByName(rows) : rows;
    return output.map(row => `${row.quantity} ${row.name}`).join('\n');
  }

  function formatMoxfield(rows = [], options = {}) {
    return formatArena(rows, options);
  }

  function formatNames(rows = [], options = {}) {
    if (options.grouped !== false) return aggregateByName(rows).map(row => `${row.quantity} ${row.name}`).join('\n');
    return rows.flatMap(row => Array.from({ length: row.quantity }, () => row.name)).join('\n');
  }

  function csvCell(value) {
    return `"${String(value ?? '').replaceAll('"', '""')}"`;
  }

  function formatCsv(rows = []) {
    const headers = ['Quantity', 'Name', 'Set Code', 'Set Name', 'Collector Number', 'Finish', 'Condition', 'Language', 'Binder', 'Owner', 'Purchase Price'];
    const values = rows.map(row => [
      row.quantity, row.name, row.setCode, row.setName, row.collectorNumber,
      row.finish, row.condition, row.language, row.binder, row.owner,
      row.purchasePrice === '' ? '' : Number(row.purchasePrice).toFixed(2)
    ]);
    return [headers, ...values].map(row => row.map(csvCell).join(',')).join('\r\n');
  }

  function filename(label = 'collection', extension = 'txt', date = new Date()) {
    const clean = text(label).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'collection';
    const day = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
    return `${clean}-${day}.${extension}`;
  }

  function utf8Bytes(value) {
    return new TextEncoder().encode(String(value ?? ''));
  }

  async function copyText(value, clipboard) {
    const target = clipboard || (typeof navigator !== 'undefined' ? navigator.clipboard : null);
    if (!target?.writeText) throw new Error('Clipboard API unavailable');
    await target.writeText(String(value ?? ''));
    return true;
  }

  return {
    buildExportModel, formatTxt, formatCsv, formatArena, formatMoxfield,
    formatNames, filename, utf8Bytes, copyText, selectSource,
    combineIdenticalRecords, aggregateByName, prepareExport
  };
});
