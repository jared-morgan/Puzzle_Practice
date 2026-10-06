// Incoming attacks, ported from Puzzle Pirates (build 20260909165753):
//   swords         item/data/Sword: each sword's pattern of colours
//   strikes        sword/data/StrikeInfo, sword/data/ShaftInfo
//   placing        sword/a/i: where strikes and sprinkles land on the board they hit
import { Board, DAMAGE, EMPTY, H, HORIZONTAL_TILES, isBlock, isFixed, isSword, METAL, SWORD, swordPiece, VERTICAL_TILES, W } from './board';

/** Shaft patterns for sword types 0-25 (Sword.SHAFT_PROTOTYPES); numbers are colour slots. */
const SHAFT_PROTOTYPES: number[][][] = [
  [[1, 1, 2, 2, 3, 3], [1, 1, 2, 2, 3, 3], [0, 0, 1, 1, 2, 2], [0, 0, 1, 1, 2, 2]],
  [[1, 1, 2, 2, 3, 3], [1, 1, 2, 2, 3, 3], [0, 0, 1, 1, 2, 2], [0, 2, 1, 1, 3, 2]],
  [[2, 2, 0, 0, 3, 3], [2, 1, 1, 1, 1, 3], [3, 2, 0, 0, 3, 2], [3, 2, 0, 0, 3, 2], [2, 2, 1, 1, 3, 3], [2, 2, 0, 0, 3, 3]],
  [[3, 1, 0, 3, 2, 0], [0, 1, 2, 1, 2, 3], [0, 0, 2, 1, 3, 3], [1, 1, 1, 2, 2, 2], [0, 1, 1, 2, 2, 3], [0, 0, 1, 2, 3, 3]],
  [[2, 2, 1, 1, 3, 3], [2, 2, 1, 1, 3, 3], [2, 1, 1, 0, 0, 3], [2, 2, 0, 0, 3, 3], [0, 0, 0, 0, 0, 3]],
  [[1, 0, 0, 0, 0, 3], [1, 1, 1, 3, 3, 3], [2, 0, 1, 3, 0, 2], [2, 2, 1, 3, 2, 2]],
  [[0, 0, 1, 1, 3, 3], [2, 2, 2, 3, 1, 1], [1, 1, 2, 2, 0, 0], [1, 1, 2, 2, 0, 0], [3, 3, 1, 2, 2, 0], [3, 3, 1, 1, 2, 2]],
  [[3, 3, 0, 2, 1, 1], [1, 3, 0, 2, 1, 3], [1, 1, 0, 2, 3, 3], [1, 1, 0, 2, 3, 3], [1, 0, 0, 2, 2, 3], [0, 1, 0, 2, 3, 2]],
  [[1, 2, 2, 0, 0, 3], [1, 1, 1, 3, 3, 3], [1, 1, 1, 3, 3, 3], [1, 0, 0, 2, 2, 3], [2, 0, 0, 2, 2, 2], [2, 2, 2, 0, 0, 2]],
  [[2, 2, 3, 0, 1, 1], [2, 0, 1, 2, 3, 1], [2, 0, 2, 1, 3, 1], [2, 2, 0, 3, 1, 1]],
  [[1, 1, 3, 0, 1, 1], [1, 2, 3, 0, 2, 1], [1, 2, 3, 0, 2, 1], [2, 2, 3, 0, 2, 2], [2, 3, 1, 1, 0, 2]],
  [[3, 3, 1, 1, 0, 0], [3, 2, 2, 1, 2, 0], [0, 2, 1, 2, 2, 3], [0, 0, 1, 1, 3, 3]],
  [[1, 1, 3, 2, 3, 3], [1, 3, 3, 3, 2, 3], [1, 1, 2, 3, 3, 2], [0, 2, 2, 0, 3, 3], [0, 0, 1, 3, 0, 3], [0, 1, 1, 3, 3, 0]],
  [[1, 1, 0, 2, 3, 3], [1, 0, 0, 2, 2, 3], [1, 0, 1, 3, 2, 3], [0, 1, 1, 3, 3, 2]],
  [[1, 1, 3, 3, 2, 2], [1, 4, 4, 4, 4, 2], [1, 0, 3, 3, 0, 2]],
  [[1, 1, 0, 2, 3, 3], [1, 0, 0, 2, 2, 3], [1, 0, 1, 3, 2, 3], [0, 1, 1, 3, 3, 2]],
  [[1, 1, 3, 2, 3, 3], [1, 3, 3, 3, 2, 3], [1, 1, 2, 3, 3, 2], [0, 2, 2, 0, 3, 3], [0, 0, 1, 3, 0, 3], [0, 1, 1, 3, 3, 0]],
  [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
  [[1, 0, 0, 1, 1, 0], [0, 1, 1, 0, 0, 1], [3, 2, 2, 3, 3, 2], [2, 3, 3, 2, 2, 3], [0, 0, 1, 1, 0, 0], [0, 0, 1, 1, 0, 0]],
  [[1, 0, 1, 0, 1, 0], [0, 1, 1, 0, 0, 1], [3, 2, 3, 2, 3, 2], [2, 3, 3, 2, 2, 3], [0, 0, 1, 1, 1, 1], [0, 0, 0, 0, 1, 1]],
  [[0, 0, 1, 1, 5, 2], [0, 0, 1, 1, 2, 5], [1, 5, 2, 2, 3, 3], [5, 1, 2, 2, 3, 3], [0, 0, 1, 5, 2, 2], [0, 0, 5, 1, 2, 2]],
  [[1, 0, 1, 0, 1, 0], [0, 1, 1, 0, 0, 1], [3, 2, 3, 2, 3, 2], [2, 3, 3, 2, 2, 3], [0, 0, 1, 1, 1, 1], [0, 0, 0, 0, 1, 1]],
  [[1, 1, 0, 2, 3, 3], [1, 0, 0, 2, 2, 3], [1, 0, 1, 3, 2, 3], [0, 1, 1, 3, 3, 2]],
  [[2, 2, 3, 0, 1, 1], [2, 3, 3, 0, 0, 1], [6, 6, 3, 0, 6, 6], [2, 6, 3, 0, 6, 1]],
  [[1, 1, 1, 2, 2, 2], [0, 3, 1, 2, 3, 0], [0, 3, 3, 3, 3, 0], [0, 0, 2, 1, 0, 0], [3, 0, 2, 1, 0, 3]],
  [[1, 1, 3, 0, 2, 2], [2, 2, 3, 1, 1, 1], [2, 2, 2, 3, 1, 1], [3, 2, 0, 3, 1, 3], [3, 2, 2, 1, 1, 3], [2, 2, 3, 0, 1, 1]],
];
const STICK_PROTOTYPE = [[3, 0, 2, 2, 1, 3], [0, 0, 2, 2, 1, 1], [0, 0, 2, 2, 1, 1]];
export const STICK = 127;

/** Sword names (the game's item names). */
export const SWORD_NAMES: Record<number, string> = {
  0: 'Foil', 1: 'Short sword', 2: 'Long sword', 3: 'Rapier', 4: 'Dirk', 5: 'Scimitar', 6: 'Cutlass',
  7: 'Poniard', 8: 'Saber', 9: 'Stiletto', 10: 'Skull dagger', 11: 'Falchion', 12: 'Cleaver',
  13: 'Backsword', 14: 'Trident', 15: 'Battle axe', 16: 'Spear', 17: 'Tree trunk', 18: 'Katana',
  19: 'Dadao', 20: 'Spectral sword', 21: 'Jian', 22: 'Corsair blade', 23: 'Sanguine blade',
  24: 'Machete', 25: 'Claymore', 127: 'Stick',
};
/** The eight sword colours, for a sword's two colour choices (Sword.RED ... BLACK). */
export const SWORD_COLOURS = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'White', 'Black'];
/** Swords that only use the four normal piece colours; the rest belong to special seas. */
export const PLAIN_SWORDS = [STICK, ...Array.from({ length: 26 }, (_, i) => i).filter((t) => SHAFT_PROTOTYPES[t].every((row) => row.every((c) => c < 4)))];

