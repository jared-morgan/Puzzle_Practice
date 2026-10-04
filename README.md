# Puzzle Practice

Practice versions of Puzzle Pirates puzzles that run in the browser:

- **Distilling**: swap pieces so whites go into the jug and blacks into the furnace. Includes Standard, Seeded, Create and Practice modes.
- **Forage Simulator**: rotate 2Ã—2 blocks to drop crates off the bottom. Includes hand-made puzzles, Gauntlet and normal foraging.
- **Treasure Haul**: match coins and use gems to haul treasure.
- **Vampire Carp**: patch coffin holes with pentomino planks.
- **Blacksmithing**: strike squares to forge a sword, with each piece deciding where you can strike next.

Play at https://jared-morgan.github.io/Puzzle_Practice/.

Play and Settings tabs are available for each puzzle. Session controls, timer and score are shown in a consistent place, with a setting to hide the timer and a shared volume control.

Each started as a separate desktop game in Python ([Distilling_Simulator](https://github.com/jared-morgan/Distilling_Simulator),
[Foreage-Sim](https://github.com/jared-morgan/Foreage-Sim), [Vampire_Carp](https://github.com/jared-morgan/Vampire_Carp))
and is rewritten here in TypeScript on a shared core. Seeds give the same games as the desktop versions.
Blacksmithing has no desktop version: it is based on Puzzle Pirates rules, art and sounds.

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
`.github/workflows/pages.yml`. In the repository settings, **Pages â†’ Source** must be **GitHub Actions**.
