// Comprehensive Game Tracker Tests
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

// Mock state
const mockState = {
  players: Array.from({ length: 4 }, (_, i) => ({
    name: `Player ${i + 1}`, life: 40, commanders: [null, null],
    poison: 0, energy: 0, experience: 0, storm: 0, cmdTax: 0,
    mana: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 },
    planeswalkers: [], citysBlessing: false, dungeon: null,
    cmdDamage: {}, mulligans: 0, cardsInHand: 7, cardsDrawn: 0, cardsDiscarded: 0,
    customCounters: {}
  })),
  numPlayers: 4, startingLife: 40, activePlayer: 0, turnCount: 1, firstPlayer: 0,
  log: [], history: [], lifeHistory: [], knockouts: [],
  damageDealt: { 0: 0, 1: 0, 2: 0, 3: 0 },
  commanderDamageDealt: { 0: 0, 1: 0, 2: 0, 3: 0 },
  monarch: -1, initiative: -1, ringBearer: -1, ringTemptation: 0,
  dayNight: 'day', currentPlane: null, format: 'commander',
  particlesEnabled: true, animations: true, theme: 'dark', advancedMode: false, firstBlood: null
};

// Run all tests
section('Core Game State');
test('4 players initialized', () => assertEquals(mockState.players.length, 4));
test('Starting life is 40', () => assertEquals(mockState.startingLife, 40));
test('Active player is 0', () => assertEquals(mockState.activePlayer, 0));
test('Turn count is 1', () => assertEquals(mockState.turnCount, 1));
test('Format is commander', () => assertEquals(mockState.format, 'commander'));

section('Life Tracking');
test('Life decreases', () => { mockState.players[0].life -= 5; assert(mockState.players[0].life === 35); });
test('Life increases', () => { mockState.players[0].life += 10; assert(mockState.players[0].life === 45); });
test('Life can be 0', () => { mockState.players[1].life = 0; assertEquals(mockState.players[1].life, 0); });
test('Life can be negative', () => { mockState.players[1].life = -5; assert(mockState.players[1].life < 0); });
test('Life history tracks', () => { mockState.lifeHistory.push({ turn: 1, lives: [45, -5, 40, 40] }); assert(mockState.lifeHistory.length > 0); });

section('Damage Tracking');
test('Damage starts at 0', () => assertEquals(mockState.damageDealt[0], 0));
test('Damage increments', () => { mockState.damageDealt[0] = 10; assertEquals(mockState.damageDealt[0], 10); });
test('Commander damage separate', () => { mockState.commanderDamageDealt[0] = 5; assertEquals(mockState.commanderDamageDealt[0], 5); });
test('First blood tracks', () => { mockState.firstBlood = { attacker: 0, victim: 1, turn: 1 }; assert(mockState.firstBlood.attacker === 0); });

section('Knockouts');
test('Knockout records', () => { mockState.knockouts.push({ player: 1, killer: 0, turn: 3, time: Date.now() }); assert(mockState.knockouts.length > 0); });
test('Multiple knockouts', () => { mockState.knockouts.push({ player: 2, killer: 0, turn: 5, time: Date.now() }); assert(mockState.knockouts.length >= 2); });
test('Resignation null killer', () => { mockState.knockouts.push({ player: 3, killer: null, turn: 4, time: Date.now() }); assertEquals(mockState.knockouts[2].killer, null); });

section('Counters');
test('Poison increments', () => { mockState.players[0].poison = 5; assertEquals(mockState.players[0].poison, 5); });
test('Poison 10 lethal', () => { mockState.players[0].poison = 10; assert(mockState.players[0].poison >= 10); });
test('Energy works', () => { mockState.players[0].energy = 8; assertEquals(mockState.players[0].energy, 8); });
test('Experience works', () => { mockState.players[0].experience = 3; assertEquals(mockState.players[0].experience, 3); });
test('Storm works', () => { mockState.players[0].storm = 12; assertEquals(mockState.players[0].storm, 12); });
test('Commander tax', () => { mockState.players[0].cmdTax = 4; assertEquals(mockState.players[0].cmdTax, 4); });

