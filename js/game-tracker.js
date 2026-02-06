// Game State
const state = {
  players: [],
  numPlayers: 4,
  startingLife: 40,
  activePlayer: -1,
  turnCount: 0,
  firstPlayer: -1,
  log: [],
  gameStartTime: null,
  turnStartTime: null,
  stack: [],
  format: 'commander',
  particlesEnabled: true,
  currentPhase: 0,
  currentStep: 0,
  turnTimes: [],
  damageDealt: {},
  commanderDamageDealt: {},
  knockouts: []
};

let clockInterval = null;

function logAction(msg) {
  const name = state.activePlayer >= 0 ? getPlayerName(state.activePlayer) : 'Setup';
  const turnLabel = state.turnCount > 0 ? `${name} T${state.turnCount}` : 'Setup';
  state.log.push({ time: new Date().toLocaleTimeString(), turn: turnLabel, msg });
}

function getPlayerName(idx) {
  const p = state.players[idx];
  return p.commanders[0]?.name.split(',')[0] || p.name;
}

// Setup
async function loadFormats() {
  try {
    const res = await fetch('https://api.scryfall.com/catalog/game-formats');
    const data = await res.json();
    const formats = data.data.filter(f => ['commander', 'standard', 'modern', 'legacy', 'vintage', 'pioneer', 'pauper'].includes(f));
    const container = document.getElementById('format-select');
    container.innerHTML = formats.map(f => 
      `<button data-value="${f}" ${f === 'commander' ? 'class="selected"' : ''}>${f.charAt(0).toUpperCase() + f.slice(1)}</button>`
    ).join('');
  } catch {
    document.getElementById('format-select').innerHTML = `
      <button data-value="commander" class="selected">Commander</button>
      <button data-value="standard">Standard</button>
      <button data-value="modern">Modern</button>
    `;
  }
}

loadFormats();

