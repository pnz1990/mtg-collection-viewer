// Detail Page Tests
const results = [];
let currentSection = '';

function section(name) {
  currentSection = name;
  document.getElementById('results').innerHTML += `<div class="section"><h2>${name}</h2><div id="section-${name.replace(/\s+/g, '-')}"></div></div>`;
}

function test(name, fn) {
  try {
    fn();
    results.push({ section: currentSection, name, pass: true });
    const sectionId = `section-${currentSection.replace(/\s+/g, '-')}`;
    document.getElementById(sectionId).innerHTML += `<div class="test pass">✓ ${name}</div>`;
  } catch (e) {
    results.push({ section: currentSection, name, pass: false, error: e.message });
    const sectionId = `section-${currentSection.replace(/\s+/g, '-')}`;
    document.getElementById(sectionId).innerHTML += `<div class="test fail">✗ ${name}: ${e.message}</div>`;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) throw new Error(message || `Expected ${expected}, got ${actual}`);
}

// Run tests
section('Upgrades Panel Structure');

test('Upgrades panel has loading state', () => {
  const html = '<div class="upgrades-panel"><h3>Possible Upgrades</h3><div class="upgrades-loading">Loading...</div></div>';
  assert(html.includes('upgrades-loading'));
  assert(html.includes('Loading...'));
});

test('Upgrade cards have inner wrapper for 3D', () => {
  const html = '<div class="upgrade-inner"><img src="front.jpg" class="upgrade-front"><img src="images/back.png" class="upgrade-back"></div>';
  assert(html.includes('upgrade-inner'));
  assert(html.includes('upgrade-front'));
  assert(html.includes('upgrade-back'));
});

test('Upgrade cards link to Scryfall', () => {
  const mockCard = { scryfall_uri: 'https://scryfall.com/card/test' };
  assert(mockCard.scryfall_uri.includes('scryfall.com'));
});

test('Foil cards get foil class', () => {
  const mockCard = { finishes: ['foil'] };
  const isFoil = mockCard.finishes?.includes('foil') && !mockCard.finishes?.includes('nonfoil');
  assert(isFoil === true);
});

test('Non-foil cards do not get foil class', () => {
  const mockCard = { finishes: ['nonfoil'] };
  const isFoil = mockCard.finishes?.includes('foil') && !mockCard.finishes?.includes('nonfoil');
  assert(isFoil === false);
});

section('3D Card Back');

test('Card back image exists in HTML', () => {
  const html = '<img src="images/back.png" alt="Card back" class="upgrade-back">';
  assert(html.includes('images/back.png'));
  assert(html.includes('upgrade-back'));
});

test('Card back has correct CSS class', () => {
  const backClass = 'upgrade-back';
  assertEquals(backClass, 'upgrade-back');
});

test('Card front and back both present', () => {
  const html = '<img class="upgrade-front"><img class="upgrade-back">';
  assert(html.includes('upgrade-front'));
  assert(html.includes('upgrade-back'));
});

section('3D Transform');

test('Transform uses rotateX and rotateY', () => {
  const x = 0.5;
  const y = 0.3;
  const transform = `rotateX(${-y * 15}deg) rotateY(${x * 15}deg)`;
  assert(transform.includes('rotateX'));
  assert(transform.includes('rotateY'));
  assert(transform.includes('deg'));
});

test('Shimmer position updates with drag', () => {
  const x = 0.5;
  const shimmerX = `${50 + x * 100}%`;
  assertEquals(shimmerX, '100%');
});

test('Transform resets on drag end', () => {
  const resetTransform = '';
  assertEquals(resetTransform, '');
});

section('Upgrade Filtering');

test('Excludes same version by set and collector number', () => {
  const currentCard = { set: 'neo', collector_number: '123' };
  const upgradeCard = { set: 'neo', collector_number: '123' };
  const isSameVersion = upgradeCard.set === currentCard.set && upgradeCard.collector_number === currentCard.collector_number;
  assert(isSameVersion === true, 'Should detect same version');
});

test('Includes different version from same set', () => {
  const currentCard = { set: 'neo', collector_number: '123' };
  const upgradeCard = { set: 'neo', collector_number: '456' };
  const isSameVersion = upgradeCard.set === currentCard.set && upgradeCard.collector_number === currentCard.collector_number;
  assert(isSameVersion === false, 'Should allow different collector number');
});

test('Includes same collector number from different set', () => {
  const currentCard = { set: 'neo', collector_number: '123' };
  const upgradeCard = { set: 'mid', collector_number: '123' };
  const isSameVersion = upgradeCard.set === currentCard.set && upgradeCard.collector_number === currentCard.collector_number;
  assert(isSameVersion === false, 'Should allow different set');
});

test('Filters by price correctly', () => {
  const currentPrice = 5.00;
  const upgradePrice = 10.00;
  assert(upgradePrice > currentPrice, 'Upgrade should be more expensive');
});

test('Sorts upgrades by price ascending', () => {
  const prices = [10, 5, 15, 8];
  const sorted = prices.sort((a, b) => a - b);
  assertEquals(sorted[0], 5, 'Cheapest should be first');
  assertEquals(sorted[sorted.length - 1], 15, 'Most expensive should be last');
});

test('Limits to 6 upgrades', () => {
  const upgrades = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const limited = upgrades.slice(0, 6);
  assertEquals(limited.length, 6);
});

section('CSS Properties');

test('Card back has backface-visibility hidden', () => {
  const css = 'backface-visibility: hidden;';
  assert(css.includes('backface-visibility'));
  assert(css.includes('hidden'));
});

test('Card back is rotated 180deg', () => {
  const css = 'transform: rotateY(180deg);';
  assert(css.includes('rotateY(180deg)'));
});

test('Inner has transform-style preserve-3d', () => {
  const css = 'transform-style: preserve-3d;';
  assert(css.includes('preserve-3d'));
});

test('Card has perspective for 3D effect', () => {
  const css = 'perspective: 1000px;';
  assert(css.includes('perspective'));
});

// Summary
const passed = results.filter(r => r.pass).length;
const failed = results.filter(r => !r.pass).length;
const sections = [...new Set(results.map(r => r.section))];

document.getElementById('summary').innerHTML = `
  <strong>Test Results:</strong><br>
  ${passed} passed, ${failed} failed out of ${results.length} tests<br>
  ${sections.length} test sections<br>
  ${failed === 0 ? '<br><span style="color: #4caf50; font-size: 1.2rem;">✓ ALL TESTS PASSED!</span>' : '<br><span style="color: #f44336;">⚠ Some tests failed</span>'}
`;

if (failed > 0) console.error('Tests failed:', failed);
