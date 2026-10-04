# Puzzle Practice

Practice versions of Puzzle Pirates puzzles that run in the browser:

- **Distilling**: swap pieces so whites go into the jug and blacks into the furnace, rebuilt from the
  Puzzle Pirates rules, with the Distilling Simulator's practice modes and drills on top.
- **Forage Simulator**: rotate 2×2 blocks to drop crates off the bottom, rebuilt from Puzzle Pirates rules, art and
  sounds, with the Forage Simulator's puzzles, CI and Infinite (cursed isle) modes on top.
- **Vampire Carp**: patch coffin holes with pentomino planks (the Vampire Lair's carpentry, rebuilt from the game).
- **Blacksmithing**: strike squares to forge a sword, each piece deciding where you strike next.

Play at https://jared-morgan.github.io/Puzzle_Practice/.

The main score and relevant timer remain visible above Play, Settings and History. Settings
include a shared 0–100 volume slider and an option to hide the timer. Finished sessions show
compact HTML results in the board area; secondary statistics stay off the live score display.

Treasure Haul offers Spawn Chests and four Clear Chests packs: middle placement, simultaneous
vertical/horizontal threes, edge emeralds, and difficult edge chests. Clear Chests counts hauls
over the selected round. Gem rates and the one-second spawn delay are configurable in Settings.

Forage offers Puzzle, Gauntlet, Chaos and Normal, with optional round timers. Chaos keeps the
normal move spacing but lifts the chest count, mix and per-board limits. Settings expose chest
ratios and special-piece toggles. History includes replay play/pause, stop, a scrubber and time
jumps, plus exact downloaded file sizes and the saved total. The latest ten replays are still
kept in the browser; downloading files remains explicit. New recordings use version 2;
version 1 recordings retain their original chest-entry and board-transition timings.

Distilling Create mode has a numbered piece palette: hold 1–5 or select a piece and left-click
to paint. Click the selected palette piece again to deselect it.

Each started as a separate desktop game in Python ([Distilling_Simulator](https://github.com/jared-morgan/Distilling_Simulator),
[Foreage-Sim](https://github.com/jared-morgan/Foreage-Sim), [Vampire_Carp](https://github.com/jared-morgan/Vampire_Carp))
and is rewritten here in TypeScript on a shared core. Seeds give the same games as the desktop versions.
Blacksmithing has no desktop version: it is built from Puzzle Pirates rules, art and sounds.
Distilling follows the original game's rules.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm test
npm run build    # static site in dist/
```

## Layout

```
src/
  main.ts            landing page and #/<puzzle> routing
  core/              shared by every puzzle: canvas, input, sound, saved data, Python-compatible random
  puzzles/<id>/      one folder per puzzle: meta.ts (card) and index.ts (the game)
  puzzles/_template/ starting point for new puzzles
scripts/
  new-puzzle.mjs     npm run new-puzzle -- <id> "<Title>"
  parity/            run the original Python code to make test fixtures
```

To add a puzzle, see [docs/adding-a-puzzle.md](docs/adding-a-puzzle.md).

## Deploying

Every push to `main` is built, tested and deployed to GitHub Pages by
`.github/workflows/pages.yml`. In the repository settings, **Pages → Source** must be **GitHub Actions**.
