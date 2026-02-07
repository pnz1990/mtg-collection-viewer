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
  knockouts: [],
  advancedMode: false,
  dayNight: 'day',
  monarch: -1,
  initiative: -1,
  ringBearer: -1,
  ringTemptation: 0,
  currentPlane: null,
  lifeHistory: [],
  firstBlood: null,
  currentDungeon: null,
  history: [],
  animations: true,
  theme: 'dark'
};

// Phone detection - block phones, allow tablets and laptops
(function checkDevice() {
  const isPhone = /iPhone|Android/i.test(navigator.userAgent) && window.innerWidth < 768;
  if (isPhone) {
    document.getElementById('phone-block').classList.remove('hidden');
    return;
  }
})();

let clockInterval = null;

// Undo system
function saveHistory() {
  state.history.push(JSON.stringify({ players: state.players, turnCount: state.turnCount, activePlayer: state.activePlayer, log: state.log, turnTimes: state.turnTimes, damageDealt: state.damageDealt, commanderDamageDealt: state.commanderDamageDealt, knockouts: state.knockouts, lifeHistory: state.lifeHistory, monarch: state.monarch, initiative: state.initiative, ringBearer: state.ringBearer, ringTemptation: state.ringTemptation }));
  if (state.history.length > 50) state.history.shift();
}

function undo() {
  if (state.history.length === 0) return alert('Nothing to undo');
  const prev = JSON.parse(state.history.pop());
  Object.assign(state, prev);
  render();
}

// Auto-save
function saveGame() {
  const data = JSON.stringify(state);
  localStorage.setItem('mtg-game-save', data);
  alert('Game saved locally! Use "Share Game" to create a shareable link.');
}

function autoSave() {
  if (state.gameStartTime) {
    localStorage.setItem('mtg-game-autosave', JSON.stringify(state));
  }
}

function loadGame() {
  const autosave = localStorage.getItem('mtg-game-autosave');
  if (autosave) {
    if (confirm('Resume previous game?')) {
      try {
        const loaded = JSON.parse(autosave);
        // Deep copy all state
        state.players = loaded.players || state.players;
        state.numPlayers = loaded.numPlayers || state.numPlayers;
        state.startingLife = loaded.startingLife || state.startingLife;
        state.activePlayer = loaded.activePlayer ?? state.activePlayer;
        state.turnCount = loaded.turnCount || state.turnCount;
        state.firstPlayer = loaded.firstPlayer ?? state.firstPlayer;
        state.log = loaded.log || state.log;
        state.stack = loaded.stack || state.stack;
        state.turnTimes = loaded.turnTimes || state.turnTimes;
        state.damageDealt = loaded.damageDealt || state.damageDealt;
        state.commanderDamageDealt = loaded.commanderDamageDealt || state.commanderDamageDealt;
        state.knockouts = loaded.knockouts || state.knockouts;
        state.lifeHistory = loaded.lifeHistory || state.lifeHistory;
        state.firstBlood = loaded.firstBlood || state.firstBlood;
        state.monarch = loaded.monarch ?? state.monarch;
        state.initiative = loaded.initiative ?? state.initiative;
        state.ringBearer = loaded.ringBearer ?? state.ringBearer;
        state.ringTemptation = loaded.ringTemptation || state.ringTemptation;
        state.format = loaded.format || state.format;
        state.gameStartTime = Date.now() - ((Date.now() - loaded.gameStartTime) || 0);
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        startClock();
        render();
      } catch (e) {
        console.error('Failed to load game:', e);
        alert('Failed to load saved game');
      }
    } else {
      localStorage.removeItem('mtg-game-autosave');
    }
  }
}

function shareGame() {
  // Removed - only auto-save/load on refresh
}

function loadFromShare() {
  // Removed - only auto-save/load on refresh
}

// Auto-save every 30 seconds
setInterval(autoSave, 30000);

// Animations
function animateLife(idx, delta) {
  if (!state.animations) return;
  const player = document.querySelector(`.player[data-idx="${idx}"]`);
  const anim = document.createElement('div');
  anim.className = 'life-anim';
  anim.textContent = delta > 0 ? `+${delta}` : delta;
  anim.style.cssText = `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 3rem; font-weight: 700; color: ${delta > 0 ? '#4caf50' : '#f44336'}; z-index: 100; animation: lifeAnim 1s ease-out forwards; pointer-events: none;`;
  player.appendChild(anim);
  setTimeout(() => anim.remove(), 1000);
}