document.addEventListener('click', e => {
  if (e.target.closest('#format-select button')) {
    const btn = e.target.closest('button');
    document.querySelectorAll('#format-select button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    const format = btn.dataset.value;
    
    // Auto-select defaults based on format
    if (format === 'commander') {
      document.querySelector('#player-count [data-value="4"]')?.click();
      document.querySelector('#starting-life [data-value="40"]')?.click();
    } else {
      document.querySelector('#player-count [data-value="2"]')?.click();
      document.querySelector('#starting-life [data-value="20"]')?.click();
    }
  }
});

document.querySelectorAll('#player-count button, #starting-life button').forEach(btn => {
  btn.onclick = () => {
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };
});

document.getElementById('start-game').onclick = () => {
  state.format = document.querySelector('#format-select .selected').dataset.value;
  state.numPlayers = parseInt(document.querySelector('#player-count .selected').dataset.value);
  state.startingLife = parseInt(document.querySelector('#starting-life .selected').dataset.value);
  initGame();
};

function initGame() {
  state.players = Array.from({ length: state.numPlayers }, (_, i) => ({
    name: `Player ${i + 1}`,
    commanders: [null, null],
    life: state.startingLife,
    poison: 0, energy: 0, experience: 0, storm: 0, cmdTax: 0,
    cmdDamage: {}, // keyed by "playerIdx-cmdIdx"
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    rotated: false,
    mulligans: 0,
    cardsInHand: 7,
    mulliganActive: false,
    cardsDrawn: 0,
    cardsDiscarded: 0
  }));
  state.gameStartTime = Date.now();
  state.turnStartTime = null;
  state.log = [];
  state.stack = [];
  state.turnTimes = [];
  state.damageDealt = {};
  state.commanderDamageDealt = {};
  state.knockouts = [];
  for (let i = 0; i < state.numPlayers; i++) {
    state.damageDealt[i] = 0;
    state.commanderDamageDealt[i] = 0;
  }
  startClock();
  render();
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
}

function startClock() {
  if (clockInterval) clearInterval(clockInterval);
  clockInterval = setInterval(updateClocks, 1000);
}

function updateClocks() {
  const gameTime = Math.floor((Date.now() - state.gameStartTime) / 1000);
  const turnTime = state.turnStartTime ? Math.floor((Date.now() - state.turnStartTime) / 1000) : 0;
  
  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` : `${m}:${sec.toString().padStart(2, '0')}`;
  };
  
  document.getElementById('game-clock').textContent = formatTime(gameTime);
  document.getElementById('turn-clock').textContent = formatTime(turnTime);
}

function render() {
  const c = document.getElementById('players-container');
  c.className = `players-container p${state.numPlayers}`;
  document.getElementById('turn-counter').textContent = `Turn ${state.turnCount}`;
  const isCommander = state.format === 'commander';
  
  c.innerHTML = state.players.map((p, i) => {
    const badges = [];
    if (p.poison > 0) badges.push(`<span class="badge poison"><i class="ms ms-p"></i>${p.poison}</span>`);
    if (p.energy > 0) badges.push(`<span class="badge energy"><span class="card-symbol card-symbol-E"></span>${p.energy}</span>`);
    if (p.experience > 0) badges.push(`<span class="badge experience">✧ ${p.experience}</span>`);
    
    const manaColors = ['W', 'U', 'B', 'R', 'G', 'C'];
    
    // Handle commander art backgrounds
    const cmd1 = p.commanders[0];
    const cmd2 = p.commanders[1];
    let artClass = '';
    
    if (isCommander) {
      if (cmd1 && cmd2) {
        artClass = 'has-dual-art';
      } else if (cmd1) {
        artClass = 'has-art';
      }
    }
    
    // Display name
    let displayName = p.name;
    if (isCommander && cmd1 && cmd2) {
      displayName = `${cmd1.name.split(',')[0]} & ${cmd2.name.split(',')[0]}`;
    } else if (isCommander && cmd1) {
      displayName = cmd1.name;
    }
    
    // Background style for single commander
    const singleBgStyle = isCommander && cmd1 && !cmd2 ? `background-image: url('${cmd1.artUrl}')` : '';
    const isActive = state.activePlayer === i;
    
    // Show mulligan button only after first player selected
    const showMulligan = state.firstPlayer >= 0 && p.mulligans < 7;
    
    // Get combined color identity for particles
    let colorIdentity = [];
    if (isCommander && cmd1) {
      colorIdentity = [...(cmd1.colorIdentity || [])];
      if (cmd2) {
        colorIdentity = [...new Set([...colorIdentity, ...(cmd2.colorIdentity || [])])];
      }
    }
    
    return `
    <div class="player p${i} ${p.rotated ? 'rotate180' : ''} ${artClass} ${isActive ? 'active' : ''}" data-idx="${i}" style="${singleBgStyle}">
      ${isCommander && cmd1 && cmd2 ? `<div class="dual-art-bg" style="background-image: url('${cmd1.artUrl}')"></div><div class="dual-art-bg right" style="background-image: url('${cmd2.artUrl}')"></div>` : ''}
      ${colorIdentity.length > 0 ? `<div class="player-particles" data-colors="${colorIdentity.join(',')}"></div>` : ''}
      
      ${p.mulliganActive ? `
        <div class="mulligan-overlay">
          <div class="mulligan-label">${p.mulligans === 0 ? 'Free Mulligan' : `Mulligan ${p.mulligans}`}</div>
          <div class="mulligan-cards-inline">
            ${Array.from({length: p.mulligans === 0 ? 7 : Math.max(1, 7 - p.mulligans)}, (_, cardIdx) => 
              `<div class="mulligan-card-inline" style="animation-delay: ${cardIdx * 0.05}s"></div>`
            ).join('')}
          </div>
          <div class="mulligan-actions-inline">
            <button class="mulligan-btn keep" data-action="keep-hand">Keep</button>
            ${p.mulligans < 7 ? '<button class="mulligan-btn mulligan" data-action="do-mulligan">Mulligan</button>' : ''}
          </div>
        </div>
      ` : ''}
      
      <div class="player-main">
        <div class="player-name" data-action="${isCommander ? 'name' : 'edit-name'}">${displayName}</div>
        ${state.firstPlayer >= 0 ? `
          <div class="cards-in-hand-tracker">
            <span class="cards-label">Cards in Hand:</span>
            <button class="card-btn minus" data-action="card-change" data-delta="-1">−</button>
            <span class="cards-count">${p.cardsInHand}</span>
            <button class="card-btn plus" data-action="card-change" data-delta="1">+</button>
          </div>
        ` : ''}
        <div class="life-area">
          <button class="life-btn minus" data-action="life" data-delta="-1">−</button>
          <div class="life-total">${p.life}</div>
          <button class="life-btn plus" data-action="life" data-delta="1">+</button>
        </div>
        ${badges.length ? `<div class="player-badges">${badges.join('')}</div>` : ''}
        <div class="player-actions">
          ${showMulligan ? '<button class="action-pill" data-action="mulligan">Mulligan</button>' : ''}
          <button class="action-pill mana-btn" data-action="mana">Mana</button>
          <button class="action-pill" data-action="counters">Counters</button>
          ${isCommander ? '<button class="action-pill" data-action="cmdr">Commander Damage</button>' : ''}
          ${state.firstPlayer >= 0 && p.life > 0 ? '<button class="action-pill resign-btn" data-action="resign">Resign</button>' : ''}
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
  
  // Initialize particles for each player with commanders
  document.querySelectorAll('.player-particles').forEach(container => {
    const colors = container.dataset.colors.split(',');
    createPlayerParticles(container, colors);
  });

  // Event delegation
  c.onclick = e => {
    const player = e.target.closest('.player');
    if (!player) return;
    const idx = parseInt(player.dataset.idx);
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
    
    if (action === 'life') {
      const delta = parseInt(e.target.dataset.delta);
      const oldLife = state.players[idx].life;
      const newLife = oldLife + delta;
      
      // Confirm knockout
      if (oldLife > 0 && newLife <= 0) {
        if (!confirm(`Knock out ${getPlayerName(idx)}?`)) {
          return;
        }
      }
      
      state.players[idx].life = newLife;
      
      // Track damage dealt
      if (delta < 0 && state.activePlayer >= 0 && state.activePlayer !== idx) {
        state.damageDealt[state.activePlayer] = (state.damageDealt[state.activePlayer] || 0) + Math.abs(delta);
      }
      
      // Track knockouts
      if (oldLife > 0 && newLife <= 0) {
        state.knockouts.push({ player: idx, turn: state.turnCount, time: Date.now() });
        logAction(`${getPlayerName(idx)} was knocked out`);
      } else {
        logAction(`${getPlayerName(idx)} ${delta > 0 ? 'gained' : 'lost'} ${Math.abs(delta)} life`);
      }
      
      render();
    } else if (action === 'card-change') {
      const delta = parseInt(e.target.dataset.delta);
      state.players[idx].cardsInHand = Math.max(0, state.players[idx].cardsInHand + delta);
      
      if (delta > 0) {
        state.players[idx].cardsDrawn++;
        logAction(`${getPlayerName(idx)} drew a card`);
      } else if (delta < 0) {
        state.players[idx].cardsDiscarded++;
        logAction(`${getPlayerName(idx)} discarded a card`);
      }
      
      render();
    } else if (action === 'name') {
      openCardSearch(idx);
    } else if (action === 'edit-name') {
      editPlayerName(idx);
    } else if (action === 'mulligan') {
      openMulligan(idx);
    } else if (action === 'resign') {
      if (confirm(`${getPlayerName(idx)} resign?`)) {
        if (state.players[idx].life > 0) {
          state.players[idx].life = 0;
          state.knockouts.push({ player: idx, turn: state.turnCount, time: Date.now() });
          logAction(`${getPlayerName(idx)} resigned`);
          render();
        }
      }
    } else if (action === 'keep-hand') {
      const p = state.players[idx];
      logAction(`${getPlayerName(idx)} kept ${p.cardsInHand} cards`);
      p.mulliganActive = false;
      render();
    } else if (action === 'do-mulligan') {
      const p = state.players[idx];
      p.mulligans++;
      p.cardsInHand = p.mulligans === 1 ? 7 : Math.max(1, 7 - p.mulligans);
      logAction(`${getPlayerName(idx)} mulliganed (${p.mulligans} total)`);
      if (p.mulligans >= 7) p.mulliganActive = false;
      render();
    } else if (action === 'counters') openCounters(idx);
    else if (action === 'cmdr') openCmdr(idx);
    else if (action === 'mana') openMana(idx);
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
  
  // Long press for life buttons - increment by 10
  let lifeHoldTimer = null;
  let lifeHoldInterval = null;
  
  c.addEventListener('pointerdown', e => {
    const lifeBtn = e.target.closest('.life-btn');
    if (lifeBtn) {
      const player = lifeBtn.closest('.player');
      const idx = parseInt(player.dataset.idx);
      const delta = parseInt(lifeBtn.dataset.delta) * 10;
      
      lifeHoldTimer = setTimeout(() => {
        lifeHoldInterval = setInterval(() => {
          state.players[idx].life += delta;
          logAction(`${getPlayerName(idx)} ${delta > 0 ? 'gained' : 'lost'} ${Math.abs(delta)} life`);
          render();
        }, 200);
      }, 500);
      return;
    }
    
    // Long press for mana subtract
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
    if (lifeHoldTimer) clearTimeout(lifeHoldTimer);
    if (lifeHoldInterval) clearInterval(lifeHoldInterval);
    lifeHoldTimer = null;
    lifeHoldInterval = null;
    if (pressTimer) clearTimeout(pressTimer);
  });
  
  c.addEventListener('pointerleave', () => {
    if (lifeHoldTimer) clearTimeout(lifeHoldTimer);
    if (lifeHoldInterval) clearInterval(lifeHoldInterval);
    lifeHoldTimer = null;
    lifeHoldInterval = null;
    if (pressTimer) clearTimeout(pressTimer);
  });
}

function editPlayerName(idx) {
  const newName = prompt('Enter player name:', state.players[idx].name);
  if (newName && newName.trim()) {
    state.players[idx].name = newName.trim();
    render();
  }
}

// Mulligan
function openMulligan(idx) {
  state.players[idx].mulliganActive = true;
  render();
}

// Card Search
let searchPlayer = 0;
let searchTimeout = null;
let activeSlot = 0;

function openCardSearch(idx) {
  searchPlayer = idx;
  const p = state.players[idx];
  activeSlot = 0;
  
  // Show second slot if first commander has partner
  const hasPartner = p.commanders[0]?.hasPartner || false;
  document.getElementById('commander-slots').querySelector('[data-slot="1"]').classList.toggle('hidden', !hasPartner);
  
  updateSlotDisplay(p);
  setActiveSlot(p.commanders[0] && hasPartner ? (p.commanders[1] ? 0 : 1) : 0);
  
  document.getElementById('search-input').value = '';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('rotate-player').checked = p.rotated;
  openModal('search-modal');
  document.getElementById('search-input').focus();
}

function updateSlotDisplay(p) {
  document.getElementById('slot-name-0').textContent = p.commanders[0]?.name || 'Not set';
  document.getElementById('slot-name-1').textContent = p.commanders[1]?.name || 'Not set';
  
  // Show/hide second slot based on partner status
  const hasPartner = p.commanders[0]?.hasPartner || false;
  document.getElementById('commander-slots').querySelector('[data-slot="1"]').classList.toggle('hidden', !hasPartner);
}

function setActiveSlot(slot) {
  activeSlot = slot;
  document.querySelectorAll('.commander-slot').forEach((el, i) => {
    el.classList.toggle('active', i === slot);
  });
}

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
    // If selecting second slot, only search for partners
    const partnerFilter = activeSlot === 1 ? '+is:partner' : '';
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}+is:commander${partnerFilter}&unique=cards&order=name`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const cards = data.data.slice(0, 12);
    document.getElementById('search-results').innerHTML = cards.map(card => {
      const art = card.image_uris?.art_crop || card.card_faces?.[0]?.image_uris?.art_crop || card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '';
      const thumb = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || '';
      const hasPartner = card.keywords?.includes('Partner') || card.oracle_text?.includes('Partner with') || false;
      const colorIdentity = (card.color_identity || []).join(',');
      return `
      <div class="search-result" data-name="${card.name}" data-art="${art}" data-partner="${hasPartner}" data-colors="${colorIdentity}">
        <img src="${thumb}" onerror="this.style.display='none'">
        <span>${card.name}${hasPartner ? ' <small style="color:var(--accent)">(Partner)</small>' : ''}</span>
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
    const hasPartner = result.dataset.partner === 'true';
    const colorIdentity = result.dataset.colors ? result.dataset.colors.split(',') : [];
    
    p.commanders[activeSlot] = {
      name: result.dataset.name,
      artUrl: result.dataset.art,
      hasPartner: hasPartner,
      colorIdentity: colorIdentity
    };
    
    updateSlotDisplay(p);
    
    // If this commander has partner and we just set first slot, show second slot and move to it
    if (hasPartner && activeSlot === 0) {
      document.getElementById('commander-slots').querySelector('[data-slot="1"]').classList.remove('hidden');
      setActiveSlot(1);
      document.getElementById('search-input').value = '';
      document.getElementById('search-results').innerHTML = '';
      document.getElementById('search-input').focus();
    } else {
      // Clear second commander if first doesn't have partner
      if (activeSlot === 0 && !hasPartner) {
        p.commanders[1] = null;
      }
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

document.getElementById('rotate-player')?.addEventListener('change', e => {
  state.players[searchPlayer].rotated = e.target.checked;
  render();
});

// Mana (mobile modal)
let manaPlayer = 0;
function openMana(idx) {
  manaPlayer = idx;
  const p = state.players[idx];
  const colors = ['W', 'U', 'B', 'R', 'G', 'C'];
  document.getElementById('mana-title').textContent = `${p.commanders[0]?.name?.split(',')[0] || p.name} - Mana`;
  document.getElementById('mana-grid').innerHTML = colors.map(c => `
    <div class="mana-item">
      <i class="ms ms-${c.toLowerCase()} ms-cost ms-2x"></i>
      <div class="mana-value">${p.mana[c]}</div>
      <div class="mana-controls">
        <button onclick="changeMana('${c}', -1)">−</button>
        <button onclick="changeMana('${c}', 1)">+</button>
      </div>
    </div>
  `).join('');
  openModal('mana-modal');
}

function changeMana(color, delta) {
  state.players[manaPlayer].mana[color] = Math.max(0, state.players[manaPlayer].mana[color] + delta);
  openMana(manaPlayer);
  render();
}

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
    { key: 'storm', icon: '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M7 2v11h3v9l7-12h-4l4-8z" fill="currentColor"/></svg>', label: 'Storm', step: 1 },
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
  const labels = { poison: 'poison', energy: 'energy', experience: 'experience', storm: 'storm', cmdTax: 'commander tax' };
  logAction(`${getPlayerName(counterPlayer)} ${delta > 0 ? 'gained' : 'lost'} ${Math.abs(delta)} ${labels[key]}`);
  openCounters(counterPlayer);
  render();
}

// Commander Damage
let cmdrPlayer = 0;
function openCmdr(idx) {
  cmdrPlayer = idx;
  const p = state.players[idx];
  
  // Build grouped by player
  const html = state.players.map((other, playerIdx) => {
    if (playerIdx === idx) return '';
    const cmd1 = other.commanders[0];
    const cmd2 = other.commanders[1];
    const key1 = `${playerIdx}-0`;
    const key2 = `${playerIdx}-1`;
    const dmg1 = p.cmdDamage[key1] || 0;
    const dmg2 = p.cmdDamage[key2] || 0;
    
    if (cmd1 && cmd2) {
      // Partners - show both in one box
      return `<div class="cmdr-item partners">
        <div class="cmdr-row">
          <div class="cmdr-from">${cmd1.name.split(',')[0]}</div>
          <div class="cmdr-value">${dmg1}</div>
          <div class="cmdr-controls">
            <button onclick="changeCmdr('${key1}', -1)">−</button>
            <button onclick="changeCmdr('${key1}', 1)">+</button>
          </div>
        </div>
        <div class="cmdr-row">
          <div class="cmdr-from">${cmd2.name.split(',')[0]}</div>
          <div class="cmdr-value">${dmg2}</div>
          <div class="cmdr-controls">
            <button onclick="changeCmdr('${key2}', -1)">−</button>
            <button onclick="changeCmdr('${key2}', 1)">+</button>
          </div>
        </div>
      </div>`;
    } else {
      // Single commander or no commander
      const name = cmd1 ? cmd1.name.split(',')[0] : other.name;
      return `<div class="cmdr-item">
        <div class="cmdr-from">${name}</div>
        <div class="cmdr-value">${dmg1}</div>
        <div class="cmdr-controls">
          <button onclick="changeCmdr('${key1}', -1)">−</button>
          <button onclick="changeCmdr('${key1}', 1)">+</button>
        </div>
      </div>`;
    }
  }).join('');
  
  document.getElementById('cmdr-grid').innerHTML = html;
  openModal('cmdr-modal');
}

function changeCmdr(key, delta) {
  const p = state.players[cmdrPlayer];
  const oldVal = p.cmdDamage[key] || 0;
  const newVal = Math.max(0, oldVal + delta);
  const actualDelta = newVal - oldVal;
  
  // Check for commander damage knockout at 21
  if (newVal >= 21 && oldVal < 21) {
    if (!confirm(`${getPlayerName(cmdrPlayer)} takes lethal commander damage (21+). Knock out?`)) {
      openCmdr(cmdrPlayer);
      return;
    }
    p.life = 0;
    state.knockouts.push({ player: cmdrPlayer, turn: state.turnCount, time: Date.now() });
  }
  
  p.cmdDamage[key] = newVal;
  if (actualDelta !== 0) {
    p.life -= actualDelta;
    const [playerIdx, cmdIdx] = key.split('-').map(Number);
    const other = state.players[playerIdx];
    const cmdName = other.commanders[cmdIdx]?.name.split(',')[0] || other.name;
    
    // Track commander damage dealt
    if (actualDelta > 0) {
      state.commanderDamageDealt[playerIdx] = (state.commanderDamageDealt[playerIdx] || 0) + actualDelta;
      if (newVal >= 21) {
        logAction(`${getPlayerName(cmdrPlayer)} was knocked out by commander damage from ${cmdName}`);
      } else {
        logAction(`${getPlayerName(cmdrPlayer)} took ${actualDelta} commander damage from ${cmdName} (${p.life} life)`);
      }
    } else {
      logAction(`${getPlayerName(cmdrPlayer)} removed ${-actualDelta} commander damage from ${cmdName} (+${-actualDelta} life)`);
    }
  }
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
  const results = [];
  
  for (let i = 0; i < diceCount; i++) {
    const result = Math.floor(Math.random() * diceType) + 1;
    results.push(result);
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
  
  setTimeout(() => {
    const resultStr = results.length > 1 ? results.join(', ') : results[0];
    logAction(`rolled ${diceCount}d${diceType}: ${resultStr}`);
  }, 800 + diceCount * 150 + 100);
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
    logAction(`flipped coin: ${result}`);
  }, 1000);
};

