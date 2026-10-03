// Treasure Haul's rules, from the Puzzle Pirates client (duty/haul and the shared drop-puzzle
// engine puzzle/drop, build 20260909165753), with no drawing so they can be tested.
//
// The board is 8x8 with y = 0 at the bottom (DropBoard, HaulConfig). Pieces "drop" towards the
// top of the screen: everything floats up, and new pieces come in from below. You swap a piece
// with the one under it; runs of three or more coins clear, a ruby clears its row and column and
// an emerald its diagonals, and chests that float to the top row are hauled into the net.
//
// The client works out the points for each move and sends them to the server (haul/a/e, the
// scorer); the server turns them into the duty performance, which isn't in the client.

export const W = 8;
export const H = 8;
export const EMPTY = -1;
/** Coins are 0-3 (HaulBoard.getColorCount() is 4); the gems are 4 and 5. */
export const COLOURS = 4;
export const RUBY = 4;
export const EMERALD = 5;
/** Chest sizes (haul/data/d.k): only 2x2. */
export const CHEST_SIZES: readonly { width: number; height: number }[] = [{ width: 2, height: 2 }];

/** Chest pieces pack their part, value and size into one int (haul/a/d): 100 | part<<16 | value<<18 | size<<20. */
export const isChest = (p: number): boolean => (p & 0xffff) === 100;
/** The top-left square of a chest, which carries its picture. */
export const isChestOrigin = (p: number): boolean => isChest(p) && (p & 0x30000) >> 16 === 0;
/** 0 top-left, 1 the rest of the top row, 2 the bottom row. (An empty square reads as 3.) */
export const chestPart = (p: number): number => (p & 0x30000) >> 16;
export const chestValue = (p: number): number => (p & 0xc0000) >> 18;
export const chestSize = (p: number): number => (p & 0x3c0000) >> 20;
export const chestPiece = (part: number, value: number, size: number): number => 100 | (part << 16) | (value << 18) | (size << 20);

export interface Run {
  /** 0 across (left to right), 1 down (top to bottom). */
  dir: 0 | 1;
  x: number;
  y: number;
  length: number;
}

export interface PieceMove {
  piece: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

export interface Cleared {
  x: number;
  y: number;
  piece: number;
  /** Gem blasts reach squares one after another, 50ms per square of distance (haul/client/k). */
  delay: number;
}

export type Step =
  | { kind: 'rise'; moves: PieceMove[] }
  | { kind: 'haul'; chests: { x: number; piece: number }[]; cleared: Cleared[] }
  | { kind: 'match'; runs: Run[]; cleared: Cleared[]; points: number; chain: number; message: Message | null };

export type SwapResult =
  | { kind: 'illegal' }
  /** Two identical pieces: they swap places on screen, but it isn't a move. */
  | { kind: 'same'; upper: number; lower: number }
  | { kind: 'swap'; upper: number; lower: number }
  /** A gem goes off where it stands instead of swapping. */
  | { kind: 'gem'; gem: number; x: number; y: number; cleared: Cleared[] };

export interface Message {
  text: string;
  /** 'combo' messages are white, 'chain' ones yellow and centred on the board (DropBoardView.ai, aj). */
  kind: 'combo' | 'chain';
  /** A single long run's message sits over the run; the others go by the cursor (combo) or mid-board (chain). */
  run: Run | null;
  sound: 'shiny' | 'big_combo' | null;
}

/** The client's messages (i18n/puzzle/haul.properties). */
export const MESSAGES: Record<string, string> = {
  'm.combo4': 'Good',
  'm.combo5': 'Shiny!',
  'm.combo3x3': 'Arrr! 3x3!',
  'm.combo3x4': 'Arrr! 3x4!',
  'm.combo3x5': 'Yarrr! 3x5!',
  'm.combo4x4': 'Har! 4x4!',
  'm.combo4x5': 'Yarrr! 4x5!',
  'm.combo5x5': 'Yarrr! 5x5!',
  'm.bigcombo3': 'Bingo!',
  'm.bigcombo4': 'Donkey!',
  'm.bigcombo5': 'Vegas!',
  'm.chain': 'Ching!',
  'm.bigchain': 'Cha-Ching!',
};

/** Points for a run of 3, 4 and 5+ (haul/a/e.e), and the multiplier by how many runs clear at once (e.f). */
const RUN_POINTS = [3, 5, 8];
const RUNS_MULTIPLIER = [1.0, 1.0, 1.25, 1.75, 2.5];

/**
 * The scorer (haul/a/e and its client subclass k). Each square cleared adds a point (five for a
 * chest square), but a step of matches is scored from its runs instead; each step closes with
 * finish(), which adds the step to the move's total and counts it towards the chain.
 */
export class Scorer {
  /** Steps scored so far this move (e.c): 1 is the swap's own clear, 2+ are chain reactions. */
  chain = 0;
  /** The move's points so far (e.d). */
  total = 0;
  /** The step in progress (e.g). */
  pending = 0;

