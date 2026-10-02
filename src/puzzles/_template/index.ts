// A small, complete puzzle showing the pieces of the core a new puzzle usually needs:
// drawing with `screen`, reacting to clicks and keys, seeded randomness and saved records.
// Folders starting with "_" are hidden from the landing page, so this one never shows up.
import { within } from '../../core/input';
import type { PuzzleFactory } from '../../core/puzzle';
import { PyRandom } from '../../core/pyrandom';
import { pygameFont } from '../../core/fonts';

const SIZE = 5;
const CELL = 90;
const LEFT = 175;
const TOP = 70;
const font = pygameFont(32);

export default (async ({ screen, store }) => {
  // Images would load here, e.g. `await Images.load(import.meta.glob(...))`; see vampire-carp/index.ts.
  const rng = new PyRandom();
  let lights: boolean[][] = [];
  let moves = 0;
  let best = store.get<number | null>('best', null);

  function toggle(row: number, col: number): void {
    for (const [r, c] of [[row, col], [row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
      if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) lights[r][c] = !lights[r][c];
    }
  }

  /** Deals a board by pressing random lights, so it can always be solved. */
  function deal(): void {
    lights = Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
    for (let i = 0; i < 12; i++) toggle(rng.randintN(0, SIZE - 1), rng.randintN(0, SIZE - 1));
    moves = 0;
  }

  const solved = () => lights.every((row) => row.every((on) => !on));
  deal();

  return {
    frame(events) {
      for (const event of events) {
        if (event.type === 'keydown' && event.key === 'r') deal();
        if (event.type !== 'mousedown' || event.button !== 1 || solved()) continue;
        if (!within(event.pos, LEFT, LEFT + SIZE * CELL - 1, TOP, TOP + SIZE * CELL - 1)) continue;
        toggle(Math.floor((event.pos[1] - TOP) / CELL), Math.floor((event.pos[0] - LEFT) / CELL));
        moves++;
        if (solved() && (best === null || moves < best)) {
          best = moves;
          store.set('best', best);
        }
      }

      screen.fill('#1d2230');
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          screen.rect(LEFT + c * CELL + 4, TOP + r * CELL + 4, CELL - 8, CELL - 8, lights[r][c] ? '#f5c542' : '#39415a');
        }
      }
      screen.text(`Moves ${moves}`, LEFT, 530, font, '#ffffff');
      screen.text(`Best ${best ?? '-'}`, LEFT + 300, 530, font, '#ffffff');
      if (solved()) screen.text('Solved! Press R for another.', LEFT, 20, font, '#7ee08a');
    },
  };
}) satisfies PuzzleFactory;