// Tools
// Clockwise order: 2p=[0,1], 3p=[0,1,2], 4p=[0,1,3,2] (top-left, top-right, bottom-right, bottom-left)
function getClockwiseOrder() {
  if (state.numPlayers === 4) return [0, 1, 3, 2];
  return Array.from({ length: state.numPlayers }, (_, i) => i);
}

document.getElementById('btn-first').onclick = () => {
  const order = getClockwiseOrder();
  let i = 0;
  const total = 15 + Math.floor(Math.random() * 10);
  const interval = setInterval(() => {
    state.activePlayer = order[i % order.length];
    render();
    i++;
    if (i >= total) {
      clearInterval(interval);
      const winner = order[Math.floor(Math.random() * order.length)];
      state.activePlayer = winner;
      state.firstPlayer = winner;
      state.turnCount = 1;
      state.turnStartTime = Date.now();
      logAction(`started turn`);
      render();
    }
  }, 100 + i * 10);
};

document.getElementById('btn-pass').onclick = () => {
  const order = getClockwiseOrder();
  const currentIdx = order.indexOf(state.activePlayer);
  if (state.activePlayer >= 0) {
    logAction(`ended turn`);
    // Track turn time
    if (state.turnStartTime) {
      const turnDuration = (Date.now() - state.turnStartTime) / 1000;
      state.turnTimes.push({ player: state.activePlayer, duration: turnDuration });
    }
  }
  
  // Find next alive player
  let nextIdx = (currentIdx + 1) % order.length;
  let attempts = 0;
  while (state.players[order[nextIdx]].life <= 0 && attempts < order.length) {
    nextIdx = (nextIdx + 1) % order.length;
    attempts++;
  }
  
  // If all players dead, don't pass turn
  if (attempts >= order.length) {
    alert('All players are knocked out!');
    return;
  }
  
  const nextPlayer = order[nextIdx];
  
  // First time setting active player
  if (state.firstPlayer === -1) {
    state.firstPlayer = nextPlayer;
    state.turnCount = 1;
  } else if (nextPlayer === state.firstPlayer) {
    // Increment turn count when returning to first player
    state.turnCount++;
  }
  state.activePlayer = nextPlayer;
  state.turnStartTime = Date.now();
  logAction(`started turn`);
  render();
};

