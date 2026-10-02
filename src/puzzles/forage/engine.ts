// Forage as the real game plays it, from the Puzzle Pirates client (com.threerings.piracy.puzzle.
// duty.forage and the shared drop-puzzle engine). File references below are to the decompiled
// client. The client leaves crate sizes to the server, so those still use the simulator's
// per-forage-level estimates (CHEST_WEIGHTINGS).
//
// A move is a 2x2 rotation or a tool. The board then settles by repeating the first of these
// that does anything: gravity and refill, collecting crates on the bottom row, clearing matches,
// spawning a crate. Once settled, any ants take one step and the board settles again.
//
// Every change is recorded as an animation step for the view to play.
import type { PyRandom } from '../../core/pyrandom';
import { type Board, COLOURS, COLS, ROWS } from './logic';

/** Ants face left, up, right or down. Turning clockwise adds one. */
export type Dir = 0 | 1 | 2 | 3;
export type Tool = 'm' | 'n' | 'o' | 'p';

export type Cell =
  | { id: number; kind: 'colour'; colour: string }
  | { id: number; kind: 'tool'; tool: Tool }
  | { id: number; kind: 'ant'; count: number; dir: Dir }
  | { id: number; kind: 'crate'; width: 1 | 2 | 3; height: 1 | 2 };

/** grid[row][column]. A crate is one Cell object in every slot it covers. */
export type Grid = (Cell | null)[][];
export type Pos = [number, number];

export interface Sprite {
  cell: Cell;
  /** Top-left [row, column]; may be off the board. */
  from: Pos;
  to: Pos;
  /** Milliseconds after the step starts. */
  delay: number;
  duration: number;
  motion?: 'wobble' | 'arc' | 'bob';
  /** clear: dims for the duration, then pops. out/in: fades out or in. */
  fade?: 'clear' | 'out' | 'in';
}

export interface Step {
  /** Everything that stays put during the step. */
  grid: Grid;
  sprites: Sprite[];
  duration: number;
}

/** Animation timings in milliseconds. */
export const TIMING = {
  /** Rotation, with a 9px vertical sine wobble at 0.03 rad/ms (client/o.java:302-313). */
  turn: 250,
  wobblePx: 9,
  wobbleRate: 0.03,
  /** Falls at a constant 0.525 px/ms: 45px rows (client/w.java:10-11, client/o.java:427-429). */
  fallPerRow: 45 / (0.35 * 1.5),
  /** A cleared piece dims to 20% (ForageBoardView.java:355-359), then pops (about 400ms, not blocking). */
  clear: 20,
  pop: 400,
  /** Tool clears ripple out from the tool (client.A: distance x 50). */
  toolRipple: 50,
  /** Earthquake slide per column, plus up to 20% (client/s.java:13-15). */
  quakePerColumn: 450,
  /** Ants walk a cell in about 257ms (client/y.java:11-13). */
  antStep: 257,
  /** The monkey dances 17 frames at 10fps, leaves at 1ms/px, and its pieces fly 5ms/px (ForageBoardView.java:251-322). */
  monkeyDance: 1700,
  monkeyLeavePerPx: 1,
  monkeyThrowPerPx: 5,
  /** Not in the client notes; short enough not to hold play up. */
  crateCollect: 300,
  crateSpawn: 150,
};

/** Chance (%) that a new piece is special, by the move's combo so far (ForageBoard.java:13). */
const SPECIAL_CHANCE = [0, 1, 4, 7, 9, 10, 11, 12, 13];
/** Special weights: shovel, machete, monkey, earthquake, ants (ForageBoard.java:14). */
const SPECIALS: { kind: Tool | 'ants'; weight: number }[] = [
  { kind: 'n', weight: 2 },
  { kind: 'm', weight: 2 },
  { kind: 'p', weight: 1 },
  { kind: 'o', weight: 1 },
  { kind: 'ants', weight: 1 },
];
/** Crate points: width² × step bonus × bonus for each extra crate in the same step (a/g.java:24-31). */
const STEP_BONUS = [1, 1.5, 2];
const CRATE_BONUS = [1, 2, 4];
const MAX_CRATES = 3;
const MAX_CRATE_AREA = 9;
const ANT_COUNT = 8;

