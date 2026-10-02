// Checks the rules taken from the real client (see engine.ts).
import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { type Cell, Forage, type Rules } from './engine';
import { COLS, parseBoard, ROWS } from './logic';

const ALL: Rules = { specials: { n: true, m: true, p: true, o: true, ants: true }, crates: [0.5, 0.35, 0.15], mode: 'forage' };
const NO_SPECIALS: Rules = { specials: { n: false, m: false, p: false, o: false, ants: false }, crates: null, mode: 'forage' };

/** A board with no runs: rows cycle the colours so nothing lines up three in a row. */
const QUIET = ['uvwxyuv', 'wxyuvwx', 'yuvwxyu', 'vwxyuvw', 'xyuvwxy', 'uvwxyuv', 'wxyuvwx', 'yuvwxyu', 'vwxyuvw', 'xyuvwxy'];

function game(rows: string[], rules = NO_SPECIALS, seed = 1): Forage {
  const g = new Forage(new PyRandom(seed), rules);
  g.load(parseBoard(rows));
  return g;
}

const letters = (g: Forage) =>
  g.grid.map((row) =>
    row
      .map((cell) => (!cell ? '.' : cell.kind === 'colour' ? cell.colour : cell.kind === 'tool' ? cell.tool : cell.kind === 'ant' ? 'q' : 'C'))
      .join(''),
  );