document.getElementById('btn-log').onclick = () => {
  document.getElementById('log-list').innerHTML = state.log.length === 0 
    ? '<div class="log-empty">No actions yet</div>'
    : state.log.slice().reverse().map(e => `<div class="log-entry"><span class="log-time">${e.time}</span><span class="log-turn">${e.turn}</span><span class="log-msg">${e.msg}</span></div>`).join('');
  openModal('log-modal');
};

document.getElementById('btn-dice').onclick = () => openModal('dice-modal');
document.getElementById('btn-coin').onclick = () => openModal('coin-modal');
document.getElementById('btn-stack').onclick = () => openStack();
document.getElementById('btn-particles').onclick = () => {
  state.particlesEnabled = !state.particlesEnabled;
  document.querySelectorAll('.player-particles').forEach(p => {
    p.style.display = state.particlesEnabled ? 'block' : 'none';
  });
  const btn = document.getElementById('btn-particles');
  btn.style.opacity = state.particlesEnabled ? '1' : '0.5';
};
document.getElementById('btn-phases').onclick = () => openPhases();
document.getElementById('btn-end').onclick = () => endGame();
document.getElementById('btn-reset').onclick = () => {
  if (confirm('Reset game?')) {
    if (clockInterval) clearInterval(clockInterval);
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

// Particle system for commander colors
function createPlayerParticles(container, colors) {
  const colorMap = {
    W: ['#fffbd5', '#f0e6c0'],
    U: ['#0e68ab', '#4a90c2'],
    B: ['#1a1a1a', '#0a0a0a'],
    R: ['#d32f2f', '#ff6659'],
    G: ['#388e3c', '#6abf69']
  };
  
  const particleColors = colors.flatMap(c => colorMap[c] || []);
  if (particleColors.length === 0) return;
  
  function spawnParticle() {
    const particle = document.createElement('div');
    particle.className = 'particle';
    const color = particleColors[Math.floor(Math.random() * particleColors.length)];
    const size = 4 + Math.random() * 6;
    const x = Math.random() * 100;
    const duration = 6 + Math.random() * 8;
    
    particle.style.cssText = `
      left: ${x}%;
      width: ${size}px;
      height: ${size}px;
      background: ${color};
      animation-duration: ${duration}s;
      opacity: ${0.4 + Math.random() * 0.4};
    `;
    
    container.appendChild(particle);
    setTimeout(() => particle.remove(), duration * 1000);
  }
  
  // Spawn initial particles
  for (let i = 0; i < 12; i++) {
    setTimeout(() => spawnParticle(), i * 150);
  }
  
  // Continue spawning
  setInterval(() => spawnParticle(), 600);
}

// Turn Phases
const phases = [
  { name: 'Beginning Phase', steps: ['Untap Step', 'Upkeep Step', 'Draw Step'] },
  { name: 'Precombat Main Phase', steps: [] },
  { name: 'Combat Phase', steps: ['Beginning of Combat Step', 'Declare Attackers Step', 'Declare Blockers Step', 'Combat Damage Step', 'End of Combat Step'] },
  { name: 'Postcombat Main Phase', steps: [] },
  { name: 'Ending Phase', steps: ['End Step', 'Cleanup Step'] }
];

function openPhases() {
  state.currentPhase = 0;
  state.currentStep = 0;
  renderPhases();
  openModal('phases-modal');
}

function renderPhases() {
  const container = document.getElementById('phases-container');
  const currentPhaseData = phases[state.currentPhase];
  const hasSteps = currentPhaseData.steps.length > 0;
  const currentStepName = hasSteps ? currentPhaseData.steps[state.currentStep] : null;
  
  // Main phase display
  document.getElementById('current-phase-name').textContent = currentPhaseData.name;
  document.getElementById('current-phase-number').textContent = `Phase ${state.currentPhase + 1} of ${phases.length}`;
  
  if (hasSteps) {
    document.getElementById('current-step-name').textContent = currentStepName;
    document.getElementById('current-step-number').textContent = `Step ${state.currentStep + 1} of ${currentPhaseData.steps.length}`;
    document.getElementById('step-display').classList.remove('hidden');
  } else {
    document.getElementById('step-display').classList.add('hidden');
  }
  
  // Progress dots
  const dotsContainer = document.getElementById('phase-dots');
  dotsContainer.innerHTML = phases.map((p, idx) => 
    `<div class="phase-dot ${idx === state.currentPhase ? 'active' : ''} ${idx < state.currentPhase ? 'completed' : ''}"></div>`
  ).join('');
  
  // Step dots
  if (hasSteps) {
    const stepDotsContainer = document.getElementById('step-dots');
    stepDotsContainer.innerHTML = currentPhaseData.steps.map((s, idx) => 
      `<div class="step-dot ${idx === state.currentStep ? 'active' : ''} ${idx < state.currentStep ? 'completed' : ''}"></div>`
    ).join('');
    stepDotsContainer.classList.remove('hidden');
  } else {
    document.getElementById('step-dots').classList.add('hidden');
  }
}

document.getElementById('next-phase')?.addEventListener('click', () => {
  const currentPhaseData = phases[state.currentPhase];
  const hasSteps = currentPhaseData.steps.length > 0;
  
  if (hasSteps && state.currentStep < currentPhaseData.steps.length - 1) {
    // Move to next step
    state.currentStep++;
  } else {
    // Move to next phase
    state.currentPhase = (state.currentPhase + 1) % phases.length;
    state.currentStep = 0;
  }
  
  renderPhases();
  
  // Trigger animation
  document.getElementById('phase-display').classList.add('phase-pulse');
  setTimeout(() => document.getElementById('phase-display').classList.remove('phase-pulse'), 300);
});

// End Game & Dashboard
function endGame() {
  if (!confirm('End game and view stats?')) return;
  
  if (clockInterval) clearInterval(clockInterval);
  
  // Determine winner
  const alivePlayers = state.players.filter(p => p.life > 0);
  let winner = -1;
  
  if (alivePlayers.length === 1) {
    winner = state.players.indexOf(alivePlayers[0]);
  } else if (alivePlayers.length > 1) {
    // Ask who won
    const names = alivePlayers.map((p, i) => `${state.players.indexOf(p) + 1}. ${getPlayerName(state.players.indexOf(p))}`).join('\n');
    const choice = prompt(`Multiple players alive. Who won?\n${names}\n\nEnter player number:`);
    if (choice) winner = parseInt(choice) - 1;
  }
  
  showDashboard(winner);
}

function showDashboard(winner) {
  const gameTime = Math.floor((Date.now() - state.gameStartTime) / 1000);
  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  };
  
  // Calculate stats
  const avgTurnTime = state.turnTimes.length > 0 
    ? state.turnTimes.reduce((sum, t) => sum + t.duration, 0) / state.turnTimes.length 
    : 0;
  
  const longestTurn = state.turnTimes.length > 0
    ? state.turnTimes.reduce((max, t) => t.duration > max.duration ? t : max, state.turnTimes[0])
    : null;
  
  const playerStats = state.players.map((p, idx) => {
    const lifeChange = p.life - state.startingLife;
    const totalCmdrDmg = Object.values(p.cmdDamage).reduce((sum, v) => sum + v, 0);
    const knockout = state.knockouts.find(k => k.player === idx);
    
    return {
      idx,
      name: getPlayerName(idx),
      finalLife: p.life,
      lifeChange,
      damageDealt: state.damageDealt[idx] || 0,
      cmdrDamageDealt: state.commanderDamageDealt[idx] || 0,
      cmdrDamageTaken: totalCmdrDmg,
      knockedOut: knockout ? knockout.turn : null,
      isWinner: idx === winner,
      mulligans: p.mulligans,
      cardsInHand: p.cardsInHand,
      cardsDrawn: p.cardsDrawn,
      cardsDiscarded: p.cardsDiscarded
    };
  });
  
  // Sort by placement (winner first, then by knockout order reversed, then by life)
  playerStats.sort((a, b) => {
    if (a.isWinner) return -1;
    if (b.isWinner) return 1;
    if (a.knockedOut && b.knockedOut) return b.knockedOut - a.knockedOut;
    if (a.knockedOut) return 1;
    if (b.knockedOut) return -1;
    return b.finalLife - a.finalLife;
  });
  
  const maxDamage = Math.max(...playerStats.map(p => p.damageDealt));
  const maxCmdrDamage = Math.max(...playerStats.map(p => p.cmdrDamageDealt));
  const biggestSwing = Math.max(...playerStats.map(p => Math.abs(p.lifeChange)));
  
  // Render dashboard
  document.getElementById('dashboard-game-time').textContent = formatTime(gameTime);
  document.getElementById('dashboard-turns').textContent = state.turnCount;
  document.getElementById('dashboard-avg-turn').textContent = formatTime(Math.floor(avgTurnTime));
  document.getElementById('dashboard-longest-turn').textContent = longestTurn 
    ? `${getPlayerName(longestTurn.player)} (${formatTime(Math.floor(longestTurn.duration))})`
    : 'N/A';
  
  const playersContainer = document.getElementById('dashboard-players');
  playersContainer.innerHTML = playerStats.map((p, rank) => `
    <div class="dashboard-player ${p.isWinner ? 'winner' : ''}">
      <div class="dashboard-rank">${p.isWinner ? '👑' : `#${rank + 1}`}</div>
      <div class="dashboard-player-info">
        <div class="dashboard-player-name">${p.name}</div>
        <div class="dashboard-stats-grid">
          <div class="dashboard-stat">
            <span class="stat-label">Final Life</span>
            <span class="stat-value ${p.finalLife > 0 ? 'positive' : 'negative'}">${p.finalLife}</span>
          </div>
          <div class="dashboard-stat">
            <span class="stat-label">Damage Dealt</span>
            <span class="stat-value ${p.damageDealt === maxDamage && maxDamage > 0 ? 'highlight' : ''}">${p.damageDealt}</span>
          </div>
          ${state.format === 'commander' ? `
          <div class="dashboard-stat">
            <span class="stat-label">Cmdr Damage Dealt</span>
            <span class="stat-value ${p.cmdrDamageDealt === maxCmdrDamage && maxCmdrDamage > 0 ? 'highlight' : ''}">${p.cmdrDamageDealt}</span>
          </div>
          <div class="dashboard-stat">
            <span class="stat-label">Cmdr Damage Taken</span>
            <span class="stat-value">${p.cmdrDamageTaken}</span>
          </div>
          ` : ''}
          <div class="dashboard-stat">
            <span class="stat-label">Knocked Out</span>
            <span class="stat-value">${p.knockedOut ? `Turn ${p.knockedOut}` : 'Survived'}</span>
          </div>
          <div class="dashboard-stat">
            <span class="stat-label">Starting Hand</span>
            <span class="stat-value">${p.cardsInHand} cards${p.mulligans > 0 ? ` (${p.mulligans}x)` : ''}</span>
          </div>
          <div class="dashboard-stat">
            <span class="stat-label">Cards Drawn</span>
            <span class="stat-value">${p.cardsDrawn}</span>
          </div>
          <div class="dashboard-stat">
            <span class="stat-label">Cards Discarded</span>
            <span class="stat-value">${p.cardsDiscarded}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
  
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
}

document.getElementById('dashboard-new-game')?.addEventListener('click', () => {
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
});

// Stack Tracker
let stackSearchTimeout = null;

function openStack() {
  renderStack();
  document.getElementById('stack-search-input').value = '';
  document.getElementById('stack-search-results').innerHTML = '';
  openModal('stack-modal');
}

function renderStack() {
  const container = document.getElementById('stack-container');
  if (state.stack.length === 0) {
    container.innerHTML = '<div class="stack-empty">Stack is empty</div>';
  } else {
    container.innerHTML = state.stack.map((item, idx) => {
      const playerName = getPlayerName(item.playerIdx);
      return `
      <div class="stack-card" data-idx="${idx}" style="--stack-index: ${idx}">
        <img src="${item.image}" alt="${item.name}" class="stack-card-img">
        <div class="stack-card-overlay">
          <div class="stack-card-player">${playerName}</div>
          <div class="stack-card-actions">
            <button class="stack-action-btn duplicate" onclick="duplicateInStack(${idx})" title="Duplicate">
              <svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" fill="currentColor"/></svg>
            </button>
            <button class="stack-action-btn remove" onclick="removeFromStack(${idx})" title="Remove">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" fill="currentColor"/></svg>
            </button>
          </div>
        </div>
      </div>`;
    }).join('');
  }
}

function duplicateInStack(idx) {
  if (state.stack.length < 50) {
    const item = state.stack[idx];
    state.stack.splice(idx + 1, 0, { ...item });
    renderStack();
  }
}

function removeFromStack(idx) {
  state.stack.splice(idx, 1);
  renderStack();
}

async function searchStackCards(query) {
  if (query.length < 2) {
    document.getElementById('stack-search-results').innerHTML = '';
    return;
  }
  document.getElementById('stack-search-results').innerHTML = '<div class="search-loading">Searching...</div>';
  try {
    const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&unique=cards&order=name`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    const cards = data.data.slice(0, 8);
    document.getElementById('stack-search-results').innerHTML = cards.map(card => {
      const img = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small || '';
      return `
      <div class="stack-search-result" data-name="${card.name}" data-img="${img}">
        <img src="${img}" onerror="this.style.display='none'">
        <span>${card.name}</span>
      </div>`;
    }).join('') || '<div class="search-empty">No cards found</div>';
  } catch {
    document.getElementById('stack-search-results').innerHTML = '<div class="search-empty">No cards found</div>';
  }
}

document.getElementById('stack-search-input')?.addEventListener('input', e => {
  clearTimeout(stackSearchTimeout);
  stackSearchTimeout = setTimeout(() => searchStackCards(e.target.value), 300);
});

document.getElementById('stack-search-results')?.addEventListener('click', e => {
  const result = e.target.closest('.stack-search-result');
  if (result && state.stack.length < 50) {
    const name = result.dataset.name;
    const img = result.dataset.img;
    
    // Show player selector
    const selector = document.getElementById('stack-player-selector');
    selector.innerHTML = state.players.map((p, i) => 
      `<button class="stack-player-btn" onclick="addToStack('${name.replace(/'/g, "\\'")}', '${img}', ${i})">${getPlayerName(i)}</button>`
    ).join('');
    selector.classList.remove('hidden');
  }
});

function addToStack(name, img, playerIdx) {
  state.stack.push({ name, image: img, playerIdx });
  renderStack();
  document.getElementById('stack-player-selector').classList.add('hidden');
  document.getElementById('stack-search-input').value = '';
  document.getElementById('stack-search-results').innerHTML = '';
  // Scroll to bottom to show newest card
  const container = document.getElementById('stack-container');
  setTimeout(() => container.scrollTop = container.scrollHeight, 100);
}
