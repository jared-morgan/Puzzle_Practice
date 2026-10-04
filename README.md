# Puzzle Practice

Practice versions of Puzzle Pirates puzzles that run in the browser:

- **Distilling**: swap pieces so whites go into the jug and blacks into the furnace, rebuilt from the
  game client's own rules, with the Distilling Simulator's practice modes and drills on top.
- **Forage Simulator**: rotate 2×2 blocks to drop boxes, jars and chests.
- **Vampire Carp**: patch coffin holes with pentomino planks.
- **Blacksmithing**: strike squares to forge a sword, each piece deciding where you strike next.

Play at https://jared-morgan.github.io/Puzzle_Practice/.

Each started as a separate desktop game in Python ([Distilling_Simulator](https://github.com/jared-morgan/Distilling_Simulator),
[Foreage-Sim](https://github.com/jared-morgan/Foreage-Sim), [Vampire_Carp](https://github.com/jared-morgan/Vampire_Carp))
and is rewritten here in TypeScript on a shared core. Seeds give the same games as the desktop versions.


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