describe('Forage rules from the client', () => {
  it('turns any block of pieces, match or not', () => {
    const g = game(QUIET);
    expect(g.turn(0, 0, true)).toBe('moved');
    // Anticlockwise: the top-right piece moves to the top-left.
    expect(letters(g)[0].slice(0, 2)).toBe('vx');
    expect(letters(g)[1].slice(0, 2)).toBe('uw');
  });

  it("won't turn blocks with a tool, crate or gap, and doesn't count four of a kind", () => {
    expect(game(['n' + QUIET[0].slice(1), ...QUIET.slice(1)]).turn(0, 0, true)).toBe('illegal');
    expect(game(['k' + QUIET[0].slice(1), ...QUIET.slice(1)]).turn(0, 0, true)).toBe('illegal');
    expect(game(['z' + QUIET[0].slice(1), ...QUIET.slice(1)]).turn(0, 0, true)).toBe('illegal');
    expect(game(['uu' + QUIET[0].slice(2), 'uu' + QUIET[1].slice(2), ...QUIET.slice(2)]).turn(0, 0, true)).toBe('same');
  });

  it('scores nothing for matches, only for crates reaching the bottom', () => {
    const rows = [...QUIET];
    rows[0] = 'uwuxyvw';
    rows[1] = 'xyuvwxy';
    const g = game(rows);
    // Turning brings a third u into the top row: a match, but no points.
    g.turn(0, 1, true);
    const result = g.settle();
    expect(result.combo).toBeGreaterThan(0);
    expect(result.points).toBe(0);
  });

  it('scores crates by width squared, doubling for each extra crate in the same step', () => {
    const rows = [...QUIET];
    rows[8] = 'vwghyuv';
    rows[9] = 'zyijkwz';
    const g = game(rows);
    // The empty cells under nothing: gravity moves the colours above them down, and the
    // 2x2 and 1x1 already sit on the bottom row, so both are collected in one step.
    const result = g.settle();
    expect(result.collected).toEqual([1, 1, 0]);
    // Left to right: the jar first (4 x 1), then the box (1 x 2).
    expect(result.points).toBe(4 + 2);
  });

  it('scores Gauntlet crates a flat 1, 2 or 3 by width', () => {
    const rows = [...QUIET];
    rows[8] = 'vwghyuv';
    rows[9] = 'zyijkwz';
    const result = game(rows, { ...NO_SPECIALS, mode: 'gauntlet' }).settle();
    expect(result.collected).toEqual([1, 1, 0]);
    expect(result.points).toBe(2 + 1);
  });

  it('only makes specials in refills after a match', () => {
    const g = new Forage(new PyRandom(5), { ...ALL, crates: null });
    g.fillRandom();
    const specials = () => g.cells().filter(([cell]) => cell.kind === 'tool' || cell.kind === 'ant').length;
    let sawSpecial = false;
    for (let i = 0; i < 400; i++) {
      const before = specials();
      const r = i % (ROWS - 1);
      const c = (i * 3) % (COLS - 1);
      if (g.turn(r, c, i % 2 === 0) !== 'moved') continue;
      const result = g.settle();
      g.steps = [];
      if (result.combo === 0) expect(specials()).toBeLessThanOrEqual(before);
      else if (specials() > before) sawSpecial = true;
    }
    expect(sawSpecial).toBe(true);
  });

  it('keeps to 3 crates and 9 crate cells', () => {
    const g = new Forage(new PyRandom(9), { ...ALL, crates: [0.2, 0.3, 0.5] });
    g.fillRandom();
    for (let i = 0; i < 300; i++) {
      const r = (i * 7) % (ROWS - 1);
      const c = (i * 5) % (COLS - 1);
      const tool = g.cells().find(([cell]) => cell.kind === 'tool');
      if (i % 10 === 0 && tool) g.useTool(tool[1][0], tool[1][1], i % 20 === 0);
      else if (g.turn(r, c, i % 2 === 0) !== 'moved') continue;
      g.settle();
      g.steps = [];
      const crates = g.cells().filter(([cell]) => cell.kind === 'crate') as [Extract<Cell, { kind: 'crate' }>, [number, number]][];
      expect(crates.length).toBeLessThanOrEqual(3);
      expect(crates.reduce((sum, [cell]) => sum + cell.width * cell.height, 0)).toBeLessThanOrEqual(9);
    }
  });

  it('spawns Gauntlet chests like the desktop simulator: never two moves running, never a chest beside a jar', () => {
    const g = new Forage(new PyRandom(3), { ...ALL, crates: [0.3, 0.4, 0.3], mode: 'gauntlet' });
    g.fillRandom();
    const count = () => g.cells().filter(([cell]) => cell.kind === 'crate').length;
    let spawned = 0;
    let lastSpawn = -10;
    let moves = 0;
    for (let i = 0; i < 400; i++) {
      const before = g.cells().filter(([cell]) => cell.kind === 'crate').map(([cell]) => cell.id);
      if (g.turn((i * 7) % (ROWS - 1), (i * 5) % (COLS - 1), i % 2 === 0) !== 'moved') continue;
      moves++;
      g.settle();
      g.steps = [];
      const crates = g.cells().filter(([cell]) => cell.kind === 'crate');
      if (crates.some(([cell]) => !before.includes(cell.id))) {
        expect(moves - lastSpawn).toBeGreaterThanOrEqual(2);
        lastSpawn = moves;
        spawned++;
      }
      expect(count()).toBeLessThanOrEqual(3);
      const widths = crates.map(([cell]) => (cell.kind === 'crate' ? cell.width : 0));
      expect(widths.filter((w) => w === 3).length).toBeLessThanOrEqual(1);
      expect(widths.filter((w) => w === 2).length).toBeLessThanOrEqual(2);
    }
    expect(spawned).toBeGreaterThan(1);
  });

  it('moves ants once per move, eating the piece ahead', () => {
    const rows = [...QUIET];
    rows[5] = 'q' + QUIET[5].slice(1);
    const g = game(rows);
    // Face right.
    const ant = g.grid[5][0]!;
    if (ant.kind !== 'ant') throw new Error('expected ants');
    g.grid[5][0] = { ...ant, dir: 2 };
    g.turn(0, 4, true);
    g.settle();
    const moved = g.grid[5][1];
    expect(moved?.kind).toBe('ant');
    expect(moved?.kind === 'ant' && moved.count).toBe(7);
  });

  it('ants starve at the edge', () => {
    const rows = [...QUIET];
    rows[5] = 'q' + QUIET[5].slice(1);
    const g = game(rows);
    const ant = g.grid[5][0]!;
    if (ant.kind !== 'ant') throw new Error('expected ants');
    g.grid[5][0] = { ...ant, dir: 0 };
    g.turn(0, 4, true);
    g.settle();
    expect(g.cells().some(([cell]) => cell.kind === 'ant')).toBe(false);
  });

  it('earthquakes slide the board to the edge and refill the far side', () => {
    const rows = [...QUIET];
    rows[4] = 'xyuovwy';
    const g = game(rows);
    expect(g.useTool(4, 3, true)).toBe(true);
    // Nothing is left empty after the slide and the settle.
    g.settle();
    expect(letters(g).join('')).not.toContain('.');
  });

  it('starts boards with no runs', () => {
    const g = new Forage(new PyRandom(3), ALL);
    g.fillRandom();
    const rows = letters(g);
    for (let r = 0; r < ROWS; r++) for (let c = 2; c < COLS; c++) expect(rows[r][c] === rows[r][c - 1] && rows[r][c] === rows[r][c - 2]).toBe(false);
    for (let c = 0; c < COLS; c++) for (let r = 2; r < ROWS; r++) expect(rows[r][c] === rows[r - 1][c] && rows[r][c] === rows[r - 2][c]).toBe(false);
  });
});
