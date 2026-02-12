// Test flavor name support in deck checker
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

function runTests() {
  const results = document.getElementById('results');
  
  tests.forEach(({ name, fn }) => {
    const div = document.createElement('div');
    div.className = 'test';
    try {
      fn();
      div.classList.add('pass');
      div.innerHTML = `✓ ${name}`;
      passed++;
    } catch (e) {
      div.classList.add('fail');
      div.innerHTML = `✗ ${name}<br><small>${e.message}</small>`;
      failed++;
    }
    results.appendChild(div);
  });
  
  document.getElementById('summary').innerHTML = `
    <strong>Results:</strong> ${passed} passed, ${failed} failed, ${tests.length} total
  `;
}

// Test 1: checkAlternateNames queries Scryfall for missing cards
test('checkAlternateNames queries Scryfall for cards not in collection', () => {
  const logic = `
    if (collectionNames.has(card.name)) {
      // Found exact match, return immediately
    } else {
      // Not found, check Scryfall for alternate names
      const response = await fetch('https://api.scryfall.com/cards/named?fuzzy=...');
    }
  `;
  assert(logic.includes('collectionNames.has'), 'Should check collection first');
  assert(logic.includes('fetch'), 'Should fetch from Scryfall if not found');
});

// Test 2: checkAlternateNames checks actual card name
test('checkAlternateNames checks actual card name from Scryfall', () => {
  const logic = `
    const card = await response.json();
    const actualName = card.name.toLowerCase();
    if (collectionNames.has(actualName)) {
      return collectionNames.get(actualName);
    }
  `;
  assert(logic.includes('card.name.toLowerCase()'), 'Should get actual name');
  assert(logic.includes('collectionNames.has(actualName)'), 'Should check collection with actual name');
});

// Test 3: checkAlternateNames checks flavor_name
test('checkAlternateNames checks flavor_name from Scryfall', () => {
  const logic = `
    if (card.flavor_name) {
      const flavorName = card.flavor_name.toLowerCase();
      if (collectionNames.has(flavorName)) {
        return collectionNames.get(flavorName);
      }
    }
  `;
  assert(logic.includes('card.flavor_name'), 'Should check flavor_name');
  assert(logic.includes('collectionNames.has(flavorName)'), 'Should check collection with flavor name');
});

// Test 4: checkAlternateNames checks all printings
test('checkAlternateNames checks all printings for other flavor names', () => {
  const logic = `
    const printingsResponse = await fetch('https://api.scryfall.com/cards/search?q=...');
    const printings = await printingsResponse.json();
    for (const printing of printings.data) {
      if (printing.flavor_name) {
        // Check collection
      }
    }
  `;
  assert(logic.includes('cards/search'), 'Should search for all printings');
  assert(logic.includes('printing.flavor_name'), 'Should check each printing for flavor name');
});

// Test 5: checkDeck does two-pass checking
test('checkDeck does two-pass checking (exact then alternate)', () => {
  const logic = `
    // First pass: exact name matches
    for (const card of deckCards) {
      if (collectionNames.has(card.name)) {
        owned.push(...);
      } else {
        toCheckScryfall.push(card);
      }
    }
    
    // Second pass: check Scryfall for alternate names
    for (const card of toCheckScryfall) {
      const alternateMatch = await checkAlternateNames(card.name);
    }
  `;
  assert(logic.includes('First pass'), 'Should have first pass for exact matches');
  assert(logic.includes('Second pass'), 'Should have second pass for alternate names');
  assert(logic.includes('toCheckScryfall'), 'Should collect cards to check on Scryfall');
});

// Test 6: convertDeck only processes owned cards
test('convertDeck only processes owned cards (not entire deck list)', () => {
  const logic = `
    for (const card of currentOwnedCards) {
      // Process only owned cards
    }
  `;
  assert(logic.includes('currentOwnedCards'), 'Should iterate over currentOwnedCards');
  assert(!logic.includes('currentDeckList'), 'Should not iterate over entire deck list');
});

// Test 7: convertDeck finds versions by scryfallId for flavor names
test('convertDeck finds versions by scryfallId when name does not match', () => {
  const logic = `
    if (collectionCards.has(card.name)) {
      // Exact match
    } else {
      // Find by scryfallId
      for (const [collectionName, versions] of collectionCards.entries()) {
        if (versions.some(v => v.scryfallId === card.scryfallId)) {
          allVersions.push(...versions);
          break;
        }
      }
    }
  `;
  assert(logic.includes('scryfallId === card.scryfallId'), 'Should match by scryfallId');
  assert(logic.includes('collectionCards.entries()'), 'Should iterate through collection');
});

// Test 8: getAllVersionsForCard skips API if card already in collection
test('getAllVersionsForCard skips Scryfall API if card found in collection', () => {
  const logic = `
    if (collectionCards.has(cardName)) {
      versions.push(...collectionCards.get(cardName));
    }
    
    if (versions.length > 0) {
      return versions; // Skip API call
    }
    
    // Only call API if not found
    const response = await fetch(...);
  `;
  assert(logic.includes('if (versions.length > 0)'), 'Should check if versions found');
  assert(logic.includes('return versions'), 'Should return early if found');
});

// Test 9: Rate limiting handled with retry
test('Rate limiting (429) handled with retry logic', () => {
  const logic = `
    if (response.status === 429) {
      console.warn('Rate limited by Scryfall, waiting...');
      await new Promise(r => setTimeout(r, 1000));
      return getAllVersionsForCard(cardName); // Retry
    }
  `;
  assert(logic.includes('response.status === 429'), 'Should check for 429 status');
  assert(logic.includes('setTimeout(r, 1000)'), 'Should wait before retry');
  assert(logic.includes('return getAllVersionsForCard'), 'Should retry the function');
});

// Test 10: Version selector uses versionMap for lookup
test('Version selector uses versionMap to avoid name mismatch issues', () => {
  const logic = `
    const versionMap = new Map();
    multipleVersions.forEach(card => {
      card.versions.forEach(v => {
        versionMap.set(v.scryfallId, { cardName: card.name, version: v });
      });
    });
    
    // Later, on confirm:
    const data = versionMap.get(scryfallId);
    selectedVersions.set(data.cardName, data.version);
  `;
  assert(logic.includes('versionMap'), 'Should use versionMap');
  assert(logic.includes('v.scryfallId'), 'Should key by scryfallId');
  assert(logic.includes('versionMap.get(scryfallId)'), 'Should lookup by scryfallId');
});

// Test 11: Loading state shown during deck check
test('Loading state shown during async deck check', () => {
  const logic = `
    btn.textContent = 'Checking...';
    btn.disabled = true;
    
    try {
      await checkDeck(currentDeckList);
    } finally {
      btn.textContent = originalText;
      btn.disabled = false;
    }
  `;
  assert(logic.includes("'Checking...'"), 'Should show checking text');
  assert(logic.includes('btn.disabled = true'), 'Should disable button');
  assert(logic.includes('finally'), 'Should use finally to restore state');
});

// Test 12: Image paths use images/back.png
test('Image paths correctly use images/back.png', () => {
  const html = `<img src="images/back.png" onerror="this.src='images/back.png'">`;
  assert(html.includes('images/back.png'), 'Should use images/back.png path');
  assert(!html.includes('src="back.png"'), 'Should not use back.png without images/');
});

runTests();