function animateEvent(idx, text, color = '#e63946') {
  if (!state.animations) return;
  const player = document.querySelector(`.player[data-idx="${idx}"]`);
  const anim = document.createElement('div');
  anim.textContent = text;
  anim.style.cssText = `position: absolute; top: 30%; left: 50%; transform: translate(-50%, -50%); font-size: 2rem; font-weight: 700; color: ${color}; z-index: 100; animation: eventAnim 1.5s ease-out forwards; pointer-events: none; text-shadow: 0 0 10px ${color};`;
  player.appendChild(anim);
  setTimeout(() => anim.remove(), 1500);
}

function logAction(msg) {
  const name = state.activePlayer >= 0 ? getPlayerName(state.activePlayer) : 'Setup';
  const turnLabel = state.turnCount > 0 ? `${name} T${state.turnCount}` : 'Setup';
  state.log.push({ time: new Date().toLocaleTimeString(), turn: turnLabel, msg });
}

function addNote() {
  const note = prompt('Add note:');
  if (note) {
    logAction(`📝 ${note}`);
    render();
  }
}

function getPlayerName(idx) {
  const p = state.players[idx];
  return p.commanders[0]?.name.split(',')[0] || p.name;
}

// Setup
function loadFormats() {
  const formats = ['commander', 'standard', 'modern', 'legacy', 'vintage', 'pioneer', 'pauper'];
  const container = document.getElementById('format-select');
  container.innerHTML = formats.map(f => 
    `<button data-value="${f}" ${f === 'commander' ? 'class="selected"' : ''}>${f.charAt(0).toUpperCase() + f.slice(1)}</button>`
  ).join('');
}