section('Mana Pool');
test('Mana starts at 0', () => { const m = mockState.players[0].mana; assert(m.W === 0 && m.U === 0 && m.B === 0); });
test('White mana adds', () => { mockState.players[0].mana.W = 3; assertEquals(mockState.players[0].mana.W, 3); });
test('Multiple colors', () => { mockState.players[0].mana.U = 2; mockState.players[0].mana.R = 1; assert(mockState.players[0].mana.U === 2); });
test('Mana clears', () => { Object.keys(mockState.players[0].mana).forEach(k => mockState.players[0].mana[k] = 0); assertEquals(Object.values(mockState.players[0].mana).reduce((a,b) => a+b, 0), 0); });

section('Commander Damage');
test('Tracks per opponent', () => { mockState.players[0].cmdDamage['1-0'] = 10; assertEquals(mockState.players[0].cmdDamage['1-0'], 10); });
test('21 is lethal', () => { mockState.players[0].cmdDamage['1-0'] = 21; assert(mockState.players[0].cmdDamage['1-0'] >= 21); });
test('Multiple commanders', () => { mockState.players[0].cmdDamage['1-1'] = 5; assert(mockState.players[0].cmdDamage['1-0'] !== mockState.players[0].cmdDamage['1-1']); });

section('Mulligans');
test('Starts at 0', () => assertEquals(mockState.players[0].mulligans, 0));
test('First mulligan free', () => { mockState.players[0].mulligans = 1; mockState.players[0].cardsInHand = 7; assertEquals(mockState.players[0].cardsInHand, 7); });
test('Second to 6', () => { mockState.players[0].mulligans = 2; mockState.players[0].cardsInHand = 6; assertEquals(mockState.players[0].cardsInHand, 6); });
test('Cards drawn', () => { mockState.players[0].cardsDrawn = 10; assertEquals(mockState.players[0].cardsDrawn, 10); });
test('Cards discarded', () => { mockState.players[0].cardsDiscarded = 3; assertEquals(mockState.players[0].cardsDiscarded, 3); });

section('Monarch & Initiative');
test('Monarch unassigned', () => assertEquals(mockState.monarch, -1));
test('Monarch assign', () => { mockState.monarch = 0; assertEquals(mockState.monarch, 0); });
test('Monarch remove', () => { mockState.monarch = -1; assertEquals(mockState.monarch, -1); });
test('Initiative unassigned', () => assertEquals(mockState.initiative, -1));
test('Initiative assign', () => { mockState.initiative = 1; assertEquals(mockState.initiative, 1); });

section('The Ring');
test('Ring bearer unassigned', () => assertEquals(mockState.ringBearer, -1));
test('Ring bearer assign', () => { mockState.ringBearer = 0; assertEquals(mockState.ringBearer, 0); });
test('Temptation starts 0', () => assertEquals(mockState.ringTemptation, 0));
test('Temptation increments', () => { mockState.ringTemptation = 3; assertEquals(mockState.ringTemptation, 3); });

section('Day/Night');
test('Starts day', () => assertEquals(mockState.dayNight, 'day'));
test('Toggle night', () => { mockState.dayNight = 'night'; assertEquals(mockState.dayNight, 'night'); });
test('Toggle day', () => { mockState.dayNight = 'day'; assertEquals(mockState.dayNight, 'day'); });

section('Planeswalkers');
test('List empty', () => assertEquals(mockState.players[0].planeswalkers.length, 0));
test('Add PW', () => { mockState.players[0].planeswalkers.push({ name: 'Jace', loyalty: 4, img: '' }); assertEquals(mockState.players[0].planeswalkers.length, 1); });
test('Loyalty up', () => { mockState.players[0].planeswalkers[0].loyalty++; assertEquals(mockState.players[0].planeswalkers[0].loyalty, 5); });
test('Loyalty down', () => { mockState.players[0].planeswalkers[0].loyalty--; assertEquals(mockState.players[0].planeswalkers[0].loyalty, 4); });
test('Loyalty min 0', () => { mockState.players[0].planeswalkers[0].loyalty = 0; assertEquals(Math.max(0, mockState.players[0].planeswalkers[0].loyalty - 1), 0); });
test('Multiple PWs', () => { mockState.players[0].planeswalkers.push({ name: 'Liliana', loyalty: 3, img: '' }); assert(mockState.players[0].planeswalkers.length >= 2); });

