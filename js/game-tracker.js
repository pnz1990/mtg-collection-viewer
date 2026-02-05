// Game State
let gameState = {
  players: [],
  numPlayers: 2,
  startingLife: 40,
  layout: 'row'
};

// Setup handlers
document.querySelectorAll('.setup-options').forEach(group => {
  group.querySelectorAll('button').forEach(btn => {
    btn.onclick = () => {
      group.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    };
  });
});

document.getElementById('start-game').onclick = () => {
  gameState.numPlayers = parseInt(document.querySelector('#player-count .selected').dataset.value);
  gameState.startingLife = parseInt(document.querySelector('#starting-life .selected').dataset.value);
  gameState.layout = document.querySelector('#layout .selected').dataset.value;
  initGame();
};

function initGame() {
  gameState.players = [];
  for (let i = 0; i < gameState.numPlayers; i++) {
    gameState.players.push({
      name: `Player ${i + 1}`,
      life: gameState.startingLife,
      poison: 0,
      energy: 0,
      experience: 0,
      storm: 0,
      cmdTax: 0,
      cmdDamage: Array(gameState.numPlayers).fill(0),
      mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
    });
  }
  renderPlayers();
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
}

function renderPlayers() {
  const container = document.getElementById('players-container');
  container.className = `players-container layout-${gameState.layout} p${gameState.numPlayers}`;
  container.innerHTML = gameState.players.map((p, i) => {
    const rotate = gameState.layout === 'around' && gameState.numPlayers >= 2 && i === 0;
    return `
    <div class="player p${i} ${rotate ? 'rotated' : ''}" data-player="${i}">
      <div class="player-name" onclick="editName(${i})">${p.name}</div>
      <div class="life-display">
        <button class="life-btn minus" onclick="changeLife(${i}, -1)">−</button>
        <div class="life-total">${p.life}</div>
        <button class="life-btn plus" onclick="changeLife(${i}, 1)">+</button>
      </div>
      <div class="counter-badges">
        ${p.poison > 0 ? `<span class="counter-badge poison">☠️ ${p.poison}</span>` : ''}
        ${p.energy > 0 ? `<span class="counter-badge energy">⚡ ${p.energy}</span>` : ''}
        ${p.experience > 0 ? `<span class="counter-badge experience">✧ ${p.experience}</span>` : ''}
        ${getTotalCmdrDamage(i) > 0 ? `<span class="counter-badge cmdr">⚔️ ${getTotalCmdrDamage(i)}</span>` : ''}
      </div>
      <div class="player-actions">
        <button class="player-action" onclick="openCounters(${i})">Counters</button>
        <button class="player-action" onclick="openCmdrDamage(${i})">Cmdr Dmg</button>
        <button class="player-action" onclick="openMana(${i})">Mana</button>
      </div>
    </div>`;
  }).join('');
}

function changeLife(playerIdx, delta) {
  gameState.players[playerIdx].life += delta;
  renderPlayers();
}

function getTotalCmdrDamage(playerIdx) {
  return gameState.players[playerIdx].cmdDamage.reduce((a, b) => a + b, 0);
}

function editName(playerIdx) {
  const name = prompt('Enter player name:', gameState.players[playerIdx].name);
  if (name) {
    gameState.players[playerIdx].name = name;
    renderPlayers();
  }
}

// Counters Modal
let currentCounterPlayer = 0;
function openCounters(playerIdx) {
  currentCounterPlayer = playerIdx;
  const p = gameState.players[playerIdx];
  document.getElementById('counters-title').textContent = `${p.name} - Counters`;
  document.getElementById('counters-grid').innerHTML = `
    <div class="counter-item">
      <div class="icon">☠️</div><div class="label">Poison</div>
      <div class="value">${p.poison}</div>
      <div class="controls">
        <button onclick="changeCounter('poison', -1)">−</button>
        <button onclick="changeCounter('poison', 1)">+</button>
      </div>
    </div>
    <div class="counter-item">
      <div class="icon">⚡</div><div class="label">Energy</div>
      <div class="value">${p.energy}</div>
      <div class="controls">
        <button onclick="changeCounter('energy', -1)">−</button>
        <button onclick="changeCounter('energy', 1)">+</button>
      </div>
    </div>
    <div class="counter-item">
      <div class="icon">✧</div><div class="label">Experience</div>
      <div class="value">${p.experience}</div>
      <div class="controls">
        <button onclick="changeCounter('experience', -1)">−</button>
        <button onclick="changeCounter('experience', 1)">+</button>
      </div>
    </div>
    <div class="counter-item">
      <div class="icon">🌀</div><div class="label">Storm</div>
      <div class="value">${p.storm}</div>
      <div class="controls">
        <button onclick="changeCounter('storm', -1)">−</button>
        <button onclick="changeCounter('storm', 1)">+</button>
      </div>
    </div>
    <div class="counter-item">
      <div class="icon">👑</div><div class="label">Cmdr Tax</div>
      <div class="value">${p.cmdTax}</div>
      <div class="controls">
        <button onclick="changeCounter('cmdTax', -2)">−2</button>
        <button onclick="changeCounter('cmdTax', 2)">+2</button>
      </div>
    </div>
  `;
  document.getElementById('counters-modal').classList.remove('hidden');
}