loadFormats();
loadGame();

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
    cardsDiscarded: 0,
    planeswalkers: [],
    citysBlessing: false,
    customCounters: {},
    dungeon: null
  }));
  state.gameStartTime = Date.now();
  state.turnStartTime = null;
  state.log = [];
  state.stack = [];
  state.turnTimes = [];
  state.damageDealt = {};
  state.commanderDamageDealt = {};
  state.knockouts = [];
  state.lifeHistory = [];
  state.firstBlood = null;
  state.history = [];
  for (let i = 0; i < state.numPlayers; i++) {
    state.damageDealt[i] = 0;
    state.commanderDamageDealt[i] = 0;
  }
  startClock();
  render();
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('game-screen').classList.remove('hidden');
}

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  const gameStarted = !document.getElementById('game-screen').classList.contains('hidden');
  
  if ((e.key === 't' || e.key === 'T') && gameStarted) {
    e.preventDefault();
    document.getElementById('btn-pass').click();
  } else if ((e.key === 'b' || e.key === 'B') && gameStarted) {
    e.preventDefault();
    document.getElementById('btn-first').click();
  } else if (e.key === 'Escape' && gameStarted) {
    e.preventDefault();
    endGame();
  } else if (e.key === 'ArrowUp' && gameStarted && state.activePlayer >= 0) {
    e.preventDefault();
    saveHistory();
    state.players[state.activePlayer].life += 1;
    animateLife(state.activePlayer, 1);
    logAction(`${getPlayerName(state.activePlayer)} gained 1 life`);
    render();
  } else if (e.key === 'ArrowDown' && gameStarted && state.activePlayer >= 0) {
    e.preventDefault();
    saveHistory();
    state.players[state.activePlayer].life -= 1;
    animateLife(state.activePlayer, -1);
    logAction(`${getPlayerName(state.activePlayer)} lost 1 life`);
    render();
  } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    undo();
  } else if ((e.key === 'n' || e.key === 'N') && gameStarted) {
    addNote();
  } else if ((e.key === 's' || e.key === 'S') && gameStarted) {
    openStack();
  } else if ((e.key === 'd' || e.key === 'D') && gameStarted) {
    openModal('dice-modal');
  } else if ((e.key === 'c' || e.key === 'C') && gameStarted) {
    openModal('coin-modal');
  } else if ((e.key === 'l' || e.key === 'L') && gameStarted) {
    document.getElementById('btn-log').click();
  } else if ((e.key === 'i' || e.key === 'I') && gameStarted) {
    showKeyboardShortcuts();
  }
});

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
    if (p.experience > 0) badges.push(`<span class="badge experience">EXP ${p.experience}</span>`);
    if (state.monarch === i) badges.push(`<span class="badge monarch">MONARCH</span>`);
    if (state.initiative === i) badges.push(`<span class="badge initiative">INITIATIVE</span>`);
    if (state.ringBearer === i) badges.push(`<span class="badge ring">RING BEARER</span>`);
    if (p.citysBlessing) badges.push(`<span class="badge citys">CITY'S BLESSING</span>`);
    
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
      
      saveHistory();
      state.players[idx].life = newLife;
      animateLife(idx, delta);
      
      // Track damage dealt and first blood
      if (delta < 0 && state.activePlayer >= 0 && state.activePlayer !== idx) {
        state.damageDealt[state.activePlayer] = (state.damageDealt[state.activePlayer] || 0) + Math.abs(delta);
        if (!state.firstBlood) {
          state.firstBlood = { attacker: state.activePlayer, victim: idx, turn: state.turnCount };
        }
      }
      
      // Track life history
      state.lifeHistory.push({ turn: state.turnCount, lives: state.players.map(p => p.life) });
      
      // Track knockouts
      if (oldLife > 0 && newLife <= 0) {
        state.knockouts.push({ player: idx, killer: state.activePlayer, turn: state.turnCount, time: Date.now() });
        animateEvent(idx, '💀 KNOCKED OUT');
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
          state.knockouts.push({ player: idx, killer: null, turn: state.turnCount, time: Date.now() });
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
  let pressTimer = null;
  
  c.addEventListener('pointerdown', e => {
    const lifeBtn = e.target.closest('.life-btn');
    if (lifeBtn) {
      const player = lifeBtn.closest('.player');
      const idx = parseInt(player.dataset.idx);
      const delta = parseInt(lifeBtn.dataset.delta) * 10;
      
      lifeHoldTimer = setTimeout(() => {
        lifeHoldInterval = setInterval(() => {
          const oldLife = state.players[idx].life;
          const newLife = oldLife + delta;
          
          // Check for knockout
          if (oldLife > 0 && newLife <= 0) {
            if (lifeHoldInterval) clearInterval(lifeHoldInterval);
            if (confirm(`Knock out ${getPlayerName(idx)}?`)) {
              saveHistory();
              state.players[idx].life = 0;
              state.knockouts.push({ player: idx, killer: state.activePlayer, turn: state.turnCount, time: Date.now() });
              animateEvent(idx, '💀 KNOCKED OUT');
              logAction(`${getPlayerName(idx)} was knocked out`);
              render();
            }
            return;
          }
          
          saveHistory();
          state.players[idx].life = newLife;
          
          if (delta < 0 && !state.firstBlood && state.activePlayer >= 0 && state.activePlayer !== idx) {
            state.firstBlood = { attacker: state.activePlayer, victim: idx, turn: state.turnCount };
            state.damageDealt[state.activePlayer] = (state.damageDealt[state.activePlayer] || 0) + Math.abs(delta);
          }
          
          state.lifeHistory.push({ turn: state.turnCount, lives: state.players.map(p => p.life) });
          animateLife(idx, delta);
          logAction(`${getPlayerName(idx)} ${delta > 0 ? 'gained' : 'lost'} ${Math.abs(delta)} life`);
          render();
        }, 1000);
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
    state.knockouts.push({ player: cmdrPlayer, killer: playerIdx, turn: state.turnCount, time: Date.now() });
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
document.getElementById('btn-toggle-tools').onclick = () => {
  state.advancedMode = !state.advancedMode;
  document.getElementById('basic-tools').classList.toggle('hidden', state.advancedMode);
  document.getElementById('advanced-tools').classList.toggle('hidden', !state.advancedMode);
};

// Advanced tools
document.getElementById('btn-planeswalker')?.addEventListener('click', () => openPWModal());
document.getElementById('btn-monarch')?.addEventListener('click', () => openMonarchModal());
document.getElementById('btn-daynight')?.addEventListener('click', () => toggleDayNight());
document.getElementById('btn-dungeon')?.addEventListener('click', () => openDungeonModal());
document.getElementById('btn-ring')?.addEventListener('click', () => openRingModal());
document.getElementById('btn-vote')?.addEventListener('click', () => openVoteModal());
document.getElementById('btn-planechase')?.addEventListener('click', () => openPlanechase());
document.getElementById('btn-citys')?.addEventListener('click', () => openCitysModal());

document.getElementById('btn-reset').onclick = () => {
  if (confirm('Reset game?')) {
    if (clockInterval) clearInterval(clockInterval);
    localStorage.removeItem('mtg-game-autosave');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
  }
};
document.getElementById('btn-menu').onclick = () => location.href = 'index.html';
document.getElementById('btn-undo')?.addEventListener('click', () => undo());
document.getElementById('btn-note')?.addEventListener('click', () => addNote());
document.getElementById('btn-info')?.addEventListener('click', () => showKeyboardShortcuts());
document.getElementById('btn-theme')?.addEventListener('click', () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.body.classList.toggle('light-theme', state.theme === 'light');
});
document.getElementById('btn-animations')?.addEventListener('click', () => {
  state.animations = !state.animations;
  document.getElementById('btn-animations').style.opacity = state.animations ? '1' : '0.5';
});

function showKeyboardShortcuts() {
  openModal('shortcuts-modal');
}

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
    showDashboard(winner);
  } else if (alivePlayers.length > 1) {
    // Show modal to select winner
    showWinnerModal(alivePlayers);
  } else {
    showDashboard(-1);
  }
}

function showWinnerModal(alivePlayers) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="winner-modal">
      <h2>Who Won?</h2>
      <div class="winner-players">
        ${alivePlayers.map(p => {
          const idx = state.players.indexOf(p);
          return `<button class="winner-btn" data-idx="${idx}">${getPlayerName(idx)}</button>`;
        }).join('')}
      </div>
      <button class="modal-close">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelectorAll('.winner-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const winner = parseInt(btn.dataset.idx);
      modal.remove();
      showDashboard(winner);
    });
  });
  
  modal.querySelector('.modal-close').addEventListener('click', () => {
    modal.remove();
    startClock(); // Resume game
  });
  
  // Close on overlay click
  modal.addEventListener('click', e => {
    if (e.target === modal) {
      modal.remove();
      startClock();
    }
  });
}