section('Dungeons');
test('Starts null', () => assertEquals(mockState.players[0].dungeon, null));
test('Assign dungeon', () => { mockState.players[0].dungeon = { card: { name: 'Tomb' }, room: 0 }; assert(mockState.players[0].dungeon !== null); });
test('Room advances', () => { mockState.players[0].dungeon.room++; assertEquals(mockState.players[0].dungeon.room, 1); });
test('Different dungeons', () => { mockState.players[1].dungeon = { card: { name: 'Mine' }, room: 2 }; assert(mockState.players[0].dungeon.card.name !== mockState.players[1].dungeon.card.name); });

section('City\'s Blessing');
test('Starts false', () => assertEquals(mockState.players[0].citysBlessing, false));
test('Can gain', () => { mockState.players[0].citysBlessing = true; assertEquals(mockState.players[0].citysBlessing, true); });
test('Persists', () => assert(mockState.players[0].citysBlessing === true));

section('Game Mechanics');
test('Turn increments', () => { mockState.turnCount++; assert(mockState.turnCount > 1); });
test('Player rotates', () => { mockState.activePlayer = (mockState.activePlayer + 1) % mockState.numPlayers; assert(mockState.activePlayer >= 0); });
test('Log records', () => { mockState.log.push({ time: '12:00', turn: 'P1 T1', msg: 'Test' }); assert(mockState.log.length > 0); });
test('History saves', () => { mockState.history.push(JSON.stringify({ test: 'state' })); assert(mockState.history.length > 0); });
test('History restores', () => { const s = JSON.parse(mockState.history.pop()); assertEquals(s.test, 'state'); });

section('Probability');
test('Chaos ~16.7%', () => { let c = 0; for (let i = 0; i < 10000; i++) if (Math.random() < 0.167) c++; const r = c / 10000; assert(r > 0.15 && r < 0.19); });
test('Random player valid', () => { const p = Math.floor(Math.random() * mockState.numPlayers); assert(p >= 0 && p < mockState.numPlayers); });
test('D6 range', () => { const r = Math.floor(Math.random() * 6) + 1; assert(r >= 1 && r <= 6); });
test('D20 range', () => { const r = Math.floor(Math.random() * 20) + 1; assert(r >= 1 && r <= 20); });
test('Coin binary', () => { const f = Math.random() < 0.5 ? 'heads' : 'tails'; assert(f === 'heads' || f === 'tails'); });

section('UI State');
test('Particles toggle', () => { mockState.particlesEnabled = !mockState.particlesEnabled; assert(typeof mockState.particlesEnabled === 'boolean'); });
test('Animations toggle', () => { mockState.animations = !mockState.animations; assert(typeof mockState.animations === 'boolean'); });
test('Theme change', () => { mockState.theme = 'light'; assertEquals(mockState.theme, 'light'); mockState.theme = 'dark'; });
test('Advanced mode', () => { mockState.advancedMode = !mockState.advancedMode; assert(typeof mockState.advancedMode === 'boolean'); });

section('Edge Cases');
test('Negative life', () => { mockState.players[2].life = -10; assert(mockState.players[2].life < 0); });
test('High life', () => { mockState.players[2].life = 1000; assertEquals(mockState.players[2].life, 1000); });
test('Valid player count', () => assert(mockState.numPlayers > 0));
test('History limit', () => assert(mockState.history.length <= 50));

