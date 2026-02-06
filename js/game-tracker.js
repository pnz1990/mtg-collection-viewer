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
    commanders: [null, null], // [{ name, artUrl }, ...]
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
    if (p.poison > 0) badges.push(`<span class="badge poison"><i class="ms ms-p"></i>${p.poison}</span>`);
    if (p.energy > 0) badges.push(`<span class="badge energy"><span class="card-symbol card-symbol-E"></span>${p.energy}</span>`);
    if (p.experience > 0) badges.push(`<span class="badge experience">✧ ${p.experience}</span>`);
    const totalCmd = p.cmdDamage.reduce((a, b) => a + b, 0);
    if (totalCmd > 0) badges.push(`<span class="badge cmdr">⚔ ${totalCmd}</span>`);
    
    const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'];
    
    // Handle commander art backgrounds
    const cmd1 = p.commanders[0];
    const cmd2 = p.commanders[1];
    let bgStyle = '';
    let artClass = '';
    
    if (cmd1 && cmd2) {
      artClass = 'has-dual-art';
    } else if (cmd1) {
      artClass = 'has-art';
    }
    
    // Display name
    let displayName = p.name;
    if (cmd1 && cmd2) {
      displayName = `${cmd1.name.split(',')[0]} & ${cmd2.name.split(',')[0]}`;
    } else if (cmd1) {
      displayName = cmd1.name;
    }
    
    // Background style for single commander
    const singleBgStyle = cmd1 && !cmd2 ? `background-image: url('${cmd1.artUrl}')` : '';
    
    return `
    <div class="player p${i} ${rotate ? 'rotate180' : ''} ${artClass}" data-idx="${i}" style="${singleBgStyle}">
      ${cmd1 && cmd2 ? `<div class="dual-art-bg" style="background-image: url('${cmd1.artUrl}')"></div><div class="dual-art-bg right" style="background-image: url('${cmd2.artUrl}')"></div>` : ''}
      <div class="player-main">
        <div class="player-name" data-action="name">${displayName}</div>
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
      openCardSearch(idx);
    } else if (action === 'counters') openCounters(idx);
    else if (action === 'cmdr') openCmdr(idx);
    else if (action === 'clear-mana') {
      Object.keys(state.players[idx].mana).forEach(k => state.players[idx].mana[k] = 0);
      render();
    }
    
    // Mana pip - tap to add, long press to subtract
    const pip = e.target.closest('.mana-pip');
    if (pip) {
      const color = pip.dataset.color;
      state.players[idx].mana[color]++;
      render();
    }
  };
  
  // Long press for mana subtract
  let pressTimer = null;
  c.addEventListener('pointerdown', e => {
    const pip = e.target.closest('.mana-pip');
    if (!pip) return;
    const player = pip.closest('.player');
    const idx = parseInt(player.dataset.idx);
    const color = pip.dataset.color;
    
    pressTimer = setTimeout(() => {
      if (state.players[idx].mana[color] > 0) {
        state.players[idx].mana[color]--;
        render();
      }
      pressTimer = null;
    }, 400);
  });
  
  c.addEventListener('pointerup', () => {
    if (pressTimer) clearTimeout(pressTimer);
  });
  
  c.addEventListener('pointerleave', () => {
    if (pressTimer) clearTimeout(pressTimer);
  });
}

// Card Search
let searchPlayer = 0;
let searchTimeout = null;
let activeSlot = 0;
let hasPartner = false;

function openCardSearch(idx) {
  searchPlayer = idx;
  const p = state.players[idx];
  hasPartner = p.commanders[1] !== null;
  activeSlot = 0;
  
  document.getElementById('partner-check').checked = hasPartner;
  document.getElementById('commander-slots').querySelector('[data-slot="1"]').classList.toggle('hidden', !hasPartner);
  
  updateSlotDisplay(p);
  setActiveSlot(0);
  
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  openModal('search-modal');
  document.getElementById('search-input').focus();
}

function updateSlotDisplay(p) {
  document.getElementById('slot-name-0').textContent = p.commanders[0]?.name || 'Not set';
  document.getElementById('slot-name-1').textContent = p.commanders[1]?.name || 'Not set';
}

function setActiveSlot(slot) {
  activeSlot = slot;
  document.querySelectorAll('.commander-slot').forEach((el, i) => {
    el.classList.toggle('active', i === slot);
  });
}

document.getElementById('partner-check')?.addEventListener('change', e => {
  hasPartner = e.target.checked;
  document.getElementById('commander-slots').querySelector('[data-slot="1"]').classList.toggle('hidden', !hasPartner);
  if (!hasPartner) {
    state.players[searchPlayer].commanders[1] = null;
    setActiveSlot(0);
    updateSlotDisplay(state.players[searchPlayer]);
  }
});

document.getElementById('commander-slots')?.addEventListener('click', e => {
  const slot = e.target.closest('.commander-slot');
  if (slot && !slot.classList.contains('hidden')) {
    setActiveSlot(parseInt(slot.dataset.slot));
  }
});

async function searchCards(query) {
  if (query.length < 2) {
    document.getElementById('search-results').innerHTML = '';
    return;
  }
  document.getElementById('search-results').innerHTML = '<div class="search-loading">Searching...</div>';
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}+is:commander&unique=cards&order=name`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const cards = data.data.slice(0, 12);
    document.getElementById('search-results').innerHTML = cards.map(card => {
      const art = card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '';
      const thumb = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || '';
      return `
      <div class="search-result" data-name="${card.name}" data-art="${art}">
        <img src="${thumb}" onerror="this.style.display='none'">
        <span>${card.name}</span>
      </div>`;
    }).join('') || '<div class="search-empty">No commanders found</div>';
  } catch {
    document.getElementById('search-results').innerHTML = '<div class="search-empty">No commanders found</div>';
  }
}