  reset(): void {
    this.chain = 0;
    this.total = 0;
    this.pending = 0;
  }

  clear(piece: number): void {
    if (piece === EMPTY) return;
    this.pending++;
    if (isChest(piece)) this.pending += 4;
  }

  finish(): number {
    const points = this.pending;
    this.total += points;
    this.chain++;
    this.pending = 0;
    return points;
  }

  scoreRuns(runs: readonly Run[]): number {
    let points = 0;
    for (const run of runs) points += RUN_POINTS[Math.min(run.length - 3, RUN_POINTS.length - 1)];
    this.pending = Math.round(points * RUNS_MULTIPLIER[Math.min(runs.length, 4)]);
    return this.finish();
  }
}

/** Which message a step of matches shows (haul/client/i.i()). Messages only exist for runs up to 5 long, so longer ones read as 5. */
export function stepMessage(runs: readonly Run[], chain: number): Message | null {
  const key = (k: string) => MESSAGES[k] ?? k;
  const len = (r: Run) => Math.min(r.length, 5);
  if (chain === 1) {
    if (runs.length === 1) {
      const r = runs[0];
      if (r.length <= 3) return null;
      return { text: key(`m.combo${len(r)}`), kind: 'combo', run: r, sound: r.length === 4 ? null : 'shiny' };
    }
    if (runs.length === 2) {
      const a = len(runs[0]);
      const b = len(runs[1]);
      return { text: key(`m.combo${Math.min(a, b)}x${Math.max(a, b)}`), kind: 'combo', run: null, sound: null };
    }
    if (runs.length === 3) return { text: key('m.bigcombo3'), kind: 'combo', run: null, sound: null };
    const longest = Math.max(...runs.slice(0, 4).map((r) => r.length));
    return { text: key(longest > 4 ? 'm.bigcombo5' : 'm.bigcombo4'), kind: 'combo', run: null, sound: null };
  }
  if (chain === 2 || (chain - 2) % 3 === 0) {
    return { text: key(chain === 2 ? 'm.chain' : 'm.bigchain'), kind: 'chain', run: null, sound: chain === 2 ? null : 'big_combo' };
  }
  return null;
}

export interface Chest {
  value: number;
  size: number;
}

export class HaulBoard {
  readonly cells: number[] = new Array<number>(W * H).fill(EMPTY);
  readonly scorer = new Scorer();
  /** Chests waiting to come in at the bottom, one per refill (HaulBoard.haulChestList). */
  readonly chestList: Chest[] = [];
  /** Chests the server has announced; each move lets one through to chestList (HaulController.m, b()). */
  readonly pending: Chest[] = [];
  /** Set by a move, so the move's points are paid out once the board settles (haul/client/i.c). */
  moved = false;

  constructor(private readonly random: () => number) {}

  nextInt(n: number): number {
    return Math.floor(this.random() * n);
  }

