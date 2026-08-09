(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MTGPackPullerCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const numberParts = value => {
    const text = String(value ?? '').trim();
    const match = text.match(/^(\d+)(.*)$/);
    return match ? { number: Number(match[1]), suffix: match[2].toLowerCase(), raw: text } : { number: Infinity, suffix: text.toLowerCase(), raw: text };
  };
  const compareCollectorNumbers = (a, b) => {
    const left = numberParts(a), right = numberParts(b);
    return left.number - right.number || left.suffix.localeCompare(right.suffix, undefined, { numeric: true }) || left.raw.localeCompare(right.raw);
  };
  const numberInRule = (collectorNumber, rule = {}) => {
    const parsed = numberParts(collectorNumber);
    if ((rule.collectorNumbers || []).map(String).includes(String(collectorNumber))) return true;
    return Number.isFinite(parsed.number) && (rule.collectorNumberRanges || []).some(([start, end]) => parsed.number >= start && parsed.number <= end);
  };
  const eligibleRule = (card, manifest) => (manifest.eligibility || []).find(rule =>
    String(rule.setCode).toUpperCase() === String(card.set || card.setCode).toUpperCase() && numberInRule(card.collector_number || card.collectorNumber, rule));
  const isEligibleCard = (card, manifest) => Boolean(eligibleRule(card, manifest));
  const treatmentRules = (card, manifest) => (manifest.treatmentRules || []).filter(rule =>
    String(rule.setCode).toUpperCase() === String(card.set || card.setCode).toUpperCase() && numberInRule(card.collector_number || card.collectorNumber, rule));
  const treatmentTags = (card, manifest) => {
    const tags = treatmentRules(card, manifest).map(rule => rule.id);
    const frame = [...(card.frame_effects || []), ...(card.promo_types || [])].join(' ').toLowerCase();
    if ((card.full_art || card.border_color === 'borderless') && !tags.includes('borderless')) tags.push('borderless');
    if (/extended.?art/.test(frame) && !tags.includes('extended-art')) tags.push('extended-art');
    if (/showcase/.test(frame) && !tags.includes('showcase')) tags.push('showcase');
    return tags.length ? [...new Set(tags)] : ['main-set'];
  };
  const eligibleFinishes = (card, manifest) => {
    const matching = (manifest.finishRules || []).find(rule =>
      String(rule.setCode).toUpperCase() === String(card.set || card.setCode).toUpperCase() && numberInRule(card.collector_number || card.collectorNumber, rule));
    if (matching) return matching.finishes;
    const available = card.finishes || [];
    return ['nonfoil', 'foil'].filter(finish => available.includes(finish));
  };
  const matchesSlotRule = (card, rule, treatments) =>
    (!rule.setCode || rule.setCode === String(card.set || card.setCode).toUpperCase()) &&
    (!rule.collectorNumberRanges && !rule.collectorNumbers || numberInRule(card.collector_number || card.collectorNumber, rule)) &&
    (!rule.rarities || rule.rarities.includes(card.rarity)) &&
    (!rule.treatments || rule.treatments.some(tag => treatments.includes(tag))) &&
    (!rule.layouts || rule.layouts.includes(card.layout)) &&
    (!rule.excludeLayouts || !rule.excludeLayouts.includes(card.layout));
  const slotTags = (card, manifest, treatments = treatmentTags(card, manifest), finishes = eligibleFinishes(card, manifest)) =>
    (manifest.slots || []).filter(slot => !slot.nonCard &&
      (!slot.eligibility || slot.eligibility.some(rule => matchesSlotRule(card, rule, treatments))) &&
      (!slot.sets || slot.sets.includes(String(card.set || card.setCode).toUpperCase())) &&
      (!slot.rarities || slot.rarities.includes(card.rarity)) &&
      (!slot.treatments || slot.treatments.some(tag => treatments.includes(tag))) &&
      (!slot.finishes || slot.finishes.some(finish => finishes.includes(finish)))).map(slot => slot.id);
  const specialInfo = (card, manifest) => (manifest.specialCards || []).find(item =>
    item.setCode === String(card.set || card.setCode).toUpperCase() && String(item.collectorNumber) === String(card.collector_number || card.collectorNumber));
  const collectorBoosterExclusive = (card, manifest) => Boolean(specialInfo(card, manifest)?.collectorBoosterExclusive || treatmentRules(card, manifest).some(rule => rule.collectorBoosterExclusive));
  const priceForFinish = (card, finish) => {
    const value = finish === 'foil' ? card.prices?.usd_foil : finish === 'etched' ? card.prices?.usd_etched : card.prices?.usd;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };
  const convertUsdToAud = (usd, rate) => Number.isFinite(Number(usd)) && Number(usd) > 0 && Number.isFinite(Number(rate)) && Number(rate) > 0 ? Number(usd) * Number(rate) : null;
  const filterCards = (cards, filters = {}) => cards.filter(card => {
    const search = String(filters.search || '').toLowerCase();
    const haystack = `${card.name} ${card.fullName || ''} ${card.typeLine || ''}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (filters.setCode && card.setCode !== filters.setCode) return false;
    if (filters.rarity && card.rarity !== filters.rarity) return false;
    if (filters.color && !(card.colorIdentity || []).includes(filters.color)) return false;
    if (filters.type && !String(card.typeLine || '').toLowerCase().includes(filters.type.toLowerCase())) return false;
    if (filters.treatment && !(card.treatments || []).includes(filters.treatment)) return false;
    if (filters.finish && !(card.eligibleFinishes || []).includes(filters.finish)) return false;
    if (filters.slot && !(card.slotTags || []).includes(filters.slot)) return false;
    if (filters.exclusive && !card.collectorBoosterExclusive) return false;
    if (filters.priceAvailable && !card.eligibleFinishes.some(finish => priceForFinish(card, finish))) return false;
    const audPrices = card.eligibleFinishes.map(finish => convertUsdToAud(priceForFinish(card, finish), filters.rate)).filter(Number.isFinite);
    if (filters.minAud && !audPrices.some(price => price >= Number(filters.minAud))) return false;
    if (filters.maxAud && !audPrices.some(price => price <= Number(filters.maxAud))) return false;
    return true;
  });
  const sortCards = (cards, sort, setOrder = [], rate = null) => [...cards].sort((a, b) => {
    if (sort === 'collector-desc') return compareCollectorNumbers(b.collectorNumber, a.collectorNumber);
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'set') return a.setCode.localeCompare(b.setCode) || compareCollectorNumbers(a.collectorNumber, b.collectorNumber);
    if (sort === 'rarity') return a.rarity.localeCompare(b.rarity) || a.name.localeCompare(b.name);
    if (sort === 'usd-desc') return Math.max(...b.eligibleFinishes.map(f => priceForFinish(b, f) || 0)) - Math.max(...a.eligibleFinishes.map(f => priceForFinish(a, f) || 0));
    if (sort === 'aud-desc') return Math.max(...b.eligibleFinishes.map(f => convertUsdToAud(priceForFinish(b, f), rate) || 0)) - Math.max(...a.eligibleFinishes.map(f => convertUsdToAud(priceForFinish(a, f), rate) || 0));
    if (sort === 'treatment') return (a.treatments[0] || '').localeCompare(b.treatments[0] || '') || a.name.localeCompare(b.name);
    if (sort === 'slot') return (a.slotTags[0] || '').localeCompare(b.slotTags[0] || '') || a.name.localeCompare(b.name);
    return setOrder.indexOf(a.setCode) - setOrder.indexOf(b.setCode) || compareCollectorNumbers(a.collectorNumber, b.collectorNumber) || (a.eligibleFinishes[0] || '').localeCompare(b.eligibleFinishes[0] || '');
  });
  const parseCachedRate = (raw, now = Date.now(), ttl = 86400000) => {
    try { const cached = JSON.parse(raw || 'null'); return cached && Number(cached.rate) > 0 && now - Number(cached.timestamp) < ttl ? cached : null; } catch (_) { return null; }
  };
  return { numberParts, compareCollectorNumbers, numberInRule, eligibleRule, isEligibleCard, treatmentTags, eligibleFinishes, slotTags, specialInfo, collectorBoosterExclusive, priceForFinish, convertUsdToAud, filterCards, sortCards, parseCachedRate };
});