/** A sword: its type and the two colours that decide which piece colour goes in each slot. */
export class Sword {
  readonly shaft: number[][];

  /** primary and secondary are 0-7; together they make the variation, primary * 8 + secondary. */
  constructor(readonly type: number, readonly primary = 0, readonly secondary = 0) {
    // Sword.createShaftMap: the variation picks an order of the four colours and whether the pattern is mirrored.
    let v = primary * 8 + secondary;
    const left = [1, 2, 3, 4];
    const take = (i: number) => left.splice(i, 1)[0] - 1;
    const slots = [0, 0, 0, 0, 4, 5, 6];
    slots[0] = take(v % 4); v = Math.trunc(v / 4);
    slots[1] = take(v % 3); v = Math.trunc(v / 3);
    slots[2] = take(v % 2); v = Math.trunc(v / 2);
    slots[3] = left[0] - 1;
    const mirrored = v % 2 === 1;
    const proto = type === STICK ? STICK_PROTOTYPE : SHAFT_PROTOTYPES[type];
    const n = proto.length;
    this.shaft = [];
    for (let r = 0; r < n; r++) {
      const row: number[] = [];
      for (let c = 0; c < 6; c++) row.push(slots[proto[n - r - 1][mirrored ? 5 - c : c]]);
      this.shaft.push(row);
    }
  }

