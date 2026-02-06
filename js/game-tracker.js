// Game State
const state = {
  players: [],
  numPlayers: 2,
  startingLife: 40
};

// Setup
document.querySelectorAll('#player-count button, #starting-life button').forEach(btn => {
  btn.onclick = () => {
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };
});

document.getElementById('start-game').onclick = () => {
  state.numPlayers = parseInt(document.querySelector('#player-count .selected').dataset.value);
  state.startingLife = parseInt(document.querySelector('#starting-life .selected').dataset.value);
  initGame();
};

function initGame() {
  state.players = Array.from({ length: state.numPlayers }, (_, i) => ({
    name: `Player ${i + 1}`,
    life: state.startingLife,
    poison: 0, energy: 0, experience: 0, storm: 0, cmdTax: 0,
    cmdDamage: Array(state.numPlayers).fill(0),
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }
  }));
  render();
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
}

function render() {
  const c = document.getElementById('players-container');
  c.className = `players-container p${state.numPlayers}`;
  c.innerHTML = state.players.map((p, i) => {
    const rotate = state.numPlayers === 2 && i === 0;
    const badges = [];
    if (p.poison > 0) badges.push(`<span class="badge poison"><i class="ms ms-counter-poison"></i>${p.poison}</span>`);
    if (p.energy > 0) badges.push(`<span class="badge energy"><i class="ms ms-counter-energy"></i>${p.energy}</span>`);
    if (p.experience > 0) badges.push(`<span class="badge experience">✧ ${p.experience}</span>`);
    const totalCmd = p.cmdDamage.reduce((a, b) => a + b, 0);
    if (totalCmd > 0) badges.push(`<span class="badge cmdr">⚔ ${totalCmd}</span>`);
    
    const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'];
    
    return `
    <div class="player p${i} ${rotate ? 'rotate180' : ''}" data-idx="${i}">
      <div class="player-main">
        <div class="player-name" data-action="name">${p.name}</div>
        <div class="life-area">
          <button class="life-btn minus" data-action="life" data-delta="-1">−</button>
          <div class="life-total">${p.life}</div>
          <button class="life-btn plus" data-action="life" data-delta="1">+</button>
        </div>
        ${badges.length ? `<div class="player-badges">${badges.join('')}</div>` : ''}
        <div class="player-actions">
          <button class="action-pill" data-action="counters">Counters</button>
          <button class="action-pill" data-action="cmdr">Cmdr Dmg</button>
        </div>
      </div>
      <div class="mana-bar">
        ${manaColors.map(color => `
          <div class="mana-pip" data-color="${color}">
            <i class="ms ms-${color.toLowerCase()}"></i>
            <span class="mana-count">${p.mana[color] || ''}</span>
          </div>
        `).join('')}
        <button class="mana-clear" data-action="clear-mana">✕</button>
      </div>
    </div>`;
  }).join('');

  // Event delegation
  c.onclick = e => {
    const player = e.target.closest('.player');
    if (!player) return;
    const idx = parseInt(player.dataset.idx);
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
    
    if (action === 'life') {
      state.players[idx].life += parseInt(e.target.dataset.delta);
      render();
    } else if (action === 'name') {
      const name = prompt('Player name:', state.players[idx].name);
      if (name) { state.players[idx].name = name; render(); }
    } else if (action === 'counters') openCounters(idx);
    else if (action === 'cmdr') openCmdr(idx);
    else if (action === 'clear-mana') {
      Object.keys(state.players[idx].mana).forEach(k => state.players[idx].mana[k] = 0);
      render();
    }
    
    // Mana pip click
    const pip = e.target.closest('.mana-pip');
    if (pip) {
      const color = pip.dataset.color;
      state.players[idx].mana[color]++;
      render();
    }
  };
}

// Counters
let counterPlayer = 0;
function openCounters(idx) {
  counterPlayer = idx;
  const p = state.players[idx];
  document.getElementById('counters-title').textContent = `${p.name} - Counters`;
  const counters = [
    { key: 'poison', icon: '<i class="ms ms-counter-poison"></i>', label: 'Poison', step: 1 },
    { key: 'energy', icon: '<i class="ms ms-counter-energy"></i>', label: 'Energy', step: 1 },
    { key: 'experience', icon: '✧', label: 'Experience', step: 1 },
    { key: 'storm', icon: '🌀', label: 'Storm', step: 1 },
    { key: 'cmdTax', icon: '<i class="ms ms-commander"></i>', label: 'Cmdr Tax', step: 2 }
  ];
  document.getElementById('counters-grid').innerHTML = counters.map(c => `
    <div class="counter-item">
      <div class="counter-icon">${c.icon}</div>
      <div class="counter-label">${c.label}</div>
      <div class="counter-value">${p[c.key]}</div>
      <div class="counter-controls">
        <button onclick="changeCounter('${c.key}', -${c.step})">−</button>
        <button onclick="changeCounter('${c.key}', ${c.step})">+</button>
      </div>
    </div>
  `).join('');
  openModal('counters-modal');
}

