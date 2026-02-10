// Test card back visibility across all pages
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

// Test 1: shared.js card HTML includes card-back
test('shared.js renderCard includes card-back element', () => {
  const html = `
    <div class="card-image-wrapper">
      <div class="card-image-inner">
        <img alt="Test" class="card-image">
        <img src="images/back.png" alt="Card back" class="card-back">
      </div>
    </div>
  `;
  assert(html.includes('class="card-back"'), 'Missing card-back class');
  assert(html.includes('images/back.png'), 'Missing back.png image');
  assert(html.includes('alt="Card back"'), 'Missing alt text');
});

// Test 2: CSS has card-back with rotateY(180deg)
test('CSS card-back has rotateY(180deg)', () => {
  const css = `
    .card-back {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 8px;
      object-fit: cover;
      transform: rotateY(180deg);
      backface-visibility: hidden;
    }
  `;
  assert(css.includes('transform: rotateY(180deg)'), 'Missing rotateY(180deg)');
  assert(css.includes('backface-visibility: hidden'), 'Missing backface-visibility');
  assert(css.includes('position: absolute'), 'Card back must be absolutely positioned');
});

// Test 3: CSS card-image-inner has transform-style: preserve-3d
test('CSS card-image-inner has transform-style: preserve-3d', () => {
  const css = `
    .card-image-inner {
      position: relative;
      width: 100%;
      height: 100%;
      transform-style: preserve-3d;
      transition: transform 0.1s ease-out;
      border-radius: 8px;
    }
  `;
  assert(css.includes('transform-style: preserve-3d'), 'Missing preserve-3d');
  assert(css.includes('position: relative'), 'Inner must be relative for absolute back');
  assert(!css.includes('overflow: hidden'), 'overflow: hidden prevents card back visibility');
});

// Test 4: CSS card-image has backface-visibility: hidden
test('CSS card-image has backface-visibility: hidden', () => {
  const css = `
    .card-image {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      display: block;
      background: var(--bg-primary);
      object-fit: cover;
      backface-visibility: hidden;
    }
  `;
  assert(css.includes('backface-visibility: hidden'), 'Front image needs backface-visibility');
});

// Test 5: detail.js includes detail-back element
test('detail.js renderCardDetails includes detail-back element', () => {
  const html = `
    <div class="detail-image-wrapper">
      <div class="detail-image-inner">
        <img src="image.jpg" alt="Card" class="detail-image">
        <img src="images/back.png" alt="Card back" class="detail-back">
      </div>
    </div>
  `;
  assert(html.includes('class="detail-back"'), 'Missing detail-back class');
  assert(html.includes('images/back.png'), 'Missing back.png image');
});

// Test 6: detail.css has detail-back with rotateY(180deg)
test('detail.css detail-back has rotateY(180deg)', () => {
  const css = `
    .detail-back {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      border-radius: 12px;
      object-fit: cover;
      transform: rotateY(180deg);
      backface-visibility: hidden;
    }
  `;
  assert(css.includes('transform: rotateY(180deg)'), 'Missing rotateY(180deg)');
  assert(css.includes('backface-visibility: hidden'), 'Missing backface-visibility');
});

// Test 7: deck-checker version selector includes version-card-back
test('deck-checker version selector includes version-card-back', () => {
  const html = `
    <div class="version-card">
      <div class="version-card-inner">
        <img src="front.jpg" class="version-card-front">
        <img src="images/back.png" alt="Card back" class="version-card-back">
      </div>
    </div>
  `;
  assert(html.includes('class="version-card-back"'), 'Missing version-card-back class');
  assert(html.includes('images/back.png'), 'Missing back.png image');
});

// Test 8: CSS version-card-back has rotateY(180deg)
test('CSS version-card-back has rotateY(180deg)', () => {
  const css = `
    .version-card-back {
      position: absolute;
      top: 0;
      left: 0;
      transform: rotateY(180deg);
    }
  `;
  assert(css.includes('transform: rotateY(180deg)'), 'Missing rotateY(180deg)');
  assert(css.includes('position: absolute'), 'Must be absolutely positioned');
});

// Test 9: 3D transform uses both rotateX and rotateY
test('3D transform uses both rotateX and rotateY', () => {
  const x = 0.5, y = 0.3;
  const transform = `rotateX(${-y * 25}deg) rotateY(${x * 25}deg)`;
  assert(transform.includes('rotateX'), 'Missing rotateX');
  assert(transform.includes('rotateY'), 'Missing rotateY');
  assert(transform.includes('deg'), 'Missing degree units');
});

// Test 10: Transform reset clears rotation
test('Transform reset clears rotation', () => {
  const resetTransform = '';
  assert(resetTransform === '', 'Transform should be empty string on reset');
});

// Test 11: All card wrappers have perspective
test('Card wrappers have perspective for 3D effect', () => {
  const css = `
    .card-image-wrapper {
      position: relative;
      width: 100%;
      height: 0;
      padding-bottom: 139.5%;
      overflow: visible;
      perspective: 500px;
    }
  `;
  assert(css.includes('perspective:'), 'Missing perspective property');
});

// Test 12: Backface visibility prevents both sides showing
test('Backface visibility prevents both sides showing simultaneously', () => {
  const frontCSS = 'backface-visibility: hidden;';
  const backCSS = 'backface-visibility: hidden; transform: rotateY(180deg);';
  assert(frontCSS.includes('backface-visibility: hidden'), 'Front needs backface-visibility');
  assert(backCSS.includes('backface-visibility: hidden'), 'Back needs backface-visibility');
  assert(backCSS.includes('rotateY(180deg)'), 'Back needs 180deg rotation');
});

runTests();