  get name(): string {
    return SWORD_NAMES[this.type] ?? 'Sword';
  }

  /** The colour at (x, y) of a strike, or of a sprinkle when strike is false; past its end a strike repeats its last four rows (getShaftPiece). */
  shaftPiece(x: number, y: number, strike: boolean): number {
    y = Math.abs(y);
    const height = this.shaft.length;
    if (!strike) return this.shaft[y % 2][x];
    if (y < height) return this.shaft[y % height][x];
    const wrap = Math.min(height, 4);
    const start = Math.max(height - wrap, 0);
    return this.shaft[((y - height) % wrap) + start][x];
  }
}

/** One sword strike in an attack (StrikeInfo). Width and height are in board cells. */
export interface Strike {
  id: number;
  width: number;
  height: number;
  /** Set when placed: left column, bottom row, 0 coming in from the right or 1 from the left. */
  x: number;
  y: number;
  orient: number;
  /** pieces[column] lists the strike's pieces bottom first, or is undefined where it misses the board. */
  pieces: (number[] | undefined)[];
}

/** An attack from one player (ShaftInfo): its strikes and how many sprinkles. */
export interface Shaft {
  /** Who sent it, whose sword it uses. */
  from: number;
  id: number;
  strikes: Strike[];
  sprinkles: number;
}

export const isHorizontal = (s: { width: number; height: number }) => s.width > s.height;

/** What strikes and sprinkles stop at: blocks, swords and metal. */
function solid(p: number): boolean {
  return p !== EMPTY && (isBlock(p) || isSword(p) || isFixed(p));
}

/** Places incoming strikes (sword/a/i), working on a copy of the board. */
export class StrikePlacer {
  private board = new Board();
  private free: boolean[] = new Array<boolean>(W).fill(false);

  /**
   * Where each strike will come in, worked out when the next pair appears so the warning can show:
   * as if the strikes on the board had aged a turn. A horizontal strike with no room turns upright.
   * Returns the strikes that fit, in order.
   */
  place(board: Board, sword: Sword | null, strikes: Strike[]): Strike[] {
    const placed: Strike[] = [];
    if (!strikes.length) return placed;
    this.reset(board);
    this.board.ageStrikes();
    for (const s of strikes) {
      let ok: boolean;
      if (isHorizontal(s)) {
        ok = this.horizontal(s);
        if (!ok) {
          [s.width, s.height] = [s.height, s.width];
          ok = this.vertical(s);
        }
      } else ok = this.vertical(s);
      if (ok) {
        this.mark(s);
        s.pieces = strikePieces(sword, s);
        placed.push(s);
      }
    }
    return placed;
  }

  /** When the attack lands, each strike slides or drops as far as the board now lets it. */
  replace(board: Board, sword: Sword | null, strikes: Strike[]): void {
    if (!strikes.length) return;
    this.reset(board);
    for (const s of strikes) {
      const [x, y] = [s.x, s.y];
      if (isHorizontal(s)) this.slide(s);
      else this.drop(s);
      this.mark(s);
      if (s.x !== x || s.y !== y) s.pieces = strikePieces(sword, s);
    }
  }

  private reset(board: Board): void {
    this.board.copyFrom(board);
    this.free.fill(false);
  }

  private mark(s: Strike): void {
    const left = Math.max(s.x, 0);
    const right = Math.min(s.x + s.width, W);
    const top = Math.max(s.y - s.height + 1, 0);
    const bottom = Math.min(s.y, H - 1);
    if (right <= left || bottom < top) return;
    for (let r = s.y; r > s.y - (bottom - top + 1); r--) for (let c = left; c < right; c++) this.board.set(c, r, SWORD);
  }

