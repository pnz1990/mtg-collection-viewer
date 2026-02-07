# Bug Fix Checklist

## ✅ Fixed Issues

### Core Gameplay
- [x] Life tracking increments/decrements correctly
- [x] Hold-to-increment at proper speed (400ms)
- [x] Knockout confirmation at 0 life
- [x] Damage tracking and first blood
- [x] Turn passing and rotation
- [x] Game clock and turn clock
- [x] Undo functionality (Ctrl+Z)
- [x] Auto-save to localStorage
- [x] Share game link (minimal data)

### Advanced Tools
- [x] Planeswalker tracker with player selection buttons
- [x] Planeswalker loyalty buttons work correctly
- [x] Monarch/Initiative equal button layout
- [x] Day/Night toggle with indicator
- [x] Dungeon per-player tracking
- [x] Ring temptation with card image
- [x] Voting system works
- [x] Planechase cards display horizontally (rotated 90°)
- [x] Chaos roll shows proper alert (not blank)
- [x] City's Blessing toggle

### UI/UX
- [x] Animations for life changes, knockouts, events
- [x] Light/Dark theme toggle
- [x] Keyboard shortcuts (Space, Ctrl+Z, Ctrl+S, N)
- [x] Add notes to game log
- [x] Particle effects toggle

### Dashboard
- [x] Life history chart
- [x] Damage heatmap
- [x] Turn time leaderboard
- [x] Kingmaker stats
- [x] First blood tracking
- [x] Draw efficiency
- [x] Share summary link

## 🔧 Known Limitations

### Dungeon
- [ ] Click-to-pin room functionality not implemented
  - Currently: Manual room advancement with buttons
  - Future: Click on card image to mark current room

### Custom Counters
- [ ] UI not implemented
  - State structure exists: `player.customCounters`
  - Future: Modal to add/remove custom counter types

## 🧪 Testing

### Automated
- Pre-push hook checks JavaScript syntax
- Test suite in `test-game-tracker.html` covers core mechanics

### Manual Testing Checklist
- [ ] Start game with 2-4 players
- [ ] Change life totals (click and hold)
- [ ] Pass turns and verify turn counter
- [ ] Add commanders (Commander format)
- [ ] Track mana, counters, cards in hand
- [ ] Use all 8 advanced tools
- [ ] End game and view dashboard
- [ ] Save/load game state
- [ ] Test undo functionality
- [ ] Verify all animations
- [ ] Test theme toggle
- [ ] Check keyboard shortcuts

## 📝 Regression Prevention

1. **Pre-push hook** - Syntax validation before every push
2. **Test suite** - Core mechanics validation
3. **TESTING.md** - Documentation of known issues
4. **This checklist** - Track fixed vs pending issues

## 🚀 Next Steps

1. Implement dungeon click-to-pin
2. Add custom counters UI
3. Expand test coverage
4. Add visual regression tests (screenshots)
5. Performance optimization for 4+ players