  get(x: number, y: number): number {
    return this.cells[y * W + x];
  }

  set(x: number, y: number, p: number): void {
    this.cells[y * W + x] = p;
  }

  /** A fresh board of coins with no runs of three (HaulBoard.populate). */
  populate(): void {
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) {
        let p: number;
        do p = this.nextInt(COLOURS);
        while ((y > 1 && this.get(x, y - 1) === p && this.get(x, y - 2) === p) || (x > 1 && this.get(x - 1, y) === p && this.get(x - 2, y) === p));
        this.set(x, y, p);
      }
    }
  }

  /** A ruby or an emerald each come up 2 times in 308; otherwise one of the four coins (HaulBoard.getNextPiece). */
  nextPiece(): number {
    let r = this.nextInt(304 + COLOURS - (300 % COLOURS));
    if (r < 2) return RUBY;
    r -= 2;
    if (r < 2) return EMERALD;
    r -= 2;
    return r % COLOURS;
  }

  /** Empty squares above row y in column x before the next piece (DropBoard.getDropDistance). */
  riseDistance(x: number, y: number): number {
    let d = 0;
    for (let yy = y + 1; yy < H; yy++) {
      if (this.get(x, yy) !== EMPTY) return d;
      d++;
    }
    return d;
  }

  /** Swaps (x, y) with (x, y - 1): gems always, coins as long as neither square is empty or a chest (HaulBoard.isLegalSwap). */
  isLegalSwap(x: number, y: number): boolean {
    const a = this.get(x, y);
    const b = this.get(x, y - 1);
    return a === RUBY || a === EMERALD || b === RUBY || b === EMERALD || (a !== EMPTY && b !== EMPTY && !isChest(a) && !isChest(b));
  }

  /** The cursor's action on the pair (x, y) and (x, y - 1) (haul/client/i.a(int, int)). */
  swap(x: number, y: number): SwapResult {
    if (y < 1 || y >= H || x < 0 || x >= W || !this.isLegalSwap(x, y)) return { kind: 'illegal' };
    const upper = this.get(x, y);
    const lower = this.get(x, y - 1);
    if (upper === lower) {
      this.set(x, y, lower);
      this.set(x, y - 1, upper);
      return { kind: 'same', upper, lower };
    }
    const next = this.pending.shift();
    if (next) this.chestList.push(next);
    this.moved = true;
    if (upper === RUBY || lower === RUBY || upper === EMERALD || lower === EMERALD) {
      const ruby = upper === RUBY || lower === RUBY;
      const gem = ruby ? RUBY : EMERALD;
      const gy = upper === gem ? y : y - 1;
      const reach = new Map<number, number>();
      if (ruby) this.cross(x, gy, 0, reach);
      else this.diagonals(x, gy, 0, reach);
      const cleared: Cleared[] = [];
      for (const [key, dist] of reach) {
        const cx = key % W;
        const cy = Math.floor(key / W);
        const piece = this.get(cx, cy);
        if (piece !== EMPTY) cleared.push({ x: cx, y: cy, piece, delay: dist * 50 });
        this.set(cx, cy, EMPTY);
        this.scorer.clear(piece);
      }
      this.scorer.finish();
      return { kind: 'gem', gem, x, y: gy, cleared };
    }
    this.set(x, y, lower);
    this.set(x, y - 1, upper);
    return { kind: 'swap', upper, lower };
  }

  /** A ruby: its whole row and column, setting off any gems in the way (haul/client/i.a(int, int, int, HashMap)). */
  private cross(x: number, y: number, dist: number, reach: Map<number, number>): void {
    const key = y * W + x;
    const was = reach.get(key);
    if (was !== undefined && was <= dist) return;
    reach.set(key, dist);
    for (let yy = 0; yy < H; yy++) if (yy !== y) this.blast(x, yy, dist + Math.abs(y - yy), reach);
    for (let xx = 0; xx < W; xx++) if (xx !== x) this.blast(xx, y, dist + Math.abs(x - xx), reach);
  }

  /** An emerald: the four diagonals from it (haul/client/i.b(int, int, int, HashMap)). */
  private diagonals(x: number, y: number, dist: number, reach: Map<number, number>): void {
    const key = y * W + x;
    const was = reach.get(key);
    if (was !== undefined && was <= dist) return;
    reach.set(key, dist);
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
      for (let xx = x + dx, yy = y + dy; xx >= 0 && xx < W && yy >= 0 && yy < H; xx += dx, yy += dy) {
        this.blast(xx, yy, dist + Math.abs(x - xx), reach);
      }
    }
  }

  /** One square in a blast's path: gems go off in turn; chests are passed over (haul/client/i.a(DropBoard, ...)). */
  private blast(x: number, y: number, dist: number, reach: Map<number, number>): void {
    const p = this.get(x, y);
    if (p === RUBY) this.cross(x, y, dist, reach);
    else if (p === EMERALD) this.diagonals(x, y, dist, reach);
    else if (!isChest(p)) {
      const key = y * W + x;
      const was = reach.get(key);
      if (was === undefined || was > dist) reach.set(key, dist);
    }
  }

  /**
   * One step of the board settling (haul/client/i.o()): pieces float up and new ones come in
   * below; failing that, chests in the top row are hauled; failing that, runs clear. Null once
   * the board is still.
   */
  step(): Step | null {
    const moves = this.rise();
    if (moves.length) return { kind: 'rise', moves };
    const haul = this.haul();
    if (haul) return haul;
    return this.match();
  }

  /** Once the board is still: the move's points, which the client sends to the server (haul/client/i.p()). */
  settle(): number {
    if (!this.moved) return 0;
    this.moved = false;
    const points = this.scorer.total;
    if (points > 0) this.scorer.reset();
    return points;
  }

  /** Floats every piece up as far as it goes, top row first, then fills the bottom (drop/a/f.b, haul/a/b, haul/a/c). */
  private rise(): PieceMove[] {
    const moves: PieceMove[] = [];
    const move = (piece: number, x: number, fy: number, ty: number) => {
      if (fy >= 0) this.set(x, fy, EMPTY);
      this.set(x, ty, piece);
      moves.push({ piece, fx: x, fy, tx: x, ty });
    };
    for (let y = H - 1; y >= 0; y--) {
      for (let x = 0; x < W; x++) {
        const p = this.get(x, y);
        if (p === EMPTY) continue;
        if (isChest(p)) {
          // A chest's top row floats as one piece; its bottom row squares go one by one.
          const [start, end] = this.chestEdges(x, y);
          let dist = H - 1;
          for (let xx = start; xx <= end; xx++) dist = Math.min(dist, this.riseDistance(xx, y));
          if (dist === 0) continue;
          for (let xx = start; xx <= end; xx++) move(this.get(xx, y), xx, y, y + dist);
        } else {
          const dist = this.riseDistance(x, y);
          if (dist) move(p, x, y, y + dist);
        }
      }
    }
    // A waiting chest comes in instead of the coins, if there's a gap wide and deep enough.
    if (this.chestList.length && Array.from({ length: W }, (_, x) => this.riseDistance(x, -1)).some((d) => d > 0)) {
      const chest = this.chestList[0];
      const at = this.findChestPosition(chest.size);
      if (at !== -1) {
        this.chestList.shift();
        const { width, height } = CHEST_SIZES[chest.size];
        for (let dx = 0; dx < width; dx++) {
          for (let dy = 0; dy < height; dy++) {
            const part = dx === 0 && dy === 0 ? 0 : dy === 0 ? 1 : 2;
            const from = -1 - dy;
            move(chestPiece(part, chest.value, chest.size), at + dx, from, height + from);
          }
        }
        return moves;
      }
    }
    for (let x = 0; x < W; x++) {
      const gap = this.riseDistance(x, -1);
      for (let i = 0; i < gap; i++) {
        const from = -1 - i;
        move(this.nextPiece(), x, from, from + gap);
      }
    }
    return moves;
  }

  /** The columns a chest square moves with (haul/a/b.a): the whole top row, or just itself. */
  private chestEdges(x: number, y: number): [number, number] {
    const p = this.get(x, y);
    if (chestPart(p) === 2) return [x, x];
    let start = x;
    if (chestPart(p) !== 0) {
      start = x - 1;
      while (start >= 0 && chestPart(this.get(start, y)) === 1) start--;
    }
    let end = x + 1;
    while (end < W && chestPart(this.get(end, y)) === 1) end++;
    return [start, end - 1];
  }

  /** A random column where a chest fits in the gap at the bottom (HaulBoard.findChestPosition). */
  findChestPosition(size: number): number {
    const { width, height } = CHEST_SIZES[size];
    const gaps = Array.from({ length: W }, (_, x) => this.riseDistance(x, -1));
    const fits: number[] = [];
    for (let x = 0; x < W - width + 1; x++) {
      let ok = true;
      for (let dx = 0; dx < width; dx++) if (gaps[x + dx] < height) ok = false;
      if (ok) fits.push(x);
    }
    return fits.length ? fits[this.nextInt(fits.length)] : -1;
  }

  /** Chests whose top reached the top row go into the net (haul/client/i.h()). */
  private haul(): Step | null {
    const chests: { x: number; piece: number }[] = [];
    const cleared: Cleared[] = [];
    for (let x = 0; x < W; x++) {
      const p = this.get(x, H - 1);
      if (!isChestOrigin(p)) continue;
      chests.push({ x, piece: p });
      const { width, height } = CHEST_SIZES[chestSize(p)];
      for (let dx = 0; dx < width; dx++) {
        for (let dy = 0; dy < height; dy++) {
          const cx = x + dx;
          const cy = H - 1 - dy;
          const piece = this.get(cx, cy);
          if (piece !== EMPTY) cleared.push({ x: cx, y: cy, piece, delay: 0 });
          this.set(cx, cy, EMPTY);
          this.scorer.clear(piece);
        }
      }
    }
    return chests.length ? { kind: 'haul', chests, cleared } : null;
  }

  /** Runs of three or more coins, rows from the top then columns, top down (drop/a/b with haul/a/a). */
  findRuns(): Run[] {
    const runs: Run[] = [];
    const runAt = (dir: 0 | 1, x: number, y: number): number => {
      const first = this.get(x, y);
      let n = 1;
      if (first !== EMPTY) {
        if (dir === 0) for (let xx = x + 1; xx < W && this.get(xx, y) === first && first < COLOURS; xx++) n++;
        else for (let yy = y - 1; yy >= 0 && this.get(x, yy) === first && first < COLOURS; yy--) n++;
      }
      if (n >= 3) runs.push({ dir, x, y, length: n });
      return n;
    };
    for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W - 3 + 1; ) x += runAt(0, x, y);
    for (let x = 0; x < W; x++) for (let y = H - 1; y > 3 - 2; ) y -= runAt(1, x, y);
    return runs;
  }

  private match(): Step | null {
    const runs = this.findRuns();
    if (!runs.length) return null;
    const cleared: Cleared[] = [];
    for (const run of runs) {
      for (let i = 0; i < run.length; i++) {
        const x = run.dir === 0 ? run.x + i : run.x;
        const y = run.dir === 0 ? run.y : run.y - i;
        const piece = this.get(x, y);
        if (piece === EMPTY) continue;
        cleared.push({ x, y, piece, delay: 0 });
        this.set(x, y, EMPTY);
        this.scorer.clear(piece);
      }
    }
    const points = this.scorer.scoreRuns(runs);
    return { kind: 'match', runs, cleared, points, chain: this.scorer.chain, message: stepMessage(runs, this.scorer.chain) };
  }
}
