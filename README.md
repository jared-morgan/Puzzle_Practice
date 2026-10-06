# Puzzle Practice

Practice versions of Puzzle Pirates puzzles that run in the browser:

- **Distilling**: swap pieces so whites go into the jug and blacks into the furnace, rebuilt from the
  Puzzle Pirates rules, with the Distilling Simulator's practice modes and drills on top.
- **Forage Simulator**: rotate 2×2 blocks to drop crates off the bottom, rebuilt from Puzzle Pirates rules, art and
  sounds, with the Forage Simulator's puzzles, CI and Infinite (cursed isle) modes on top.
- **Vampire Carp**: patch coffin holes with pentomino planks (the Vampire Lair's carpentry, rebuilt from the game).
- **Blacksmithing**: strike squares to forge a sword, each piece deciding where you strike next.
- **Swordfight**: drop pairs, shatter them with breakers and fuse blocks into swords, against training
  opponents or on your own (rebuilt from the game; see [what the client tells us](docs/swordfight-client-findings.md)).

Play at [puzzle-practice.github.io/Puzzle_Practice](https://puzzle-practice.github.io/Puzzle_Practice/).

Source: [puzzle-practice/Puzzle_Practice](https://github.com/puzzle-practice/Puzzle_Practice).

The main score and relevant timer remain visible above Play, Settings and History. Settings
include a shared 0–100 volume slider and an option to hide the timer. Finished sessions show
compact HTML results in the board area; secondary statistics stay off the live score display.

Treasure Haul offers Spawn Chests and four Clear Chests packs: middle placement, simultaneous
vertical/horizontal threes, edge emeralds, and difficult edge chests. Clear Chests counts hauls
over the selected round. Gem rates and the one-second spawn delay are configurable in Settings.

Forage offers Puzzle, Gauntlet, Chaos and Normal, with optional round timers. Chaos keeps the
normal move spacing but lifts the chest count, mix and per-board limits. Settings expose chest
ratios and special-piece toggles. History includes replay play/pause, stop, a scrubber and time
jumps, plus compressed file sizes and the saved total. Replays for every puzzle are stored as
individual gzip blobs in IndexedDB. The complete replay index stays available; only the ten
most recently opened tapes are kept decoded in memory. Recordings include simulation frame
times so playback speed and seeking preserve the order and timing of moves. Watching a replay
does not save scores or personal bests, and leaving a puzzle finishes its active recording.

The home page offers portable JSON backup downloads and optional automatic folder backups.
Folder backups contain a small `puzzle-practice-backup.json` manifest and a `replays/` directory
of individual `.json.gz` files. Keep both together when moving a folder backup. Existing replay
files are copied only when their contents change; settings saves update the manifest. All backup
operations share a queue, with Web Locks coordinating tabs where available. The prelaunch
backup format is version 2; older experimental backup/replay formats are not imported.

Scores are numeric records stored separately from replay payloads. The home page's **Export
scores** downloads a small JSON file for future graphs, merging browser histories and accessible
folder manifests without reading or decompressing replay files. Each row has `puzzle`,
`settingsKey`, `at` (finish time in Unix milliseconds), `score`, extra `stats`, and an optional
`replayFileId` matching the replay index's `id`. Games saved with replay recording off still have
scores. Browser histories retain the latest 1,000 games per settings key; automatic backup
manifests merge older scores without that cap. Keep automatic backups enabled for longer histories.

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
The repository is owned by the `puzzle-practice` organization, and the deployed site is
https://puzzle-practice.github.io/Puzzle_Practice/.