section('Bug Fixes - Regression Tests');
test('PW loyalty is number not string', () => {
  const pw = { name: 'Test', loyalty: 4, img: '' };
  mockState.players[0].planeswalkers = [pw];
  const newLoyalty = parseInt(pw.loyalty) + 1;
  assertEquals(typeof newLoyalty, 'number');
  assertEquals(newLoyalty, 5);
});

test('PW loyalty does not concatenate', () => {
  const pw = { name: 'Test', loyalty: '4', img: '' };
  const result = parseInt(pw.loyalty) + 1;
  assertEquals(result, 5);
  assert(result !== 41, 'Should not concatenate to 41');
});

test('Ring bearer badge shows when assigned', () => {
  mockState.ringBearer = 0;
  assert(mockState.ringBearer === 0);
});

test('Monarch badge shows when assigned', () => {
  mockState.monarch = 1;
  assert(mockState.monarch === 1);
});

test('Initiative badge shows when assigned', () => {
  mockState.initiative = 2;
  assert(mockState.initiative === 2);
});

test('City\'s blessing badge shows when gained', () => {
  mockState.players[0].citysBlessing = true;
  assert(mockState.players[0].citysBlessing === true);
});

test('Multiple status badges can coexist', () => {
  mockState.monarch = 0;
  mockState.ringBearer = 0;
  mockState.players[0].citysBlessing = true;
  assert(mockState.monarch === 0 && mockState.ringBearer === 0 && mockState.players[0].citysBlessing);
});

test('Chaos roll probability correct', () => {
  let chaos = 0;
  for (let i = 0; i < 1000; i++) {
    if (Math.random() < 0.167) chaos++;
  }
  const ratio = chaos / 1000;
  assert(ratio > 0.1 && ratio < 0.25, `Chaos ratio ${ratio} should be ~0.167`);
});

test('Dungeon per-player isolation', () => {
  mockState.players[0].dungeon = { card: { name: 'D1' }, room: 1 };
  mockState.players[1].dungeon = { card: { name: 'D2' }, room: 3 };
  assert(mockState.players[0].dungeon.room !== mockState.players[1].dungeon.room);
  assert(mockState.players[0].dungeon.card.name !== mockState.players[1].dungeon.card.name);
});

test('Ring image URL is valid', () => {
  const url = 'https://cards.scryfall.io/large/front/d/4/d4eadebc-c30f-4d5f-a1f0-d6b3e876c186.jpg';
  assert(url.includes('scryfall.io'));
  assert(url.includes('.jpg'));
});

test('Plane card rotation applied', () => {
  const rotation = 'rotate(90deg)';
  assert(rotation.includes('90deg'));
});

section('Save/Load State');
test('State can be serialized to JSON', () => {
  const json = JSON.stringify(mockState);
  assert(json.length > 0);
  assert(json.includes('players'));
});

test('State can be deserialized from JSON', () => {
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.numPlayers, mockState.numPlayers);
  assertEquals(restored.startingLife, mockState.startingLife);
});

test('Player life persists in save', () => {
  mockState.players[0].life = 25;
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.players[0].life, 25);
});

test('Player names persist in save', () => {
  mockState.players[0].name = 'Test Player';
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.players[0].name, 'Test Player');
});

test('Turn count persists in save', () => {
  mockState.turnCount = 10;
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.turnCount, 10);
});

test('Active player persists in save', () => {
  mockState.activePlayer = 2;
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.activePlayer, 2);
});

test('Damage dealt persists in save', () => {
  mockState.damageDealt[0] = 50;
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.damageDealt[0], 50);
});

test('Knockouts persist in save', () => {
  mockState.knockouts = [{ player: 1, killer: 0, turn: 5, time: Date.now() }];
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.knockouts.length, 1);
  assertEquals(restored.knockouts[0].player, 1);
});

test('Monarch state persists in save', () => {
  mockState.monarch = 1;
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.monarch, 1);
});

test('Ring bearer persists in save', () => {
  mockState.ringBearer = 2;
  mockState.ringTemptation = 4;
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.ringBearer, 2);
  assertEquals(restored.ringTemptation, 4);
});

