# MTG Collection Viewer

An immersive, interactive web application for viewing and exploring your Magic: The Gathering card collection. Features stunning visual effects, multiple view modes, comprehensive filtering, detailed analytics, and a full-featured game tracker.

🔗 **Live Demo:** [https://pnz1990.github.io/mtg-collection-viewer/](https://pnz1990.github.io/mtg-collection-viewer/index.html)

![MTG Collection Viewer](https://img.shields.io/badge/MTG-Collection%20Viewer-blue)

## Features

### 🎮 Game Tracker

A comprehensive game state tracker for MTG games with support for multiple formats:

**Format Support:**
- Commander (4 players, 40 life)
- Standard, Modern, Legacy, Vintage, Pioneer, Pauper (2 players, 20 life)
- Auto-configures player count and starting life based on format

**Life & Counters:**
- Life total tracking with +/- buttons
- Poison, Energy, Experience, Storm, and Commander Tax counters
- Mana pool tracking (W/U/B/R/G/C)
- Player badges for active counters

**Commander Features (Commander format only):**
- Commander search with Scryfall integration
- Partner commander support
- Commander damage tracking per opponent
- Commander art backgrounds
- Color identity particles (floating mana symbols in commander colors)
- Rotate player panels 180° for opposite-side players

**Game Tools:**
- **Turn Tracker** - Pass turn with clockwise rotation, "Who Goes First" randomizer
- **Game Clock** - Tracks total game time
- **Turn Clock** - Resets each turn
- **Stack Tracker** - Visual card stack with player assignment, duplicate cards for storm
- **Turn Phases** - Step-by-step phase tracker with all substeps
- **Dice Roller** - D6, D12, D20 with animated 3D dice
- **Coin Flipper** - Animated 3D coin flip
- **Game Log** - Timestamped action history

**Additional Features:**
- Player name customization (non-Commander formats)
- Toggle particles on/off
- Mobile-optimized layout
- Responsive design for all screen sizes

### 🎴 Multiple View Modes

- **Collection Explorer** - Grid view with all cards, charts, and statistics
- **Binder View** - Classic binder layout with page-flip animations
- **Carousel View** - Showcase cards one at a time with navigation
- **Timeline View** - Cards organized by set release date

### ✨ Interactive Card Effects

- **3D Tilt** - Click and drag cards to rotate them in 3D space
- **Foil Shimmer** - Dynamic holographic effect on foil/etched cards that moves with drag
- **Card Back** - See the card back when tilting
- **Smooth Animations** - Fluid transitions throughout the app

### 🔍 Comprehensive Filtering

- Search by card name
- Filter by set (with autocomplete)
- Price range slider
- Rarity (common, uncommon, rare, mythic)
- Finish (normal, foil, etched)
- Card type (Creature, Instant, Sorcery, etc.)
- Color (White, Blue, Black, Red, Green, Colorless, Multicolor)
- Keywords (Flying, Trample, etc.)
- Reserved List cards
- Color Identity (for EDH/Commander)
- **Clickable Labels** - Click any badge on a card to filter by that attribute

### 💰 Price Source Toggle

Choose between two price sources:
- **Manabox Prices** - Uses prices from your CSV export (supports any currency)
- **Scryfall Prices (USD)** - Uses cached Scryfall prices (requires "Load Full Data")

### 📊 Analytics Dashboard

12 interactive charts (click any segment to filter):

- By Rarity
- By Set (Count)
- By Finish
- By Price Range
- Value by Set
- Price Statistics (avg, median, min, max)
- By Condition
- Value by Rarity
- By Type
- By Color
- Mana Curve
- Average CMC by Type
- Reserved List Count/Value/Type/Top Cards

### 🏆 Achievement Badges

30 collectible achievements including:
- Collection milestones (10, 50, 100, 500, 1000 cards)
- Value milestones ($100, $500, $1000, $5000)
- Foil collector badges
- Type specialist badges (creature collector, spell slinger, etc.)
- Color devotion badges
- Mana curve achievements

### 🔧 Additional Tools

- **Deck Checker** - Paste a deck list to see which cards you own vs. need
- **Trade Calculator** - Compare trade values with visual card selection
  - Select cards from your collection to trade away
  - Enter cards to receive (fetches all printings from Scryfall)
  - Visual version picker with normal/foil prices
  - Copy trade summary to clipboard
  - Generate shareable trade links
- **Collection Trivia** - 10-question quiz game testing your knowledge of your own collection
- **Guess the Card** - Progressive hint game with 10 clues per card
  - Hints reveal: mana value, colors, rarity, type, set, price, mana cost, P/T, subtype, first letter
  - Autocomplete from your collection
  - Score based on hints used
  - Dramatic card reveal animation
- **Random Card** - Jump to a random card in your collection
- **Load Full Data** - Fetch extended card data (types, colors, keywords) from Scryfall API
- **Clear Filters** - Reset all filters with one click

### 🎨 Themes

10 MTG guild-inspired color themes:
Azorius, Dimir, Rakdos, Gruul, Selesnya, Orzhov, Izzet, Golgari, Boros, Simic

### 📱 Responsive Design

Fully responsive layout that works on desktop, tablet, and mobile devices.

## Setup

1. Export your collection from [Moxfield](https://www.moxfield.com/) as CSV
2. Replace `Collection.csv` with your exported file
3. Host the files on any static web server (GitHub Pages, Netlify, etc.)

### CSV Format

The app expects a Moxfield-style CSV with these columns:
- Name, Set Code, Set Name, Collector Number, Foil, Rarity, Quantity, MoxfieldID, Scryfall ID, Price, etc.

## Testing

The project includes comprehensive test suites:

- **test/test-game-tracker.html** - Game tracker functionality tests
- **test/test-detail.html** - Card detail page tests  
- **test/test-card-back.html** - Card back visibility tests (3D flip effects)

Open any test file in a browser to run the test suite.
- [Chart.js](https://www.chartjs.org/) for analytics charts
- [noUiSlider](https://refreshless.com/nouislider/) for price range slider
- [Scryfall API](https://scryfall.com/docs/api) for card images and data
- IndexedDB for local caching of images and card data

## Project Structure

```
mtg-collection-viewer/
├── index.html          # Collection Explorer (main page)
├── binder.html         # Binder view
├── carousel.html       # Carousel view
├── timeline.html       # Timeline view
├── detail.html         # Card detail page
├── deck-checker.html   # Deck checker tool
├── trade-calculator.html # Trade calculator
├── trivia.html         # Collection trivia game
├── guess-card.html     # Guess the card game
├── data/
│   └── Collection.csv  # Your card collection data
├── js/
│   ├── shared.js       # Shared functions and utilities
│   ├── grid.js         # Collection Explorer logic
│   ├── binder.js       # Binder view logic
│   ├── carousel.js     # Carousel view logic
│   ├── timeline.js     # Timeline view logic
│   └── detail.js       # Card detail page logic
├── css/
│   ├── style.css       # Main stylesheet
│   └── detail.css      # Card detail page styles
└── images/
    ├── back.png        # Card back image
    └── favicon.ico     # Site favicon
```

## License

MIT License - Feel free to use and modify for your own collection!

---
Last updated: February 2026

## Credits

- Card images and data from [Scryfall](https://scryfall.com/)
- Set icons from Scryfall's SVG API
- Built with ❤️ for the MTG community
