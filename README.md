# Cursed Reels — Haunted Bass
### HTML5 Halloween slot game template (canvas, no dependencies)

A complete, playable fishing-collect slot: Golden Bass money symbols, a Haunted Fisherman wild that reels them in during free spins, retriggers with multipliers up to x10, a base-game "Hook" feature and a bonus buy. Built in vanilla JavaScript on a single `<canvas>`. Open `index.html` and play.

**Live demo:** https://m3lkerz.github.io/cursed-reels-slot/

---

## Features

**Game**
- 5 reels × 3 rows, 20 fixed paylines, stacked symbols on real reel strips
- 4 royals (A K Q J) + 5 themed symbols + Wild, Money symbol and Scatter
- **Golden Bass money symbols** with cash values from 2x to 1,000x bet
- **Free Spins:** 3/4/5 Blood Moons award 10/15/20 spins
- **Haunted Fisherman wild** (free spins only) collects every Golden Bass on screen
- **Retrigger ladder:** every 4 Fishermen → +10 spins and multiplier x2 → x3 → x10
- **The Hook:** 4+ Golden Bass in the base game can summon the Fisherman to collect them
- **Bonus buy** (100x bet) with confirmation dialog
- Max win cap 5,000x
- **Math model RTP 96.3%** — simulated over 8,000,000 spins (`node sim.js`)

**Presentation**
- Reel physics: staggered start, wind-up, motion blur, overshoot bounce on stop
- Scatter anticipation (reels slow down with glow and rising sound when 2 Moons land)
- Win lines with per-line amounts, symbol pulse, dimmed losers
- Big Win → Mega → Epic → Cursed Win banner that escalates during the count-up, coin fountain and screen shake
- Animated scene: parallax background, drifting fog, fireflies, flying bats, lightning with thunder
- Free spins mode with its own colour grade, HUD (spins left, Fisherman meter, multiplier) and music
- Splash/loading screen, paytable with live amounts for the current bet, payline diagram

**Audio** — 100% synthesized with the Web Audio API (no audio files): reel spin/stop, scatter bells, anticipation riser, collect blips, coin ticks, fanfares, gong, thunder and two generative music loops (base + free spins). Mute toggle.

**UX** — turbo spin, autoplay (10–∞), slam-stop and skip (tap SPIN / Space), balance and settings saved in `localStorage`, demo-credit refill, desktop + mobile portrait layouts.

---

## File structure

```
index.html            entry point
style.css             UI bar, modals, splash, responsive layout
math.js               game math: paytable, reel strips, features (shared with sim.js)
game.js               renderer, animation, audio, UI (CONFIG object at the top)
sim.js                RTP simulator — `node sim.js 2000000`
assets/cut/           game-ready sprites (WILD, FISH, PUM, TAK, BAT, BOB, POT, SCAT) + bg.jpg
assets/build_sprites.py  turns raw renders into masked sprites
```

## Customising

- **Paytable / features:** `math.js` → `PAYS`, `FISH_VALUES`, `SCATTER_AWARD`, `FS_MULTS`, `HOOK_CHANCE`, `BUY_COST`, `MAX_WIN`
- **Reel frequencies:** `BASE_WEIGHTS`, `FS_WEIGHTS`, `SCAT_PER_REEL` — re-run `node sim.js` after every change to check RTP
- **Bets, currency, win tiers, colours of royals and lines:** `CONFIG` at the top of `game.js`
- **Artwork:** replace the PNGs in `assets/cut/` (square, transparent, ~384px). Royals are drawn in code.
- **UI colours:** CSS variables at the top of `style.css`

## Browser support
Chrome/Edge 90+, Firefox 90+, Safari 15+, iOS Safari 15+, Android Chrome. Fonts load from Google Fonts (falls back to system fonts offline).

## Important
This is an entertainment/demo template with play money only. Operating it as a real-money game requires a gambling licence, certified RNG and certified math in your jurisdiction.

## License
See `LICENSE.txt`. In short: one end product, modify freely, no resale of the source as a template.