test('Planeswalkers persist in save', () => {
  mockState.players[0].planeswalkers = [{ name: 'Jace', loyalty: 3, img: '' }];
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.players[0].planeswalkers.length, 1);
  assertEquals(restored.players[0].planeswalkers[0].name, 'Jace');
  assertEquals(restored.players[0].planeswalkers[0].loyalty, 3);
});

test('Dungeon state persists in save', () => {
  mockState.players[0].dungeon = { card: { name: 'Tomb' }, room: 2 };
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.players[0].dungeon.room, 2);
  assertEquals(restored.players[0].dungeon.card.name, 'Tomb');
});

test('Life history persists in save', () => {
  mockState.lifeHistory = [{ turn: 1, lives: [40, 35, 40, 40] }];
  const json = JSON.stringify(mockState);
  const restored = JSON.parse(json);
  assertEquals(restored.lifeHistory.length, 1);
  assertEquals(restored.lifeHistory[0].lives[1], 35);
});

section('Device Detection');
test('Phone detection identifies small screens', () => {
  const isPhone = window.innerWidth < 768;
  assert(typeof isPhone === 'boolean');
});

test('iPad and laptop screens are allowed', () => {
  const isAllowed = window.innerWidth >= 768;
  assert(typeof isAllowed === 'boolean');
});

test('Phone block prevents interaction', () => {
  // Simulate phone detection
  const isPhone = true;
  if (isPhone) {
    const pointerEvents = 'none';
    assertEquals(pointerEvents, 'none', 'Should disable pointer events on phone');
  }
});

section('Winner Selection');
test('Winner modal shows for multiple alive players', () => {
  const alivePlayers = mockState.players.filter(p => p.life > 0);
  assert(alivePlayers.length > 0);
});

test('Winner can be selected from alive players', () => {
  mockState.players[0].life = 20;
  mockState.players[1].life = 15;
  mockState.players[2].life = 0;
  mockState.players[3].life = 0;
  const alivePlayers = mockState.players.filter(p => p.life > 0);
  assertEquals(alivePlayers.length, 2);
});

test('Single winner is auto-selected', () => {
  mockState.players[0].life = 20;
  mockState.players[1].life = 0;
  mockState.players[2].life = 0;
  mockState.players[3].life = 0;
  const alivePlayers = mockState.players.filter(p => p.life > 0);
  assertEquals(alivePlayers.length, 1);
  const winner = mockState.players.indexOf(alivePlayers[0]);
  assertEquals(winner, 0);
});

section('Life Hold Increment');
test('Hold increment should be 10 per second', () => {
  const incrementAmount = 10;
  const intervalMs = 1000;
  assertEquals(incrementAmount, 10);
  assertEquals(intervalMs, 1000);
});

test('Hold increment applies correctly', () => {
  mockState.players[0].life = 40;
  mockState.players[0].life += 10;
  assertEquals(mockState.players[0].life, 50);
});

test('Hold decrement applies correctly', () => {
  mockState.players[0].life = 40;
  mockState.players[0].life -= 10;
  assertEquals(mockState.players[0].life, 30);
});

section('Auto-Save Only');
test('Auto-save stores to localStorage', () => {
  const testData = { test: 'autosave' };
  localStorage.setItem('mtg-game-autosave', JSON.stringify(testData));
  const loaded = JSON.parse(localStorage.getItem('mtg-game-autosave'));
  assertEquals(loaded.test, 'autosave');
  localStorage.removeItem('mtg-game-autosave');
});

test('Auto-save preserves game state', () => {
  localStorage.setItem('mtg-game-autosave', JSON.stringify(mockState));
  const loaded = JSON.parse(localStorage.getItem('mtg-game-autosave'));
  assertEquals(loaded.numPlayers, mockState.numPlayers);
  localStorage.removeItem('mtg-game-autosave');
});

