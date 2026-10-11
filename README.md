# Cursed Reels — Haunted Jackpot
### HTML5 Slot Game Template

A production-ready Halloween slot game template built to premium standards — smooth reel mechanics, polished win animations, and a dark occult aesthetic that holds up alongside commercial releases. Drop it into any web project and have a fully playable slot running the same day.

---

## What's Included

- Fully playable 5-reel, 3-row slot game in a single self-contained build
- Configurable paytable, symbol set, and bet amounts — no build tools required
- Win line evaluation engine supporting up to 20 paylines
- Cascading win animation with screen shake and particle burst effects
- Free Spins bonus round triggered by 3+ Scatter symbols
- Auto-spin with configurable round count and stop-on-win toggle
- Coin balance system with persistent session state
- Responsive layout — scales cleanly from 375px mobile to 1440px desktop
- Zero external dependencies — vanilla HTML5, CSS3, and ES6 JavaScript

---

## Feature Highlights

**Reels & Mechanics**
- Weighted symbol probability table — set each symbol's reel frequency independently
- Configurable payline count (5, 10, 15, or 20 lines active)
- Wild symbol substitution with multiplier support (1×, 2×, 3×)
- Scatter pay evaluated independently of paylines
- Near-miss logic built in (configurable on/off)

**Bonus Round**
- Free Spins mode with separate spin count, multiplier, and symbol weights
- Re-trigger support during Free Spins
- Dedicated bonus intro screen and exit summary screen

**Audio**
- Web Audio API sound engine — no audio files required for core effects (procedural)
- Optional audio sprite slot for custom .mp3 / .ogg sound packs
- Mute toggle persisted via localStorage

**UI**
- Dark base with gold accent color system — CSS custom property driven, one-line recolor
- Animated background (fog layer, flickering candle elements) — CSS only
- Win display panel with coin counter, win amount flash, and jackpot banner

---

## How to Customize

All game configuration lives in one file: `config.js`. No build step. No bundler.

### Symbols

```js
// config.js
symbols: [
  { id: 'pumpkin',  label: 'Pumpkin',    value: [0, 0, 5, 20, 100],  weight: 12 },
  { id: 'skull',    label: 'Skull',      value: [0, 0, 8, 30, 150],  weight: 10 },
  { id: 'cauldron', label: 'Cauldron',   value: [0, 0, 10, 40, 200], weight: 8  },
  { id: 'bat',      label: 'Bat',        value: [0, 2, 5, 15, 80],   weight: 14 },
  { id: 'moon',     label: 'Moon',       value: [0, 2, 4, 12, 60],   weight: 16 },
  { id: 'wild',     label: 'Wild',       wild: true, multiplier: 2,   weight: 4  },
  { id: 'scatter',  label: 'Scatter',    scatter: true,               weight: 3  },
]
```

Replace symbol IDs to match your own artwork filenames (`/assets/symbols/<id>.png`).  
The `value` array maps to [1-of-a-kind, 2, 3, 4, 5] matches on a payline.

### Paytable

Each symbol's `value` array is the full paytable — edit the numbers directly. Values are multipliers applied to the current bet per line.

### Bet Amounts

```js
// config.js
bets: {
  values: [0.10, 0.20, 0.50, 1.00, 2.00, 5.00, 10.00],
  default: 1.00,
  currency: '$',
}
```

Add, remove, or replace any values. Set `currency` to any symbol or code.

### Colors

All visual theming uses CSS custom properties in `theme.css`:

```css
:root {
  --color-bg:         #0d0a14;   /* main background */
  --color-surface:    #1a1525;   /* reel frame, panels */
  --color-accent:     #c9a227;   /* gold highlights, borders */
  --color-accent-hot: #ff6b35;   /* win flashes, hot state */
  --color-text:       #f0e6cc;   /* primary text */
  --color-text-muted: #7a6e8a;   /* secondary / disabled text */
}
```

Swap the gold accent to any color to match a different theme in under 30 seconds.

---

## Tech Stack

| Layer    | Technology                              |
|----------|-----------------------------------------|
| Markup   | HTML5 (semantic, accessible roles)      |
| Styling  | CSS3 — custom properties, Grid, Flexbox |
| Logic    | Vanilla ES6+ JavaScript (no framework)  |
| Audio    | Web Audio API (no library)              |
| Storage  | localStorage (balance, settings)        |
| Build    | None — open `index.html` in a browser   |

**No npm. No webpack. No React. No jQuery.** One folder, open in browser, done.

---

## Browser Compatibility

| Browser         | Minimum Version | Notes                          |
|-----------------|-----------------|--------------------------------|
| Chrome / Edge   | 88+             | Full support                   |
| Firefox         | 85+             | Full support                   |
| Safari          | 14+             | Full support                   |
| iOS Safari      | 14+             | Touch events fully mapped      |
| Android Chrome  | 88+             | Full support                   |
| Samsung Browser | 13+             | Full support                   |

IE11 and legacy Edge are not supported.

---

## File Structure

```
cursed-reels/
├── index.html          # Entry point — open this
├── config.js           # All game configuration (symbols, bets, paytable)
├── theme.css           # Color tokens and typography
├── engine/
│   ├── reels.js        # Reel spin logic and weighted draws
│   ├── evaluator.js    # Payline and scatter win evaluation
│   ├── bonus.js        # Free Spins round controller
│   └── audio.js        # Web Audio API sound engine
├── ui/
│   ├── display.js      # DOM rendering and animation controller
│   └── panels.js       # Paytable, settings, and info screens
├── assets/
│   ├── symbols/        # Symbol artwork (PNG, recommended 200×200px)
│   └── bg/             # Background layers (optional replacements)
└── README.md
```

---

## License

This template is sold under the **OWL Supply Commercial Template License**. See `LICENSE.txt` for full terms.

**In plain English:**
- ✅ Use in one commercial project or website
- ✅ Modify freely — reskin, rebrand, extend
- ✅ Sell a game/product built on this template
- ❌ Resell or redistribute the source code itself
- ❌ Use in more than one end project without purchasing an additional license
- ❌ Sublicense to third parties as a template or starter kit

Questions? Reach out via the Gumroad purchase receipt.