  private slide(s: Strike): void {
    const b = this.board;
    const top = Math.max(s.y - s.height + 1, 0);
    if (s.orient === 0) {
      const first = Math.max(W - s.width, 0);
      let x = W;
      outer: for (let c = W - 1; c >= first; c--) {
        for (let r = s.y; r >= top; r--) if (solid(b.get(c, r))) break outer;
        x--;
      }
      s.x = x;
    } else {
      let last = -1;
      const lim = Math.min(s.width - 1, W - 1);
      outer: for (let c = 0; c <= lim; c++) {
        for (let r = s.y; r >= top; r--) if (solid(b.get(c, r))) break outer;
        last++;
      }
      s.x = last - s.width + 1;
    }
  }

  /** A vertical strike falls until it meets something solid, or would crush more than a third of its size in pieces. */
  private drop(s: Strike): void {
    const b = this.board;
    let bottom = -1;
    const quota = Math.trunc((s.width * s.height) / 3);
    let crushed = 0;
    outer: for (let r = 0; r < H; r++) {
      let count = 0;
      for (let c = s.x; c < s.x + s.width; c++) {
        const p = b.get(c, r);
        if (p !== EMPTY) {
          count++;
          if (solid(p)) break outer;
        }
      }
      crushed += count;
      if (crushed > quota) break;
      bottom++;
    }
    s.y = bottom;
  }

  /** A horizontal strike enters at the first row, from just above the stack, where it gets more than halfway in. */
  private horizontal(s: Strike): boolean {
    const best = { even: s.id % 2 === 0, need: Math.ceil(s.width / 2), reach: 0, row: 0, orient: 0 };
    let start = this.board.topBlockRow(H - 1);
    start = Math.max(Math.min(start + 3 + s.height - 1, H - 1), 2);
    for (let r = start; r < H; r++) if (this.tryRow(r, s, best)) return true;
    for (let r = start - 1; r >= 2; r--) if (this.tryRow(r, s, best)) return true;
    return false;
  }

  private tryRow(row: number, s: Strike, best: { even: boolean; need: number; reach: number; row: number; orient: number }): boolean {
    if (row <= 2) return false;
    let reach = this.reach(row, true, s.width, s.height);
    if (reach > best.reach || (reach > 0 && reach === best.reach && best.even)) Object.assign(best, { reach, row, orient: 1 });
    reach = this.reach(row, false, s.width, s.height);
    if (reach > best.reach || (reach > 0 && reach === best.reach && !best.even)) Object.assign(best, { reach, row, orient: 0 });
    if (best.reach <= best.need) return false;
    s.x = best.orient === 1 ? -s.width + best.reach : W - best.reach;
    s.y = best.row;
    s.orient = best.orient;
    return true;
  }

  /** How many columns a strike gets in from the left (or right) edge before something solid. */
  private reach(row: number, fromLeft: boolean, w: number, h: number): number {
    const top = Math.max(row - h + 1, 0);
    if (fromLeft) {
      const lim = Math.min(w, W);
      for (let c = 0; c < lim; c++) for (let r = row; r >= top; r--) if (solid(this.board.get(c, r))) return c;
      return lim;
    }
    const last = W - 1;
    const first = Math.max(W - w, 0);
    for (let c = last; c >= first; c--) for (let r = row; r >= top; r--) if (solid(this.board.get(c, r))) return last - c;
    return last - first + 1;
  }

  /** A vertical strike starts at the top, in a column picked by its id, avoiding column 4 if it can. */
  private vertical(s: Strike): boolean {
    const positions = W - s.width + 1;
    const start = s.id % positions;
    const leftward = s.id % 2 === 0;
    const y0 = Math.min(s.height - 1, H - 1);
    return this.scan(s, start, y0, leftward, false) || this.scan(s, start, y0, leftward, true);
  }

  private scan(s: Strike, start: number, y0: number, leftward: boolean, allowMiddle: boolean): boolean {
    for (s.y = y0; s.y >= 0; s.y--) {
      for (let x = 0; x < W; x++) this.free[x] = this.areaClear(x, s.y, s.width, s.height);
      let x = this.find(s.width, start, leftward, allowMiddle);
      if (x !== null) { s.x = x; return true; }
      x = this.find(s.width, start, !leftward, allowMiddle);
      if (x !== null) { s.x = x; return true; }
    }
    return false;
  }