function changeCounter(type, delta) {
  const p = gameState.players[currentCounterPlayer];
  p[type] = Math.max(0, p[type] + delta);
  openCounters(currentCounterPlayer);
  renderPlayers();
}

// Commander Damage Modal
let currentCmdrPlayer = 0;
function openCmdrDamage(playerIdx) {
  currentCmdrPlayer = playerIdx;
  const p = gameState.players[playerIdx];
  document.getElementById('cmdr-grid').innerHTML = gameState.players.map((other, i) => {
    if (i === playerIdx) return '';
    return `
    <div class="cmdr-item">
      <div class="label">From ${other.name}</div>
      <div class="value">${p.cmdDamage[i]}</div>
      <div class="controls">
        <button onclick="changeCmdrDamage(${i}, -1)">−</button>
        <button onclick="changeCmdrDamage(${i}, 1)">+</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('cmdr-modal').classList.remove('hidden');
}

function changeCmdrDamage(fromIdx, delta) {
  const p = gameState.players[currentCmdrPlayer];
  p.cmdDamage[fromIdx] = Math.max(0, p.cmdDamage[fromIdx] + delta);
  openCmdrDamage(currentCmdrPlayer);
  renderPlayers();
}

// Mana Modal
let currentManaPlayer = 0;
function openMana(playerIdx) {
  currentManaPlayer = playerIdx;
  const p = gameState.players[playerIdx];
  const colors = [
    { key: 'W', symbol: '⚪', name: 'White' },
    { key: 'U', symbol: '🔵', name: 'Blue' },
    { key: 'B', symbol: '⚫', name: 'Black' },
    { key: 'R', symbol: '🔴', name: 'Red' },
    { key: 'G', symbol: '🟢', name: 'Green' },
    { key: 'C', symbol: '◇', name: 'Colorless' }
  ];
  document.getElementById('mana-grid').innerHTML = colors.map(c => `
    <div class="mana-item ${c.key}">
      <div class="symbol">${c.symbol}</div>
      <div class="value">${p.mana[c.key]}</div>
      <div class="controls">
        <button onclick="changeMana('${c.key}', -1)">−</button>
        <button onclick="changeMana('${c.key}', 1)">+</button>
      </div>
    </div>
  `).join('');
  document.getElementById('mana-modal').classList.remove('hidden');
}

function changeMana(color, delta) {
  const p = gameState.players[currentManaPlayer];
  p.mana[color] = Math.max(0, p.mana[color] + delta);
  openMana(currentManaPlayer);
}

document.getElementById('clear-mana').onclick = () => {
  const p = gameState.players[currentManaPlayer];
  Object.keys(p.mana).forEach(k => p.mana[k] = 0);
  openMana(currentManaPlayer);
};

// Dice
let diceType = 6;
let diceCount = 1;

document.querySelectorAll('.dice-type').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.dice-type').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    diceType = parseInt(btn.dataset.sides);
  };
});

document.getElementById('dice-minus').onclick = () => {
  diceCount = Math.max(1, diceCount - 1);
  document.getElementById('dice-num').textContent = diceCount;
};
document.getElementById('dice-plus').onclick = () => {
  diceCount = Math.min(10, diceCount + 1);
  document.getElementById('dice-num').textContent = diceCount;
};

document.getElementById('roll-dice').onclick = () => {
  const results = [];
  for (let i = 0; i < diceCount; i++) {
    results.push(Math.floor(Math.random() * diceType) + 1);
  }
  document.getElementById('dice-results').innerHTML = results.map(r => 
    `<div class="dice-result">${r}</div>`
  ).join('');
};

// Coin
document.getElementById('flip-coin').onclick = () => {
  const coin = document.getElementById('coin');
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  coin.classList.remove('heads', 'tails');
  coin.classList.add('flipping');
  setTimeout(() => {
    coin.classList.remove('flipping');
    coin.classList.add(result);
    document.getElementById('coin-result').textContent = result === 'heads' ? 'Heads!' : 'Tails!';
  }, 1000);
};

// Tool buttons
document.getElementById('btn-dice').onclick = () => document.getElementById('dice-modal').classList.remove('hidden');
document.getElementById('btn-coin').onclick = () => document.getElementById('coin-modal').classList.remove('hidden');
document.getElementById('btn-reset').onclick = () => {
  if (confirm('Reset game?')) {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  }
};
document.getElementById('btn-menu').onclick = () => window.location.href = 'index.html';

// Close modals
document.querySelectorAll('.close-modal').forEach(btn => {
  btn.onclick = () => btn.closest('.modal').classList.add('hidden');
});
document.querySelectorAll('.modal').forEach(modal => {
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
});