const DIRS: Record<Dir, Pos> = { 0: [0, -1], 1: [-1, 0], 2: [0, 1], 3: [1, 0] };

export interface Rules {
  /** Which specials can appear in refills. */
  specials: { n: boolean; m: boolean; p: boolean; o: boolean; ants: boolean };
  /** Crate spawning, or null for none (puzzles). Weights for widths 1, 2 and 3. */
  crates: readonly [number, number, number] | null;
}

export interface MoveResult {
  points: number;
  /** Crates collected by width: [1x1, 2x2, 3x2]. */
  collected: [number, number, number];
  /** Cascade steps in which crates were collected; 2+ shows "Double!" or "Triple!". */
  crateSteps: number;
  /** Most runs cleared in one step: what the refills' special chance was based on. */
  combo: number;
}

const inBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

export class Forage {
  grid: Grid = Array.from({ length: ROWS }, () => Array<Cell | null>(COLS).fill(null));
  steps: Step[] = [];
  private nextId = 1;
  /** Most separate runs cleared in one step of this move (capped at 8); sets the special chance. */
  private combo = 0;

  constructor(
    private readonly rng: PyRandom,
    public rules: Rules,
  ) {}

  // ---- Making pieces ----

  private colour(): Cell {
    return { id: this.nextId++, kind: 'colour', colour: this.rng.choice(COLOURS) };
  }

  private tool(tool: Tool): Cell {
    return { id: this.nextId++, kind: 'tool', tool };
  }

  private ant(count: number, dir: Dir, id = this.nextId++): Cell {
    return { id, kind: 'ant', count, dir };
  }

  /** A piece for a refill (ForageBoard.java:113-134). */
  private newPiece(): Cell {
    if (this.rng.random() * 100 >= SPECIAL_CHANCE[Math.min(this.combo, 8)]) return this.colour();
    let options = SPECIALS.filter((s) => this.rules.specials[s.kind]);
    // Only one set of ants at a time.
    if (this.cells().some(([cell]) => cell.kind === 'ant')) options = options.filter((s) => s.kind !== 'ants');
    if (!options.length) return this.colour();
    const pick = this.rng.choiceWeighted(
      options.map((s) => s.kind),
      options.map((s) => s.weight),
    );
    return pick === 'ants' ? this.ant(ANT_COUNT, 3) : this.tool(pick);
  }

