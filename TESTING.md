# Game Tracker Tests

## Running Tests

Open `test-game-tracker.html` in a browser to run the comprehensive test suite.

## Test Coverage (100+ tests)

### Core Game State (5 tests)
- Player initialization
- Starting life
- Active player
- Turn counter
- Format validation

### Life Tracking (5 tests)
- Life increase/decrease
- Zero and negative life
- Life history tracking

### Damage Tracking (4 tests)
- Damage dealt tracking
- Commander damage
- First blood detection

### Knockouts (3 tests)
- Knockout recording
- Multiple knockouts
- Resignation tracking

### Counters (6 tests)
- Poison (lethal at 10)
- Energy
- Experience
- Storm
- Commander tax

### Mana Pool (4 tests)
- All 6 colors (WUBRGC)
- Multiple colors
- Mana clearing

### Commander Damage (3 tests)
- Per-opponent tracking
- Lethal at 21
- Multiple commanders

### Mulligans (5 tests)
- Free first mulligan
- Subsequent mulligans
- Cards drawn/discarded

### Advanced Tools (30+ tests)
- Monarch & Initiative assignment/removal
- The Ring (bearer + temptation)
- Day/Night toggle
- Planeswalker tracking (add, loyalty up/down, minimum 0)
- Dungeon per-player tracking
- City's Blessing

### Game Mechanics (5 tests)
- Turn progression
- Player rotation
- Game log
- History/undo stack

### Probability (5 tests)
- Chaos roll (~16.7%)
- Random player selection
- Dice rolls (D6, D20)
- Coin flip

### UI State (4 tests)
- Particles toggle
- Animations toggle
- Theme switching
- Advanced mode

### Edge Cases (4 tests)
- Negative life
- Very high life
- Valid player counts
- History limits

## Pre-Push Hook

The git pre-push hook automatically:
1. ✅ Validates JavaScript syntax for all files
2. ✅ Prevents broken code from being pushed
3. ✅ Reminds you to run browser tests

To manually check syntax:
```bash
node -c js/game-tracker.js
node -c test-game-tracker.js
```

## Test Results

All tests validate:
- State management correctness
- Game rule enforcement
- Edge case handling
- No regressions in core mechanics

Run tests before major changes to ensure nothing breaks!