function changeCounter(key, delta) {
  state.players[counterPlayer][key] = Math.max(0, state.players[counterPlayer][key] + delta);
  openCounters(counterPlayer);
  render();
}

// Commander Damage
let cmdrPlayer = 0;
function openCmdr(idx) {
  cmdrPlayer = idx;
  const p = state.players[idx];
  document.getElementById('cmdr-grid').innerHTML = state.players.map((other, i) => {
    if (i === idx) return '';
    return `
    <div class="cmdr-item">
      <div class="cmdr-from">From ${other.name}</div>
      <div class="cmdr-value">${p.cmdDamage[i]}</div>
      <div class="cmdr-controls">
        <button onclick="changeCmdr(${i}, -1)">−</button>
        <button onclick="changeCmdr(${i}, 1)">+</button>
      </div>
    </div>`;
  }).join('');
  openModal('cmdr-modal');
}

function changeCmdr(from, delta) {
  state.players[cmdrPlayer].cmdDamage[from] = Math.max(0, state.players[cmdrPlayer].cmdDamage[from] + delta);
  openCmdr(cmdrPlayer);
  render();
}

// Dice
let diceType = 6, diceCount = 1;
document.querySelectorAll('.dice-type-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.dice-type-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    diceType = parseInt(btn.dataset.sides);
  };
});
document.getElementById('dice-minus').onclick = () => {
  diceCount = Math.max(1, diceCount - 1);
  document.getElementById('dice-num').textContent = diceCount;
};
document.getElementById('dice-plus').onclick = () => {
  diceCount = Math.min(6, diceCount + 1);
  document.getElementById('dice-num').textContent = diceCount;
};

document.getElementById('roll-dice').onclick = () => {
  const stage = document.getElementById('dice-stage');
  stage.innerHTML = '';
  
  for (let i = 0; i < diceCount; i++) {
    const result = Math.floor(Math.random() * diceType) + 1;
    const dice = document.createElement('div');
    dice.className = 'dice-3d rolling';
    
    if (diceType === 6) {
      dice.innerHTML = `
        <div class="dice-face front">●</div>
        <div class="dice-face back">●●</div>
        <div class="dice-face top">●●●</div>
        <div class="dice-face bottom">●●●●</div>
        <div class="dice-face left">●●●●●</div>
        <div class="dice-face right">●●●●●●</div>
      `;
    } else {
      dice.innerHTML = `<div class="dice-face front">${result}</div>`;
    }
    
    stage.appendChild(dice);
    
    setTimeout(() => {
      dice.classList.remove('rolling');
      dice.innerHTML = '';
      const num = document.createElement('div');
      num.className = 'dice-result-num';
      num.textContent = result;
      dice.appendChild(num);
    }, 800 + i * 100);
  }
};

// Coin
document.getElementById('flip-coin').onclick = () => {
  const coin = document.getElementById('coin');
  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  
  coin.classList.remove('show-tails', 'flipping');
  void coin.offsetWidth;
  coin.classList.add('flipping');
  document.getElementById('coin-result').textContent = '';
  
  setTimeout(() => {
    coin.classList.remove('flipping');
    if (result === 'tails') coin.classList.add('show-tails');
    document.getElementById('coin-result').textContent = result === 'heads' ? 'Heads!' : 'Tails!';
  }, 1000);
};

// Tools
document.getElementById('btn-dice').onclick = () => openModal('dice-modal');
document.getElementById('btn-coin').onclick = () => openModal('coin-modal');
document.getElementById('btn-reset').onclick = () => {
  if (confirm('Reset game?')) {
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  }
};
document.getElementById('btn-menu').onclick = () => location.href = 'index.html';

// Modal helpers
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
}

document.querySelectorAll('.close-btn').forEach(btn => {
  btn.onclick = () => btn.closest('.modal').classList.add('hidden');
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
});