  /** A random board with no three in a row and no specials (ForageBoard.java:54-70). */
  fillRandom(): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        let cell: Cell;
        do cell = this.colour();
        while (this.makesRun(cell, r, c));
        this.grid[r][c] = cell;
      }
    }
  }

  private makesRun(cell: Cell, r: number, c: number): boolean {
    const same = (rr: number, cc: number) => {
      const other = this.grid[rr]?.[cc];
      return other?.kind === 'colour' && cell.kind === 'colour' && other.colour === cell.colour;
    };
    return (same(r, c - 1) && same(r, c - 2)) || (same(r - 1, c) && same(r - 2, c));
  }

  /** Loads a board written in the simulator's letters (see logic.ts). */
  load(board: Board): void {
    this.grid = Array.from({ length: ROWS }, () => Array<Cell | null>(COLS).fill(null));
    const crates: Record<string, [1 | 2 | 3, 1 | 2]> = { k: [1, 1], g: [2, 2], a: [3, 2] };
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = board[r][c];
        if ((COLOURS as readonly string[]).includes(p)) this.grid[r][c] = { id: this.nextId++, kind: 'colour', colour: p };
        else if (p === 'm' || p === 'n' || p === 'o' || p === 'p') this.grid[r][c] = this.tool(p);
        else if (p === 'q') this.grid[r][c] = this.ant(ANT_COUNT, 3);
        else if (crates[p]) {
          const [width, height] = crates[p];
          const crate: Cell = { id: this.nextId++, kind: 'crate', width, height };
          for (let dr = 0; dr < height; dr++) for (let dc = 0; dc < width; dc++) this.grid[r + dr][c + dc] = crate;
        }
      }
    }
  }

  // ---- Looking at the board ----

  /** Every piece once, with its top-left position. */
  cells(): [Cell, Pos][] {
    const seen = new Set<Cell>();
    const out: [Cell, Pos][] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = this.grid[r][c];
        if (cell && !seen.has(cell)) {
          seen.add(cell);
          out.push([cell, [r, c]]);
        }
      }
    }
    return out;
  }

  crateCount(): number {
    return this.cells().filter(([cell]) => cell.kind === 'crate').length;
  }

  private snapshot(): Grid {
    return this.grid.map((row) => [...row]);
  }

  /**
   * Records a step. `still` is what holds still (by default the board now), minus the
   * landing spots of sprites that move or fade in, so nothing is drawn twice.
   */
  private record(sprites: Sprite[], still = this.snapshot()): void {
    if (!sprites.length) return;
    for (const s of sprites) {
      if (s.fade === 'clear' || s.fade === 'out') continue;
      const [w, h] = s.cell.kind === 'crate' ? [s.cell.width, s.cell.height] : [1, 1];
      for (let dr = 0; dr < h; dr++) {
        for (let dc = 0; dc < w; dc++) {
          const [r, c] = [s.to[0] + dr, s.to[1] + dc];
          if (inBoard(r, c) && still[r][c] === s.cell) still[r][c] = null;
        }
      }
    }
    this.steps.push({ grid: still, sprites, duration: Math.max(...sprites.map((s) => s.delay + s.duration)) });
  }

  // ---- Moves ----

  /**
   * Rotates the 2x2 whose top-left is (r, c), anticlockwise for `ccw`. Any cell that is empty,
   * a tool or a crate makes it illegal (ForageBoard.java:222-238); it doesn't need to make a
   * match. Four of the same colour turn but don't count as a move (client/o.java:222-225).
   */
  turn(r: number, c: number, ccw: boolean): 'illegal' | 'same' | 'moved' {
    r = Math.min(r, ROWS - 2);
    c = Math.min(c, COLS - 2);
    const corners: Pos[] = [
      [r, c],
      [r, c + 1],
      [r + 1, c + 1],
      [r + 1, c],
    ];
    const cells = corners.map(([rr, cc]) => this.grid[rr][cc]);
    if (cells.some((cell) => !cell || cell.kind === 'tool' || cell.kind === 'crate')) return 'illegal';
    const shift = ccw ? 3 : 1;
    const sprites: Sprite[] = [];
    cells.forEach((cell, i) => {
      let moved = cell!;
      // Ants turn with the block (ForageBoard.java:240-253).
      if (moved.kind === 'ant') moved = this.ant(moved.count, (((moved.dir + (ccw ? 3 : 1)) % 4) as Dir), moved.id);
      const to = corners[(i + shift) % 4];
      this.grid[to[0]][to[1]] = moved;
      sprites.push({ cell: moved, from: corners[i], to, delay: 0, duration: TIMING.turn, motion: 'wobble' });
    });
    this.record(sprites);
    const first = cells[0]!;
    const same = cells.every((cell) => cell!.kind === 'colour' && first.kind === 'colour' && cell!.colour === first.colour);
    return same ? 'same' : 'moved';
  }

  /** Uses the tool at (r, c); left click (ccw) goes left. Returns false if there isn't one. */
  useTool(r: number, c: number, ccw: boolean): boolean {
    const cell = this.grid[r]?.[c];
    if (cell?.kind !== 'tool') return false;
    const targets: Pos[] = [];
    if (cell.tool === 'n') {
      // Shovel: its cell and everything below (client/o.java:316-329).
      for (let rr = r; rr < ROWS; rr++) targets.push([rr, c]);
    } else if (cell.tool === 'm') {
      // Machete: its row, to the left or right (client/o.java:331-351).
      for (let cc = 0; cc < COLS; cc++) if (ccw ? cc <= c : cc >= c) targets.push([r, cc]);
    } else if (cell.tool === 'o') {
      // Earthquake: itself and the whole edge column (client/o.java:395-413).
      targets.push([r, c]);
      const edge = ccw ? 0 : COLS - 1;
      for (let rr = 0; rr < ROWS; rr++) if (rr !== r || edge !== c) targets.push([rr, edge]);
    } else {
      this.monkey(r, c);
      return true;
    }
    this.clearCells(targets, [r, c], true);
    if (cell.tool === 'o') this.slide(ccw ? 'left' : 'right');
    return true;
  }

  /** Empties cells (crates are skipped), dimming each after a ripple delay from `origin`. */
  private clearCells(targets: Pos[], origin: Pos, ripple: boolean): void {
    const still = this.snapshot();
    const sprites: Sprite[] = [];
    for (const [r, c] of targets) {
      const cell = this.grid[r][c];
      if (!cell || cell.kind === 'crate') continue;
      this.grid[r][c] = null;
      still[r][c] = null;
      const distance = Math.abs(r - origin[0]) + Math.abs(c - origin[1]);
      sprites.push({ cell, from: [r, c], to: [r, c], delay: ripple ? distance * TIMING.toolRipple : 0, duration: TIMING.clear, fade: 'clear' });
    }
    this.record(sprites, still);
  }

  /** Monkey: dances, leaves, and throws new colours into the 5x5 around it (client/o.java:371-393). */
  private monkey(r: number, c: number): void {
    const monkey = this.grid[r][c]!;
    const dance = this.snapshot();
    dance[r][c] = null;
    this.steps.push({
      grid: dance,
      sprites: [{ cell: monkey, from: [r, c], to: [r, c], delay: 0, duration: TIMING.monkeyDance, motion: 'bob' }],
      duration: TIMING.monkeyDance,
    });
    const still = this.snapshot();
    const leave = (r + 2) * 45 * TIMING.monkeyLeavePerPx;
    const sprites: Sprite[] = [{ cell: monkey, from: [r, c], to: [-2, c], delay: 0, duration: leave }];
    still[r][c] = null;
    for (let rr = r - 2; rr <= r + 2; rr++) {
      for (let cc = c - 2; cc <= c + 2; cc++) {
        const old = this.grid[rr]?.[cc];
        if (!inBoard(rr, cc) || old?.kind === 'crate') continue;
        if (old && old !== monkey) sprites.push({ cell: old, from: [rr, cc], to: [rr, cc], delay: 0, duration: TIMING.clear, fade: 'clear' });
        still[rr][cc] = null;
        const fresh = this.colour();
        this.grid[rr][cc] = fresh;
        const px = 45 * (Math.abs(rr - r) + Math.abs(cc - c));
        sprites.push({ cell: fresh, from: [r, c], to: [rr, cc], delay: leave, duration: Math.max(1, px) * TIMING.monkeyThrowPerPx, motion: 'arc' });
      }
    }
    this.record(sprites, still);
  }

  // ---- Settling ----

  /**
   * Gravity (down) or an earthquake's slide (left/right): everything moves toward the edge
   * until it lands, crates as rigid blocks, and new pieces come in from the far side
   * (drop/a/f.java:30-81). Returns whether anything moved or arrived.
   */
  private slide(direction: 'down' | 'left' | 'right'): boolean {
    const [dr, dc]: Pos = direction === 'down' ? [1, 0] : direction === 'left' ? [0, -1] : [0, 1];
    const start = new Map<Cell, Pos>(this.cells());
    const at = new Map<Cell, Pos>(start);
    let moved = true;
    while (moved) {
      moved = false;
      // Nearest the edge first, so a whole column can move on the same pass.
      const units = [...at.entries()].sort(([, a], [, b]) => (b[0] * dr + b[1] * dc) - (a[0] * dr + a[1] * dc));
      for (const [cell, [r, c]] of units) {
        const [w, h] = cell.kind === 'crate' ? [cell.width, cell.height] : [1, 1];
        let free = true;
        for (let y = 0; y < h && free; y++) {
          for (let x = 0; x < w && free; x++) {
            const [tr, tc] = [r + y + dr, c + x + dc];
            const there = inBoard(tr, tc) ? this.grid[tr][tc] : undefined;
            if (there === undefined || (there !== null && there !== cell)) free = false;
          }
        }
        if (!free) continue;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.grid[r + y][c + x] = null;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) this.grid[r + y + dr][c + x + dc] = cell;
        at.set(cell, [r + dr, c + dc]);
        moved = true;
      }
    }
    const perCell = direction === 'down' ? TIMING.fallPerRow : TIMING.quakePerColumn * (1 + Math.random() * 0.2);
    const sprites: Sprite[] = [];
    for (const [cell, to] of at) {
      const from = start.get(cell)!;
      const distance = Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]);
      if (distance) sprites.push({ cell, from, to, delay: 0, duration: distance * perCell });
    }
    // Refill the empty cells at the far end of each line, as if they'd been waiting just off the board.
    const lines = direction === 'down' ? COLS : ROWS;
    const length = direction === 'down' ? ROWS : COLS;
    const pos = (line: number, i: number): Pos =>
      direction === 'down' ? [i, line] : direction === 'left' ? [line, COLS - 1 - i] : [line, i];
    for (let line = 0; line < lines; line++) {
      let empty = 0;
      while (empty < length && this.grid[pos(line, empty)[0]][pos(line, empty)[1]] === null) empty++;
      for (let i = 0; i < empty; i++) {
        const [r, c] = pos(line, i);
        const cell = this.newPiece();
        this.grid[r][c] = cell;
        sprites.push({ cell, from: [r - dr * empty, c - dc * empty], to: [r, c], delay: 0, duration: empty * perCell });
      }
    }
    this.record(sprites);
    return sprites.length > 0;
  }

  /** Crates whose bottom row is on the bottom of the board are collected (client/o.java:529-574). */
  private collectCrates(result: MoveResult): boolean {
    const done = this.cells().filter(([cell, [r]]) => cell.kind === 'crate' && r + cell.height - 1 === ROWS - 1);
    if (!done.length) return false;
    const sprites: Sprite[] = [];
    done
      .sort(([, a], [, b]) => a[1] - b[1])
      .forEach(([cell, [r, c]], k) => {
        if (cell.kind !== 'crate') return;
        result.points += Math.trunc(cell.width ** 2 * STEP_BONUS[Math.min(result.crateSteps, 2)] * CRATE_BONUS[Math.min(k, 2)]);
        result.collected[cell.width - 1]++;
        for (let y = 0; y < cell.height; y++) for (let x = 0; x < cell.width; x++) this.grid[r + y][c + x] = null;
        sprites.push({ cell, from: [r, c], to: [r, c], delay: 0, duration: TIMING.crateCollect, fade: 'out' });
      });
    result.crateSteps++;
    this.record(sprites);
    return true;
  }

  /** Runs of three or more of a colour, across or down, all cleared together (drop/a/b.java:17-60). */
  private clearMatches(): boolean {
    const marked = new Set<string>();
    let runs = 0;
    const scan = (lines: number, length: number, at: (line: number, i: number) => Pos) => {
      for (let line = 0; line < lines; line++) {
        let i = 0;
        while (i < length) {
          const [r, c] = at(line, i);
          const cell = this.grid[r][c];
          let j = i + 1;
          if (cell?.kind === 'colour') {
            for (; j < length; j++) {
              const other = this.grid[at(line, j)[0]][at(line, j)[1]];
              if (other?.kind !== 'colour' || other.colour !== cell.colour) break;
            }
            if (j - i >= 3) {
              runs++;
              for (let k = i; k < j; k++) marked.add(at(line, k).join(','));
            }
          }
          i = j;
        }
      }
    };
    scan(ROWS, COLS, (r, c) => [r, c]);
    scan(COLS, ROWS, (c, r) => [r, c]);
    if (!runs) return false;
    this.combo = Math.max(this.combo, Math.min(runs, 8));
    this.clearCells(
      [...marked].map((key) => key.split(',').map(Number) as Pos),
      [0, 0],
      false,
    );
    return true;
  }

  /**
   * Maybe drops a crate in at the top, overwriting what's there (ForageBoard.java:170-203).
   * At most 3 crates and 9 crate cells; the emptier the board, the likelier.
   */
  private trySpawnCrate(): boolean {
    const weights = this.rules.crates;
    if (!weights) return false;
    const crates = this.cells().filter(([cell]) => cell.kind === 'crate');
    const area = crates.reduce((sum, [cell]) => sum + (cell.kind === 'crate' ? cell.width * cell.height : 0), 0);
    if (crates.length >= MAX_CRATES || area >= MAX_CRATE_AREA) return false;
    const chance = Math.min((0.7 * (MAX_CRATES - crates.length)) / 3 + (0.7 * (MAX_CRATE_AREA - area)) / 9, 1);
    if (this.rng.random() >= chance) return false;
    const sizes = ([1, 2, 3] as const).filter((w, i) => weights[i] > 0 && area + w * (w === 1 ? 1 : 2) <= MAX_CRATE_AREA);
    if (!sizes.length) return false;
    const width = this.rng.choiceWeighted(
      sizes,
      sizes.map((w) => weights[w - 1]),
    );
    const height = width === 1 ? 1 : 2;
    const columns: number[] = [];
    for (let c = 0; c + width <= COLS; c++) {
      let ok = true;
      for (let r = 0; r < height; r++) for (let x = 0; x < width; x++) if (this.grid[r][c + x] && this.grid[r][c + x]!.kind !== 'colour') ok = false;
      if (ok) columns.push(c);
    }
    if (!columns.length) return false;
    const c = this.rng.choice(columns);
    const before = this.snapshot();
    const crate: Cell = { id: this.nextId++, kind: 'crate', width, height };
    for (let r = 0; r < height; r++) for (let x = 0; x < width; x++) this.grid[r][c + x] = crate;
    this.record([{ cell: crate, from: [0, c], to: [0, c], delay: 0, duration: TIMING.crateSpawn, fade: 'in' }], before);
    return true;
  }

  /**
   * Each set of ants steps once, eating the piece ahead; anything else ahead (the edge, a
   * crate, a gap, other ants) and they starve (ForageBoard.java:255-301).
   */
  private stepAnts(): boolean {
    const ants = this.cells().filter(([cell]) => cell.kind === 'ant');
    if (!ants.length) return false;
    const still = this.snapshot();
    const sprites: Sprite[] = [];
    for (const [ant, [r, c]] of ants) {
      if (ant.kind !== 'ant') continue;
      const [dr, dc] = DIRS[ant.dir];
      const [tr, tc] = [r + dr, c + dc];
      const food = inBoard(tr, tc) ? this.grid[tr][tc] : null;
      this.grid[r][c] = null;
      still[r][c] = null;
      if (food && (food.kind === 'colour' || food.kind === 'tool')) {
        sprites.push({ cell: food, from: [tr, tc], to: [tr, tc], delay: TIMING.antStep * 0.8, duration: TIMING.clear, fade: 'clear' });
        still[tr][tc] = null;
        const fed = ant.count > 1 ? this.ant(ant.count - 1, ant.dir, ant.id) : null;
        this.grid[tr][tc] = fed;
        sprites.push({ cell: fed ?? ant, from: [r, c], to: [tr, tc], delay: 0, duration: TIMING.antStep, ...(!fed && { fade: 'out' as const }) });
      } else {
        sprites.push({ cell: ant, from: [r, c], to: [r, c], delay: 0, duration: TIMING.antStep, fade: 'out' });
      }
    }
    this.record(sprites, still);
    return true;
  }

  /** Settles the board after a move, then lets ants step and settles again (client/o.java:467-513). */
  settle(): MoveResult {
    const result: MoveResult = { points: 0, collected: [0, 0, 0], crateSteps: 0, combo: 0 };
    let antsMoved = false;
    for (;;) {
      if (this.slide('down') || this.collectCrates(result) || this.clearMatches() || this.trySpawnCrate()) continue;
      if (!antsMoved) {
        antsMoved = true;
        if (this.stepAnts()) continue;
      }
      break;
    }
    result.combo = this.combo;
    this.combo = 0;
    return result;
  }
}