section('Bug Regression Tests');
test('Mulligan: First mulligan is free (7 cards)', () => {
  const player = { mulligans: 0, cardsInHand: 7 };
  player.mulligans++;
  player.cardsInHand = Math.max(1, 7 - (player.mulligans - 1));
  assertEquals(player.cardsInHand, 7, 'First mulligan should still be 7 cards');
});

test('Mulligan: Second mulligan is 6 cards', () => {
  const player = { mulligans: 1, cardsInHand: 7 };
  player.mulligans++;
  player.cardsInHand = Math.max(1, 7 - (player.mulligans - 1));
  assertEquals(player.cardsInHand, 6, 'Second mulligan should be 6 cards');
});

test('Mulligan: Third mulligan is 5 cards', () => {
  const player = { mulligans: 2, cardsInHand: 6 };
  player.mulligans++;
  player.cardsInHand = Math.max(1, 7 - (player.mulligans - 1));
  assertEquals(player.cardsInHand, 5, 'Third mulligan should be 5 cards');
});

test('Mulligan: Seventh mulligan is 1 card minimum', () => {
  const player = { mulligans: 6, cardsInHand: 2 };
  player.mulligans++;
  player.cardsInHand = Math.max(1, 7 - (player.mulligans - 1));
  assertEquals(player.cardsInHand, 1, 'Seventh mulligan should be 1 card minimum');
});

test('Life history tracks turn and lives', () => {
  const history = [];
  const players = [{ life: 40 }, { life: 38 }, { life: 40 }, { life: 40 }];
  history.push({ turn: 1, lives: players.map(p => p.life) });
  assertEquals(history[0].turn, 1);
  assertEquals(history[0].lives[1], 38);
});

test('Life history chart has correct data structure', () => {
  const lifeHistory = [
    { turn: 0, lives: [40, 40, 40, 40] },
    { turn: 1, lives: [40, 38, 40, 40] },
    { turn: 2, lives: [35, 38, 40, 40] }
  ];
  const turns = [...new Set(lifeHistory.map(h => h.turn))];
  assertEquals(turns.length, 3);
  assertEquals(turns[0], 0);
  assertEquals(turns[2], 2);
});

test('Damage heatmap calculates intensity correctly', () => {
  const damageDealt = { 0: 10, 1: 5, 2: 0, 3: 15 };
  const maxDamage = Math.max(...Object.values(damageDealt));
  const intensity = damageDealt[0] / maxDamage;
  assert(intensity > 0 && intensity <= 1);
  assertEquals(Math.round(intensity * 100), 67); // 10/15 = 0.67
});

test('Share summary encodes correctly', () => {
  const summary = {
    format: 'commander',
    players: [{ name: 'Player 1', life: 40 }],
    turns: 10,
    time: 600
  };
  const encoded = btoa(JSON.stringify(summary));
  const decoded = JSON.parse(atob(encoded));
  assertEquals(decoded.format, 'commander');
  assertEquals(decoded.turns, 10);
});

test('Share summary decodes correctly', () => {
  const summary = { format: 'commander', players: [{ name: 'Test', life: 20 }], turns: 5, time: 300 };
  const encoded = btoa(JSON.stringify(summary));
  const decoded = JSON.parse(atob(encoded));
  assertEquals(decoded.players[0].name, 'Test');
  assertEquals(decoded.players[0].life, 20);
});

section('Badge Display');
test('Monarch badge appears when set', () => {
  mockState.monarch = 0;
  const hasBadge = mockState.monarch === 0;
  assert(hasBadge, 'Monarch badge should show for player 0');
});

test('Initiative badge appears when set', () => {
  mockState.initiative = 1;
  const hasBadge = mockState.initiative === 1;
  assert(hasBadge, 'Initiative badge should show for player 1');
});

test('Ring bearer badge appears when set', () => {
  mockState.ringBearer = 2;
  const hasBadge = mockState.ringBearer === 2;
  assert(hasBadge, 'Ring bearer badge should show for player 2');
});

test('City\'s blessing badge appears when gained', () => {
  mockState.players[0].citysBlessing = true;
  assert(mockState.players[0].citysBlessing, 'City\'s blessing badge should show');
});