function showDashboard(winner) {
  const gameTime = Math.floor((Date.now() - state.gameStartTime) / 1000);
  const formatTime = (s) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0 ? `${h}h ${m}m ${sec}s` : `${m}m ${sec}s`;
  };
  
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
    const playerTurns = state.turnTimes.filter(t => t.player === idx);
    const avgPlayerTurn = playerTurns.length > 0 ? playerTurns.reduce((s, t) => s + t.duration, 0) / playerTurns.length : 0;
    const drawEfficiency = state.turnCount > 0 ? (p.cardsDrawn / state.turnCount).toFixed(1) : 0;
    
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
      cardsDiscarded: p.cardsDiscarded,
      avgTurnTime: avgPlayerTurn,
      drawEfficiency
    };
  });
  
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
  
  // Render basic stats
  document.getElementById('dashboard-game-time').textContent = formatTime(gameTime);
  document.getElementById('dashboard-turns').textContent = state.turnCount;
  document.getElementById('dashboard-avg-turn').textContent = formatTime(Math.floor(avgTurnTime));
  document.getElementById('dashboard-longest-turn').textContent = longestTurn 
    ? `${getPlayerName(longestTurn.player)} (${formatTime(Math.floor(longestTurn.duration))})`
    : 'N/A';
  
  // Life history chart
  if (state.lifeHistory.length > 0) {
    const ctx = document.getElementById('life-chart').getContext('2d');
    const colors = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#f4a261', '#264653'];
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: [...new Set(state.lifeHistory.map(h => h.turn))],
        datasets: state.players.map((p, i) => ({
          label: getPlayerName(i),
          data: state.lifeHistory.filter(h => h.lives[i] !== undefined).map(h => ({ x: h.turn, y: h.lives[i] })),
          borderColor: colors[i],
          backgroundColor: colors[i] + '20',
          tension: 0.3
        }))
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }
  
  // Damage heatmap
  const heatmap = document.getElementById('damage-heatmap');
  heatmap.innerHTML = `<div class="heatmap-grid">${state.players.map((_, i) => 
    `<div class="heatmap-row"><span class="heatmap-label">${getPlayerName(i)}</span>${state.players.map((_, j) => {
      if (i === j) return '<div class="heatmap-cell self">-</div>';
      const dmg = state.damageDealt[i] || 0;
      const intensity = dmg > 0 ? Math.min(dmg / maxDamage, 1) : 0;
      return `<div class="heatmap-cell" style="background: rgba(230,57,70,${intensity})">${dmg}</div>`;
    }).join('')}</div>`
  ).join('')}</div>`;
  
  // First blood
  if (state.firstBlood) {
    document.getElementById('first-blood').innerHTML = `
      <h4>🩸 First Blood</h4>
      <p>${getPlayerName(state.firstBlood.attacker)} dealt first damage to ${getPlayerName(state.firstBlood.victim)} on turn ${state.firstBlood.turn}</p>
    `;
  }
  
  // Kingmaker (who knocked out the most)
  const knockoutCounts = {};
  state.knockouts.forEach(k => {
    const killer = k.killer !== undefined ? k.killer : -1;
    knockoutCounts[killer] = (knockoutCounts[killer] || 0) + 1;
  });
  const kingmaker = Object.entries(knockoutCounts).sort((a, b) => b[1] - a[1])[0];
  if (kingmaker && kingmaker[0] !== '-1') {
    document.getElementById('kingmaker').innerHTML = `
      <h4>👑 Kingmaker</h4>
      <p>${getPlayerName(parseInt(kingmaker[0]))} knocked out ${kingmaker[1]} player${kingmaker[1] > 1 ? 's' : ''}</p>
    `;
  }
  
  // Player rankings
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
            <span class="stat-label">Draw Efficiency</span>
            <span class="stat-value">${p.drawEfficiency} cards/turn</span>
          </div>
          <div class="dashboard-stat">
            <span class="stat-label">Starting Hand</span>
            <span class="stat-value">${p.cardsInHand} cards${p.mulligans > 0 ? ` (${p.mulligans}x)` : ''}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
  
  // Turn time leaderboard
  const turnLeaderboard = document.getElementById('turn-time-leaderboard');
  const sortedBySpeed = [...playerStats].sort((a, b) => a.avgTurnTime - b.avgTurnTime);
  turnLeaderboard.innerHTML = `
    <div class="leaderboard">
      <div class="leaderboard-item fastest"><span>⚡ Fastest:</span> ${sortedBySpeed[0].name} (${formatTime(Math.floor(sortedBySpeed[0].avgTurnTime))})</div>
      <div class="leaderboard-item slowest"><span>🐌 Slowest:</span> ${sortedBySpeed[sortedBySpeed.length - 1].name} (${formatTime(Math.floor(sortedBySpeed[sortedBySpeed.length - 1].avgTurnTime))})</div>
    </div>
  `;
  
  document.getElementById('game-screen').classList.add('hidden');
  document.getElementById('dashboard-screen').classList.remove('hidden');
}