document.getElementById('search-input')?.addEventListener('input', e => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => searchCards(e.target.value), 300);
});

document.getElementById('search-results')?.addEventListener('click', e => {
  const result = e.target.closest('.search-result');
  if (result) {
    const p = state.players[searchPlayer];
    p.commanders[activeSlot] = {
      name: result.dataset.name,
      artUrl: result.dataset.art
    };
    updateSlotDisplay(p);
    
    // If partners and just set first, move to second slot
    if (hasPartner && activeSlot === 0 && !p.commanders[1]) {
      setActiveSlot(1);
      document.getElementById('search-input').value = '';
      document.getElementById('search-input').focus();
    } else {
      closeModal('search-modal');
      render();
    }
  }
});

document.getElementById('clear-commander')?.addEventListener('click', () => {
  const p = state.players[searchPlayer];
  p.commanders = [null, null];
  p.name = `Player ${searchPlayer + 1}`;
  closeModal('search-modal');
  render();
});

// Counters
let counterPlayer = 0;
function openCounters(idx) {
  counterPlayer = idx;
  const p = state.players[idx];
  document.getElementById('counters-title').textContent = `${p.name} - Counters`;
  const counters = [
    { key: 'poison', icon: '<i class="ms ms-p"></i>', label: 'Poison', step: 1 },
    { key: 'energy', icon: '<span class="card-symbol card-symbol-E"></span>', label: 'Energy', step: 1 },
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
    const wrapper = document.createElement('div');
    wrapper.className = 'dice-wrapper';
    
    let svg = '';
    if (diceType === 6) {
      // D6 - Cube wireframe with proper 3D perspective
      svg = `<svg viewBox="0 0 60 60">
        <!-- Front face -->
        <rect x="10" y="18" width="32" height="32" rx="4" stroke-width="2.5"/>
        <!-- Top face -->
        <polygon points="10,18 18,8 50,8 42,18" stroke-width="2"/>
        <!-- Right face -->
        <polygon points="42,18 50,8 50,40 42,50" stroke-width="2"/>
        <!-- Dots on front face -->
        <circle class="dot" cx="20" cy="28" r="3"/>
        <circle class="dot" cx="32" cy="28" r="3"/>
        <circle class="dot" cx="20" cy="40" r="3"/>
        <circle class="dot" cx="32" cy="40" r="3"/>
        <circle class="dot" cx="26" cy="34" r="3"/>
      </svg>`;
    } else if (diceType === 12) {
      // D12 - Dodecahedron wireframe (pentagon-based)
      svg = `<svg viewBox="0 0 60 60">
        <polygon points="30,3 54,18 48,45 12,45 6,18" stroke-width="2.5"/>
        <polygon points="30,12 45,22 40,40 20,40 15,22" stroke-width="1.5"/>
        <line x1="30" y1="3" x2="30" y2="12" stroke-width="1.5"/>
        <line x1="54" y1="18" x2="45" y2="22" stroke-width="1.5"/>
        <line x1="48" y1="45" x2="40" y2="40" stroke-width="1.5"/>
        <line x1="12" y1="45" x2="20" y2="40" stroke-width="1.5"/>
        <line x1="6" y1="18" x2="15" y2="22" stroke-width="1.5"/>
        <text x="30" y="34" text-anchor="middle" font-size="14" font-weight="bold">12</text>
      </svg>`;
    } else {
      // D20 - Icosahedron wireframe
      svg = `<svg viewBox="0 0 60 60">
        <polygon points="30,2 55,20 48,52 12,52 5,20" stroke-width="2.5"/>
        <polygon points="30,15 45,25 40,45 20,45 15,25" stroke-width="1.5"/>
        <line x1="30" y1="2" x2="30" y2="15" stroke-width="1.5"/>
        <line x1="55" y1="20" x2="45" y2="25" stroke-width="1.5"/>
        <line x1="48" y1="52" x2="40" y2="45" stroke-width="1.5"/>
        <line x1="12" y1="52" x2="20" y2="45" stroke-width="1.5"/>
        <line x1="5" y1="20" x2="15" y2="25" stroke-width="1.5"/>
        <line x1="30" y1="2" x2="5" y2="20" stroke-width="1.5"/>
        <line x1="30" y1="2" x2="55" y2="20" stroke-width="1.5"/>
        <line x1="30" y1="58" x2="12" y2="52" stroke-width="1.5"/>
        <line x1="30" y1="58" x2="48" y2="52" stroke-width="1.5"/>
        <text x="30" y="38" text-anchor="middle" font-size="12" font-weight="bold">20</text>
      </svg>`;
    }
    
    wrapper.innerHTML = `<div class="neon-dice rolling">${svg}</div>`;
    stage.appendChild(wrapper);
    
    setTimeout(() => {
      wrapper.innerHTML = `<div class="dice-result-num">${result}</div>`;
    }, 800 + i * 150);
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

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

document.querySelectorAll('.close-btn').forEach(btn => {
  btn.onclick = () => btn.closest('.modal').classList.add('hidden');
});

document.querySelectorAll('.modal').forEach(modal => {
  modal.onclick = e => { if (e.target === modal) modal.classList.add('hidden'); };
});