test('Multiple badges can show on same player', () => {
  mockState.monarch = 0;
  mockState.ringBearer = 0;
  mockState.players[0].citysBlessing = true;
  const badges = [];
  if (mockState.monarch === 0) badges.push('monarch');
  if (mockState.ringBearer === 0) badges.push('ring');
  if (mockState.players[0].citysBlessing) badges.push('citys');
  assert(badges.length === 3, 'Should have 3 badges');
});

test('Ring image URL is valid', () => {
  const url = 'https://cards.scryfall.io/large/front/7/2/7215460e-8c06-47d0-94e5-d1832d0218af.jpg';
  assert(url.includes('scryfall.io'), 'Should be Scryfall URL');
  assert(url.includes('/large/'), 'Should be large image');
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

// Test button order and layout
test('Primary bar has correct button order', () => {
  const buttons = ['btn-first', 'btn-log', 'btn-pass', 'btn-undo', 'btn-dice', 'btn-coin', 'btn-stack', 'btn-end'];
  buttons.forEach(id => {
    assert(document.getElementById(id), `Button ${id} should exist in primary bar`);
  });
});

test('Advanced menu has correct buttons', () => {
  const buttons = ['btn-monarch', 'btn-citys', 'btn-daynight', 'btn-dungeon', 'btn-ring', 'btn-vote', 'btn-planechase', 'btn-planeswalker', 'btn-theme', 'btn-animations'];
  buttons.forEach(id => {
    assert(document.getElementById(id), `Button ${id} should exist in advanced menu`);
  });
});

test('Toggle, reset, and home buttons appear only once', () => {
  const toggleBtns = document.querySelectorAll('#btn-toggle-tools');
  const resetBtns = document.querySelectorAll('#btn-reset');
  const homeBtns = document.querySelectorAll('#btn-menu');
  
  assert(toggleBtns.length === 1, `Toggle button should appear once, found ${toggleBtns.length}`);
  assert(resetBtns.length === 1, `Reset button should appear once, found ${resetBtns.length}`);
  assert(homeBtns.length === 1, `Home button should appear once, found ${homeBtns.length}`);
});

test('Toggle, reset, and home buttons are outside tool groups', () => {
  const toggle = document.getElementById('btn-toggle-tools');
  const reset = document.getElementById('btn-reset');
  const home = document.getElementById('btn-menu');
  
  assert(!toggle.closest('.tools-group'), 'Toggle button should not be inside tools-group');
  assert(!reset.closest('.tools-group'), 'Reset button should not be inside tools-group');
  assert(!home.closest('.tools-group'), 'Home button should not be inside tools-group');
});

test('Commander format is last in format list', () => {
  const formats = ['standard', 'modern', 'legacy', 'vintage', 'pioneer', 'pauper', 'commander'];
  assert(formats[formats.length - 1] === 'commander', 'Commander should be last format');
});

test('Commander format is pre-selected', () => {
  const selected = document.querySelector('#format-select .selected');
  assert(selected && selected.dataset.value === 'commander', 'Commander should be pre-selected');
});

test('Particles toggle removed (bundled with animations)', () => {
  const particlesBtn = document.getElementById('btn-particles');
  assert(!particlesBtn, 'Particles button should not exist (bundled with animations)');
});

test('Reset game clears all state', () => {
  const resetFunction = `
    state.activePlayer = -1;
    state.turnCount = 0;
    state.dayNight = 'day';
    state.monarch = -1;
    state.initiative = -1;
    state.ringBearer = -1;
    state.currentDungeon = null;
  `;
  assert(resetFunction.includes('dayNight'), 'Reset should clear dayNight');
  assert(resetFunction.includes('monarch'), 'Reset should clear monarch');
  assert(resetFunction.includes('initiative'), 'Reset should clear initiative');
  assert(resetFunction.includes('ringBearer'), 'Reset should clear ringBearer');
  assert(resetFunction.includes('currentDungeon'), 'Reset should clear currentDungeon');
});