  private find(w: number, start: number, leftward: boolean, allowMiddle: boolean): number | null {
    const covers4th = (x: number) => 3 >= x && 3 < x + w;
    if (leftward) {
      for (let x = start; x >= 0; x--) if (this.free[x] && (allowMiddle || !covers4th(x))) return x;
    } else {
      for (let x = start; x < W - w + 1; x++) if (this.free[x] && (allowMiddle || !covers4th(x))) return x;
    }
    return null;
  }

  private areaClear(x: number, y: number, w: number, h: number): boolean {
    const top = Math.max(y - h + 1, 0);
    const left = Math.max(x, 0);
    const right = Math.min(x + w, W);
    for (let r = y; r >= top; r--) for (let c = left; c < right; c++) if (solid(this.board.get(c, r))) return false;
    return true;
  }
}

/** The sword pieces of a placed strike, coloured by the attacker's sword (i.b and i.c). */
export function strikePieces(sword: Sword | null, s: Strike): (number[] | undefined)[] {
  const pieces: (number[] | undefined)[] = new Array(W).fill(undefined);
  if (!isHorizontal(s)) {
    const end = Math.min(s.x + s.width, W);
    const base = VERTICAL_TILES[s.width - 1];
    for (let col = s.x; col < end; col++) {
      if (col < 0) continue;
      const column: number[] = [];
      for (let i = 0; i < s.height; i++) {
        const part = i === s.height - 1 ? 0 : i === s.height - 2 ? 1 : i === 0 ? 3 : 2;
        const tile = base + col - s.x + part * s.width;
        column.push(swordPiece(tile, sword ? sword.shaftPiece(col, i, true) : 0));
      }
      pieces[col] = column;
    }
    return pieces;
  }
  const start = Math.max(s.x, 0);
  const end = Math.min(s.x + s.width, W);
  const base = HORIZONTAL_TILES[s.orient === 1 ? (s.height === 2 ? 0 : 1) : (s.height === 2 ? 2 : 3)];
  for (let col = start; col < end; col++) {
    const column: number[] = [];
    for (let i = 0; i < s.height; i++) {
      const tx = s.orient === 1 ? (col < end - 1 ? 0 : 1) : (col === s.x ? 0 : 1);
      const ty = i === s.height - 1 ? 0 : i === 0 ? s.height - 1 : 1;
      const along = col - s.x;
      const sx = s.orient === 0 ? W - s.height + i : s.height - i - 1;
      const sy = Math.abs(s.orient === 0 ? s.width - along - 1 : along);
      column.push(swordPiece(base + ty * 2 + tx, sword ? sword.shaftPiece(sx, sy, true) : 0));
    }
    pieces[col] = column;
  }
  return pieces;
}

/**
 * How many sprinkles land in each column (i.a(int, int, byte[], ShaftInfo)): one per column in
 * turn, right to left for odd attacks, never piling column 4 above row 3. Updates `levels`.
 */
export function sprinkleColumns(levels: number[], count: number, shaftId: number): number[] {
  const added = new Array<number>(W).fill(0);
  const order = Array.from({ length: W }, (_, i) => i);
  // The attack's id is a signed byte, so ids from 128 up never count as odd here.
  const signed = shaftId > 127 ? shaftId - 256 : shaftId;
  if (signed % 2 === 1) order.reverse();
  const cap = H - 3;
  let i = 0;
  let thisPass = 0;
  for (let placed = 0; placed < count;) {
    const col = order[i];
    if (col !== 3 || levels[col] < cap) {
      levels[col]++;
      added[col]++;
      placed++;
      thisPass++;
    }
    if (++i >= W) {
      if (thisPass === 0) break;
      thisPass = 0;
      i = 0;
    }
  }
  return added;
}

/** Sprinkle pieces: damage stones carrying the colour of the attacker's sprinkle pattern, bottom first. */
export function sprinklePieces(sword: Sword | null, counts: readonly number[]): (number[] | undefined)[] {
  return counts.map((n, col) => {
    if (n <= 0) return undefined;
    const column: number[] = [];
    for (let k = 0; k < n; k++) column.push(sword ? sword.shaftPiece(col, k, false) | DAMAGE : METAL);
    return column;
  });
}