document.getElementById('share-summary')?.addEventListener('click', () => {
  const summary = {
    format: state.format,
    players: state.players.map((p, i) => ({ name: getPlayerName(i), life: p.life })),
    turns: state.turnCount,
    time: Math.floor((Date.now() - state.gameStartTime) / 1000)
  };
  const encoded = btoa(JSON.stringify(summary));
  const url = `${window.location.origin}${window.location.pathname}?game=${encoded}`;
  navigator.clipboard.writeText(url).then(() => alert('Summary link copied!'));
});

document.getElementById('dashboard-new-game')?.addEventListener('click', () => {
  document.getElementById('dashboard-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
});

// Advanced Tools Implementation

// Planeswalker Tracker
let pwSearchTimeout = null;
let pwSelectedPlayer = -1;

function openPWModal() {
  document.getElementById('pw-search-input').value = '';
  document.getElementById('pw-search-results').innerHTML = '';
  document.getElementById('pw-list').innerHTML = renderAllPW();
  pwSelectedPlayer = -1;
  renderPWPlayerSelect();
  openModal('planeswalker-modal');
}

function renderPWPlayerSelect() {
  const container = document.getElementById('pw-player-select');
  container.innerHTML = state.players.map((p, i) => `
    <button class="token-player-btn ${pwSelectedPlayer === i ? 'active' : ''}" onclick="selectPWPlayer(${i})">${getPlayerName(i)}</button>
  `).join('');
}

function selectPWPlayer(idx) {
  pwSelectedPlayer = idx;
  renderPWPlayerSelect();
}

function renderAllPW() {
  let html = '';
  state.players.forEach((p, pIdx) => {
    if (p.planeswalkers.length > 0) {
      html += `<h4 style="margin: 15px 20px 10px; font-size: 0.9rem;">${getPlayerName(pIdx)}</h4>`;
      p.planeswalkers.forEach((pw, pwIdx) => {
        html += `
          <div class="pw-item">
            <img src="${pw.img}" style="width: 40px; height: 56px; border-radius: 4px; object-fit: cover;">
            <div class="pw-name">${pw.name}</div>
            <div class="pw-loyalty">
              <button onclick="changePWLoyalty(${pIdx}, ${pwIdx}, -1)">−</button>
              <span>${pw.loyalty}</span>
              <button onclick="changePWLoyalty(${pIdx}, ${pwIdx}, 1)">+</button>
            </div>
            <button class="pw-remove" onclick="removePW(${pIdx}, ${pwIdx})">✕</button>
          </div>`;
      });
    }
  });
  return html || '<div class="empty-state">No planeswalkers tracked</div>';
}

function changePWLoyalty(pIdx, pwIdx, delta) {
  const pw = state.players[pIdx].planeswalkers[pwIdx];
  pw.loyalty = Math.max(0, parseInt(pw.loyalty) + parseInt(delta));
  document.getElementById('pw-list').innerHTML = renderAllPW();
}

function removePW(pIdx, pwIdx) {
  state.players[pIdx].planeswalkers.splice(pwIdx, 1);
  document.getElementById('pw-list').innerHTML = renderAllPW();
}

document.getElementById('pw-search-input')?.addEventListener('input', e => {
  clearTimeout(pwSearchTimeout);
  const query = e.target.value.trim();
  if (query.length < 2) {
    document.getElementById('pw-search-results').innerHTML = '';
    return;
  }
  pwSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}+type:planeswalker`);
      const data = await res.json();
      document.getElementById('pw-search-results').innerHTML = data.data.slice(0, 10).map(c => `
        <div class="search-result" data-card='${JSON.stringify({ name: c.name, img: c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small, loyalty: c.loyalty || c.card_faces?.[0]?.loyalty || 3 })}'>
          <img src="${c.image_uris?.small || c.card_faces?.[0]?.image_uris?.small}" alt="${c.name}">
          <div class="result-info"><div class="result-name">${c.name}</div></div>
        </div>
      `).join('');
    } catch {}
  }, 300);
});

document.getElementById('pw-search-results')?.addEventListener('click', e => {
  const result = e.target.closest('.search-result');
  if (!result) return;
  if (pwSelectedPlayer < 0) {
    alert('Select a player first');
    return;
  }
  const card = JSON.parse(result.dataset.card);
  card.loyalty = parseInt(card.loyalty); // Ensure number
  state.players[pwSelectedPlayer].planeswalkers.push(card);
  logAction(`${getPlayerName(pwSelectedPlayer)} added ${card.name}`);
  document.getElementById('pw-list').innerHTML = renderAllPW();
  document.getElementById('pw-search-input').value = '';
  document.getElementById('pw-search-results').innerHTML = '';
});

// Monarch/Initiative
function openMonarchModal() {
  renderMonarch();
  openModal('monarch-modal');
}

function renderMonarch() {
  document.getElementById('monarch-players').innerHTML = state.players.map((p, i) => `
    <button class="token-player-btn ${state.monarch === i ? 'active' : ''}" onclick="setMonarch(${i})">${getPlayerName(i)}</button>
  `).join('');
  document.getElementById('initiative-players').innerHTML = state.players.map((p, i) => `
    <button class="token-player-btn ${state.initiative === i ? 'active' : ''}" onclick="setInitiative(${i})">${getPlayerName(i)}</button>
  `).join('');
}

function setMonarch(idx) {
  state.monarch = state.monarch === idx ? -1 : idx;
  if (state.monarch >= 0) animateEvent(idx, 'MONARCH', '#ffd700');
  logAction(state.monarch >= 0 ? `${getPlayerName(idx)} becomes the monarch` : 'Monarch removed');
  renderMonarch();
  render(); // Update player panels to show badge
}

function setInitiative(idx) {
  state.initiative = state.initiative === idx ? -1 : idx;
  if (state.initiative >= 0) animateEvent(idx, 'INITIATIVE', '#ff6b6b');
  logAction(state.initiative >= 0 ? `${getPlayerName(idx)} takes the initiative` : 'Initiative removed');
  renderMonarch();
  render(); // Update player panels to show badge
}

// Day/Night
function toggleDayNight() {
  state.dayNight = state.dayNight === 'day' ? 'night' : 'day';
  const indicator = document.getElementById('daynight-status');
  indicator.textContent = state.dayNight === 'day' ? '☀️ Day' : '🌙 Night';
  indicator.style.display = 'block';
  if (state.animations) {
    state.players.forEach((_, i) => animateEvent(i, state.dayNight === 'day' ? '☀️ DAY' : '🌙 NIGHT', state.dayNight === 'day' ? '#ffd700' : '#4a5568'));
  }
  logAction(`It becomes ${state.dayNight}`);
}

// Dungeon Tracker
let dungeonCards = [];
let dungeonSelectedPlayer = -1;

async function openDungeonModal() {
  if (dungeonCards.length === 0) {
    try {
      const res = await fetch('https://api.scryfall.com/cards/search?q=type:dungeon+game:paper');
      const data = await res.json();
      dungeonCards = data.data;
    } catch {}
  }
  dungeonSelectedPlayer = -1;
  renderDungeonPlayerSelect();
  renderDungeon();
  openModal('dungeon-modal');
}

function renderDungeonPlayerSelect() {
  document.getElementById('dungeon-player-select').innerHTML = state.players.map((p, i) => `
    <button class="token-player-btn ${dungeonSelectedPlayer === i ? 'active' : ''}" onclick="selectDungeonPlayer(${i})">${getPlayerName(i)}</button>
  `).join('');
}

function selectDungeonPlayer(idx) {
  dungeonSelectedPlayer = idx;
  renderDungeonPlayerSelect();
  renderDungeon();
}

function renderDungeon() {
  if (dungeonSelectedPlayer < 0) {
    document.getElementById('dungeon-display').innerHTML = '<div class="empty-state">Select a player</div>';
    return;
  }
  const p = state.players[dungeonSelectedPlayer];
  if (!p.dungeon && dungeonCards.length > 0) {
    p.dungeon = { card: dungeonCards[0], room: 0 };
  }
  if (!p.dungeon) return;
  
  document.getElementById('dungeon-display').innerHTML = `
    <img src="${p.dungeon.card.image_uris?.normal || ''}" style="width: 100%; max-width: 500px; border-radius: 12px; margin-bottom: 15px;">
    <div style="font-size: 1.2rem; margin-bottom: 10px;">Room: ${p.dungeon.room + 1}</div>
    <div style="display: flex; gap: 10px; justify-content: center;">
      <button onclick="advanceDungeon()" class="action-btn">Next Room</button>
      <button onclick="changeDungeon()" class="action-btn secondary">Change Dungeon</button>
    </div>
  `;
}

function advanceDungeon() {
  if (dungeonSelectedPlayer < 0) return;
  const p = state.players[dungeonSelectedPlayer];
  if (!p.dungeon) return;
  p.dungeon.room++;
  logAction(`${getPlayerName(dungeonSelectedPlayer)} advanced to room ${p.dungeon.room + 1}`);
  renderDungeon();
}

function changeDungeon() {
  if (dungeonSelectedPlayer < 0 || dungeonCards.length === 0) return;
  const p = state.players[dungeonSelectedPlayer];
  const currentIdx = dungeonCards.findIndex(d => d.id === p.dungeon?.card.id);
  const nextIdx = (currentIdx + 1) % dungeonCards.length;
  p.dungeon = { card: dungeonCards[nextIdx], room: 0 };
  renderDungeon();
}

// Ring Tempts You
function openRingModal() {
  renderRing();
  openModal('ring-modal');
}

function renderRing() {
  document.getElementById('ring-bearer-name').textContent = state.ringBearer >= 0 ? getPlayerName(state.ringBearer) : 'None';
  document.getElementById('ring-temptation').textContent = state.ringTemptation;
  document.getElementById('ring-players').innerHTML = state.players.map((p, i) => `
    <button class="token-player-btn ${state.ringBearer === i ? 'active' : ''}" onclick="setRingBearer(${i})">${getPlayerName(i)}</button>
  `).join('');
}

function setRingBearer(idx) {
  state.ringBearer = idx;
  logAction(`${getPlayerName(idx)} becomes the Ring-bearer`);
  renderRing();
  render(); // Update player panels to show badge
}

document.getElementById('ring-tempt')?.addEventListener('click', () => {
  if (state.ringBearer < 0) {
    alert('Select a Ring-bearer first');
    return;
  }
  state.ringTemptation++;
  logAction(`The Ring tempts ${getPlayerName(state.ringBearer)} (${state.ringTemptation})`);
  renderRing();
});

// Voting
function openVoteModal() {
  renderVote();
  openModal('vote-modal');
}

function renderVote() {
  const container = document.getElementById('vote-options');
  container.innerHTML = state.players.map((p, i) => `
    <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
      <span style="min-width: 100px;">${getPlayerName(i)}</span>
      <input type="text" id="vote-${i}" placeholder="Vote..." style="flex: 1; padding: 8px; border-radius: 6px; border: 2px solid var(--bg3); background: var(--bg); color: var(--text);">
    </div>
  `).join('');
}

document.getElementById('tally-votes')?.addEventListener('click', () => {
  const votes = {};
  state.players.forEach((p, i) => {
    const input = document.getElementById(`vote-${i}`);
    if (input && input.value) votes[input.value] = (votes[input.value] || 0) + 1;
  });
  const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
  const result = sorted[0];
  if (result) {
    alert(`Winner: ${result[0]} (${result[1]} vote${result[1] > 1 ? 's' : ''})`);
    logAction(`Vote result: ${result[0]} wins with ${result[1]} vote${result[1] > 1 ? 's' : ''}`);
  } else {
    alert('No votes cast');
  }
});

// Planechase
async function openPlanechase() {
  if (!state.currentPlane) await rollPlane();
  openModal('planechase-modal');
}

async function rollPlane() {
  try {
    const res = await fetch('https://api.scryfall.com/cards/random?q=type:plane+game:paper');
    const card = await res.json();
    state.currentPlane = card;
    document.getElementById('plane-name').textContent = card.name;
    const img = document.getElementById('plane-img');
    img.src = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || '';
    img.style.transform = 'rotate(90deg)';
    logAction(`Planeswalked to ${card.name}`);
  } catch (e) {
    alert('Failed to fetch plane');
  }
}

document.getElementById('roll-plane')?.addEventListener('click', () => rollPlane());
document.getElementById('roll-chaos')?.addEventListener('click', () => {
  const roll = Math.random();
  const result = roll < 0.167 ? 'CHAOS!' : 'Blank';
  const resultEl = document.createElement('div');
  resultEl.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: var(--bg2); border: 3px solid var(--accent); border-radius: 20px; padding: 40px 60px; font-size: 3rem; font-weight: 700; z-index: 10000; animation: chaosAnim 1.5s ease-out forwards;';
  resultEl.textContent = result;
  document.body.appendChild(resultEl);
  setTimeout(() => resultEl.remove(), 1500);
  if (roll < 0.167) logAction('Chaos symbol rolled!');
});

// City's Blessing
function openCitysModal() {
  renderCitys();
  openModal('citys-modal');
}

function renderCitys() {
  document.getElementById('citys-players').innerHTML = state.players.map((p, i) => `
    <button class="token-player-btn ${p.citysBlessing ? 'active' : ''}" onclick="toggleCitys(${i})">${getPlayerName(i)}</button>
  `).join('');
}

function toggleCitys(idx) {
  state.players[idx].citysBlessing = !state.players[idx].citysBlessing;
  if (state.players[idx].citysBlessing) animateEvent(idx, 'CITY\'S BLESSING', '#4299e1');
  logAction(`${getPlayerName(idx)} ${state.players[idx].citysBlessing ? 'gained' : 'lost'} the city's blessing`);
  renderCitys();
  render(); // Update player panels to show badge
}

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
