# Game Tracker Tests

## Running Tests

Open `test-game-tracker.html` in a browser to run the test suite.

Tests cover:
- State initialization
- Life tracking and knockouts
- Damage tracking
- Monarch/Initiative assignment
- Ring temptation mechanics
- Planeswalker loyalty tracking
- Per-player dungeon tracking
- Chaos roll probability
- History/undo functionality

## Pre-Push Hook

A git pre-push hook automatically checks JavaScript syntax before pushing.

To manually run syntax checks:
```bash
node -c js/game-tracker.js
```

## Known Issues Fixed

✅ Plane cards display horizontally (rotated 90°)
✅ Chaos roll shows proper result (not blank alert)
✅ Planeswalker loyalty buttons work correctly
✅ Life hold increment at proper speed with knockout check
✅ Per-player dungeon tracking
✅ Auto-save uses localStorage (no URI length issues)

## Future Improvements

- Add dungeon room click-to-pin functionality
- Add custom counter UI
- Expand test coverage
- Add integration tests
