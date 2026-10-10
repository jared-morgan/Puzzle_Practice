# Adding a puzzle

Each puzzle is one folder in `src/puzzles/`. The landing page, the `#/<folder>` URL and the
page around the game all come from the folder, so nothing outside it needs editing.

## Start from the template

```sh
npm run new-puzzle -- lights-out "Lights Out"
npm run dev
```

This copies `src/puzzles/_template` (a small working Lights Out game) to
`src/puzzles/lights-out`. Open http://localhost:5173/#/lights-out and edit from there.

## The two files

`meta.ts` describes the puzzle for the landing page:

| Field | |
| --- | --- |
| `title`, `description` | Card text. |
| `help` | Controls, shown under the game. |
| `credits` | Original authors, shown under the game. |
| `order` | Position on the landing page (lower first). |
| `width`, `height` | Canvas size in game pixels. Defaults to 800×600. Size it to the game alone; settings go in the panel. |
| `thumbnail` | Card image: `import thumbnail from './thumbnail.jpg?url'`. |

`index.ts` default-exports a function that receives a `PuzzleContext` and returns `{ frame, dispose? }`.
`frame(events)` runs up to 60 times a second, like a pygame main loop body with `clock.tick(60)`:
handle the events, then redraw everything. Loading (images, sounds, fonts) goes before the
`return`; the page shows "Loading…" until the promise resolves.

## What the core gives you

All in `src/core/`:

- **`screen`** (`screen.ts`): `fill`, `rect`, `blit(image, x, y, { area, alpha, flipX, rotate })`
  and `text(value, x, y, font, colour, alpha)`. Coordinates are game pixels; the canvas scales to the window.
- **`panel`** (`panel.ts`): HTML controls beside the canvas, for everything that isn't the game
  itself (modes, options, Start/Stop, scores). `panel.group('Title')` returns a card with
  `select`, `toggle`, `number`, `text`, `button`, `stats` and `note`, each bound to a getter and a
  setter. The host calls `panel.sync()` after every frame, so controls follow the game's state;
  `disabled` and `hidden` take getters too, e.g. `{ disabled: () => running }`. Keys typed into
  the panel never reach the game.

  The panel has a **Play** tab and a **Settings** tab, and every puzzle lays them out the same way
  so players find things in the same place:
  - Play: `panel.clock(...)` first if any mode can be timed (it returns null for untimed modes,
    and the card says so); then the session card from `panel.group()` with Mode, a `note` saying
    what's set on the Settings tab, and Start / Stop; then the score and anything used during a game.
  - Settings: `panel.settings.group(...)` for everything chosen before a game, with Look and
    Sound last. Don't repeat the time in the score table: the clock shows it, with any best time.
- **`input`** (`input.ts`): events use pygame's names and button numbers (1 left, 2 middle, 3 right,
  4/5 wheel). Keys are lower-case `KeyboardEvent.key` values, with `'space'` for the space bar.
  `input.mouse` is the cursor position. `within(pos, x1, x2, y1, y2)` tests a box.
- **`store`** (`storage.ts`): `get(name, fallback)` and `set(name, value)` save to this browser,
  separately for each puzzle. `addHistory(key, { score, ... })` keeps every finished game under a
  settings key (the desktop games' score lists), and `historyGroup(panel, () => store.history(key), columns)`
  (`history.ts`) shows the recent ones in the panel. The landing page backs everything up to a file.
  When storage is full, old games and replays are trimmed first; settings and the pirate profile stay.
- **Duty reports** (`duty/`): the end-of-session screen is the game's duty report: the player's
  pirate (name and face, set on every Settings tab), a rating word, the score and what was cleared.
  Make a desk with `dutyDesk(panel, store, id, station, scales)` (each scale is a measure with five
  cut-offs the player can change in Settings), call `duty.end({ performance: duty.rate(scale, value),
  score, cleared })` when a session ends, pass the report to `replays.finish(result, report)` and
  `...duty.fields(report)` to `addHistory`, and give `panel.results` `report: duty.last`. Tally icons
  are named in `duty/icons.ts`.
- **`ticks()`**: milliseconds since the puzzle opened, like `pygame.time.get_ticks()`.
- **`Images.load(glob)`** (`assets.ts`): loads every image from an `import.meta.glob` by file name.
- **`SoundBank`** (`audio.ts`): plays sounds by file name, with a volume.
- **`pygameFont(size)`** / **`loadFont`** (`fonts.ts`): pygame's default font at pygame's sizes, or any font file.
- **`PyRandom`** (`pyrandom.ts`): Python's `random` module, draw for draw. Use it when porting a
  Python game so seeds give the same results in both versions.
- **`copyText` / `pasteText`** (`clipboard.ts`) and the Python helpers in `py.ts` (`floordiv`, `pyRound`, ...).

## Porting a pygame game

The three existing puzzles were ported from pygame, and the same approach works for others:

1. Copy `media/` into the folder and load it with `import.meta.glob('./media/*.png', { eager: true, query: '?url', import: 'default' })`.
   Convert `.ogg` sounds to `.mp3` (Safari can't play Ogg).
2. Keep the game rules in a file with no drawing (`logic.ts`) so they can be tested.
   Move the settings the pygame version drew beside the game into the `panel`, and shrink the
   canvas to the game.
3. Use `PyRandom` and reseed wherever the original called `random.seed`, then compare against
   the original: `scripts/parity/` has scripts that run the Python code and save its results
   as a JSON fixture that a `*.test.ts` file checks.

## Before opening a pull request

```sh
npm test
npm run build
```

Pushing to `main` builds and deploys the site with GitHub Actions (`.github/workflows/pages.yml`).
