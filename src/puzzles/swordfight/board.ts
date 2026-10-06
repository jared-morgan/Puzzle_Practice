// Swordfight's board rules, ported from Puzzle Pirates (build 20260909165753):
//   pieces         sword/a/g (the piece bit layout) and sword/data/e (strike tile offsets)
//   board          puzzle/drop/data/DropBoard + sword/data/SwordBoard
//   falling        puzzle/drop/a/f with sword/a/l's rules (blocks fall as one)
//   joining        sword/a/e and sword/a/f (fusing same-coloured pieces into blocks)
//   clearing       sword/a/a, b, c, d (breakers shattering connected pieces)
// The code follows the game's loops and their order closely, quirks included, so boards
// develop exactly as they do in the game. Rows count down from the top (row 0) as in the game.

export const W = 6;
export const H = 13;
export const EMPTY = -1;

// ---- Pieces (sword/a/g) ----
// bits 0-2   colour: 0 red, 1 green, 2 blue, 3 yellow (4 aqua, 5 purple, 6 sanguine in special seas)
// bits 3-6   block tile 1-9 when the piece is part of a fused block (0 when loose)
// bits 7-10  kind: 0 normal, 128 breaker, 256 sword, 384 and 512 damage, 640 metal, 768 rum jug
// bits 11-16 sword tile, for kind 256
// bits 17-19 age of a purple (spectral) piece

export const KIND = 1920;
export const BREAKER = 128;
export const SWORD = 256;
export const DAMAGE = 384;
export const DAMAGE_HINT = 512;
export const METAL = 640;
export const RUM = 768;

export const colour = (p: number) => p & 7;
export const kind = (p: number) => p & KIND;
export const blockTile = (p: number) => (p & 120) >> 3;
export const swordTile = (p: number) => (p & 129024) >> 11;
export const spectralAge = (p: number) => (p & 917504) >> 17;
export const swordPiece = (tile: number, c: number) => (tile << 11) | SWORD | c;
export const isBreaker = (p: number) => (p & KIND) === BREAKER;
export const isSword = (p: number) => (p & KIND) === SWORD;
export const isBlock = (p: number) => (p & 120) !== 0;
/** Metal and rum jugs never move or clear. */
export const isFixed = (p: number) => kind(p) === METAL || kind(p) === RUM;
/** A sword strike or one of its damage stages. */
export const isStrike = (p: number) => kind(p) === SWORD || kind(p) === DAMAGE || kind(p) === DAMAGE_HINT;
export const isSpectral = (p: number) => colour(p) === 5;
/** A plain coloured piece (loose or in a block): what fuses into blocks. */
export const isPlain = (p: number) => !isFixed(p) && !isStrike(p) && !isBreaker(p) && !isSpectral(p);

/** One step on for a strike piece: sword, damage, damage with a colour hint, then the plain piece (g.k). */
export function ageStrike(p: number): number {
  const c = colour(p);
  switch (kind(p)) {
    case SWORD: return c | DAMAGE;
    case DAMAGE: return c | DAMAGE_HINT;
    case DAMAGE_HINT: return c;
    default: return p;
  }
}

/** One step on for a purple piece; after five it turns to metal (g.l). */
export function ageSpectral(p: number): number {
  const age = spectralAge(p) + 1;
  return age > 5 ? METAL : (p & ~917504) | (age << 17);
}

export const TOP = 1;
export const BOTTOM = 2;
export const LEFT = 3;
export const RIGHT = 4;

/** Whether a block piece lies on that edge of its block (g.c). */
export function blockEdge(p: number, edge: number): boolean {
  const t = blockTile(p);
  if (t === 0) return false;
  switch (edge) {
    case TOP: return t <= 3;
    case BOTTOM: return t > 6;
    case LEFT: return t % 3 === 1;
    case RIGHT: return t % 3 === 0;
    default: return false;
  }
}

/** First tile of each vertical sword width (1-3) in piece_swords_strike (data/e.t_). */
export const VERTICAL_TILES = [0, 4, 12];
/** First tile of horizontal swords: from the left 2 and 3 high, from the right 2 and 3 high (data/e.u_). */
export const HORIZONTAL_TILES = [24, 28, 34, 38];

/** Whether a sword piece lies on that edge of its sword (g.d). */
export function swordEdge(p: number, edge: number): boolean {
  if (kind(p) !== SWORD) return false;
  const t = swordTile(p);
  switch (edge) {
    case TOP:
      for (let w = 0; w < 3; w++) if (t >= VERTICAL_TILES[w] && t <= VERTICAL_TILES[w] + w) return true;
      for (let r = 0; r <= 1; r++) {
        for (let s = 0; s < 2; s++) {
          const first = HORIZONTAL_TILES[r * 2 + s];
          if (t >= first && t <= first + 1) return true;
        }
      }
      return false;
    case BOTTOM:
      for (let w = 0; w < 3; w++) {
        const first = VERTICAL_TILES[w] + 3 * (w + 1);
        if (t >= first && t <= first + w) return true;
      }
      for (let r = 0; r <= 1; r++) {
        for (let s = 0; s < 2; s++) {
          const first = HORIZONTAL_TILES[r * 2 + s] + (s === 0 ? 2 : 4);
          if (t >= first && t <= first + 1) return true;
        }
      }
      return false;
    case LEFT:
      for (let w = 0; w < 3; w++) {
        const first = VERTICAL_TILES[w];
        if (t < first + (w + 1) * 4 && (t - first) % (w + 1) === 0) return true;
      }
      return false;
    case RIGHT:
      for (let w = 0; w < 3; w++) {
        const first = VERTICAL_TILES[w];
        if (t < first + (w + 1) * 4 && (t - first) % (w + 1) === w) return true;
      }
      return false;
    default:
      return false;
  }
}

/** The piece for cell (x, y) of a w x h block, y = 0 being its top row (g.a(int, int, int, int, int)). */
export function blockPiece(c: number, x: number, y: number, w: number, h: number): number {
  const tx = x > 0 ? (x === w - 1 ? 2 : 1) : 0;
  const ty = y > 0 ? (y === h - 1 ? 2 : 1) : 0;
  return c | ((ty * 3 + tx + 1) << 3);
}

/** A fused block: x is its left column and y its bottom row (data/a). */
export interface Block {
  colour: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** BlockList.a: whether (x, y) is in a block. The game compares x <= left here, not >=; kept as is. */
export function blockListHas(blocks: readonly Block[], x: number, y: number): Block | null {
  for (const b of blocks) if (x <= b.x && y <= b.y && x <= b.x + b.w - 1 && y >= b.y - b.h + 1) return b;
  return null;
}

/** Orientations are the game's compass directions: where the second piece of a pair sits. */
export const WEST = 1;
export const NORTH = 3;
export const EAST = 5;
export const SOUTH = 7;
/** Turning clockwise adds 2, anticlockwise 6 (drop/a/a). */
export const turn = (orient: number, clockwise: boolean) => (orient + (clockwise ? 2 : 6)) % 8;

const ORIENT_WIDTHS = [2, 1, 2, 1];
const ORIENT_HEIGHTS = [1, 2, 1, 2];
const ORIENT_ORIGIN_DX = [-1, 0, 0, 0];
const ORIENT_ORIGIN_DY = [0, 0, 0, 1];
const COERCE_DX = [0, 1, -1];

export class Board {
  readonly cells: Int32Array;

  constructor(cells?: ArrayLike<number>) {
    this.cells = new Int32Array(W * H).fill(EMPTY);
    if (cells) this.cells.set(cells);
  }

  clone(): Board {
    return new Board(this.cells);
  }

  copyFrom(other: Board): void {
    this.cells.set(other.cells);
  }

  /** Like the game, an index past the board reads as empty; one that wraps reads the wrapped cell. */
  get(x: number, y: number): number {
    const i = y * W + x;
    return i >= 0 && i < W * H ? this.cells[i] : EMPTY;
  }

  set(x: number, y: number, p: number): boolean {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    this.cells[y * W + x] = p;
    return true;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < W && y < H;
  }

  /** Empty cells below (x, y) before the next piece or the floor. */
  dropDistance(x: number, y: number): number {
    let d = 0;
    for (let r = y + 1; r < H; r++) {
      if (this.get(x, r) !== EMPTY) return d;
      d++;
    }
    return d;
  }

  isRowEmpty(y: number): boolean {
    for (let x = 0; x < W; x++) if (this.get(x, y) !== EMPTY) return false;
    return true;
  }

  /** Each column's height (getColumnLevels). */
  columnLevels(): number[] {
    const levels: number[] = [];
    for (let x = 0; x < W; x++) levels.push(H - this.dropDistance(x, -1));
    return levels;
  }

  /** Whether a falling pair at these rows and columns can go down a row (isValidDrop). */
  canDrop(rows: readonly number[], cols: readonly number[]): boolean {
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] >= H - 1) return false;
      const below = rows[i] + 1;
      if (below >= 0 && this.get(cols[i], below) !== EMPTY) return false;
    }
    return true;
  }

  /** Whether a w x h area with its bottom-left at (x, y) is free; rows above the board count as row 0 (isBlockEmpty). */
  isAreaEmpty(x: number, y: number, w: number, h: number): boolean {
    for (let r = y; r > y - h; r--) {
      for (let c = x; c < x + w; c++) {
        if (r < 0) {
          if (c < 0 || c >= W || this.get(c, 0) !== EMPTY) return false;
        } else {
          if (c < 0 || c >= W || r >= H) return false;
          if (this.get(c, r) !== EMPTY) return false;
        }
      }
    }
    return true;
  }

  /**
   * Turning a pair about its first piece (getForgivingRotation with radial rotation): it may shift a
   * column right or left to fit, keeps turning if it can't, and pointing down it may be pushed up a
   * row while kicks remain. Returns [orient, col, row, kicked] or null.
   */
  turnPair(row: number, col: number, orient: number, clockwise: boolean, progress: number, canKick: boolean): [number, number, number, boolean] | null {
    for (let tries = 0; tries < 4; tries++) {
      orient = turn(orient, clockwise);
      const o = orient >> 1;
      const ox = col + ORIENT_ORIGIN_DX[o];
      let oy = row + ORIENT_ORIGIN_DY[o];
      if (progress > 0.5) oy++;
      for (const dx of COERCE_DX) {
        if (this.isAreaEmpty(ox + dx, oy, ORIENT_WIDTHS[o], ORIENT_HEIGHTS[o])) return [orient, col + dx, row, false];
      }
      if (canKick && orient === SOUTH && this.isAreaEmpty(ox, oy - 1, ORIENT_WIDTHS[o], ORIENT_HEIGHTS[o])) return [orient, col, row - 1, true];
    }
    return null;
  }

  /** Moving a pair's bounding box (left x, bottom y) sideways; past half a row it checks the row below (getForgivingMove). */
  canMove(x: number, y: number, w: number, h: number, dx: number, progress: number): boolean {
    return this.isAreaEmpty(x + dx, progress >= 0.5 ? y + 1 : y, w, h);
  }

  // ---- Blocks (SwordBoard) ----

  /** The row or column where a block (or with sword, a sword) ends in that direction (getBlockEdge). */
  edge(x: number, y: number, dir: number, sword = false): number {
    let v: number;
    let step: number;
    let limit: number;
    switch (dir) {
      case TOP: v = y; step = -1; limit = H; break;
      case BOTTOM: v = y; step = 1; limit = H; break;
      case LEFT: v = x; step = -1; limit = W; break;
      case RIGHT: v = x; step = 1; limit = W; break;
      default: return -1;
    }
    while (v >= 0 && v < limit) {
      const p = dir === LEFT || dir === RIGHT ? this.get(v, y) : this.get(x, v);
      if (sword ? swordEdge(p, dir) : blockEdge(p, dir)) return v;
      v += step;
    }
    return Math.min(Math.max(v, 0), limit - 1);
  }

  blockWidth(x: number, y: number): number {
    if (!isBlock(this.get(x, y))) return -1;
    return this.edge(x, y, RIGHT) - this.edge(x, y, LEFT) + 1;
  }

  blockHeight(x: number, y: number): number {
    if (!isBlock(this.get(x, y))) return -1;
    return this.edge(x, y, BOTTOM) - this.edge(x, y, TOP) + 1;
  }

  /** Whether exactly this block is already on the board (isBlockPresent). */
  hasBlock(c: number, x: number, y: number, w: number, h: number): boolean {
    return this.get(x, y) === blockPiece(c, 0, h - 1, w, h) && this.blockWidth(x, y) === w && this.blockHeight(x, y) === h;
  }

  setBlock(c: number, x: number, y: number, w: number, h: number): void {
    for (let r = 0; r < h; r++) {
      for (let col = 0; col < w; col++) this.set(x + col, y - (h - r) + 1, blockPiece(c, col, r, w, h));
    }
  }

  /** The highest row, going up from `from`, that is empty or holds a block or sword (getTopBlockRow). */
  topBlockRow(from: number): number {
    for (let y = from; y >= 0; y--) {
      let empty = true;
      for (let x = 0; x < W; x++) {
        const p = this.get(x, y);
        if (p !== EMPTY) {
          empty = false;
          if (isBlock(p) || isSword(p)) return y;
        }
      }
      if (empty) return y;
    }
    return from;
  }

  /** Strike pieces move on a stage each time a pair lands (updateStrikePieces). */
  ageStrikes(): Array<[number, number]> {
    const changed: Array<[number, number]> = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = this.get(x, y);
        if (isStrike(p)) {
          this.set(x, y, ageStrike(p));
          changed.push([x, y]);
        }
      }
    }
    return changed;
  }

  /** Loose purple pieces age each time the board settles (updateSpectralPieces). */
  ageSpectrals(): void {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = this.get(x, y);
        if (kind(p) === 0 && isSpectral(p)) this.set(x, y, ageSpectral(p));
      }
    }
  }

  /** Writes a column of pieces upwards from (x, y), bottom piece first, dropping any above the board. */
  setColumn(x: number, y: number, pieces: readonly number[]): void {
    for (let i = 0; i < pieces.length && y - i >= 0; i++) this.set(x, y - i, pieces[i]);
  }
}

// ---- Falling (puzzle/drop/a/f with sword/a/l) ----

export interface Fall {
  piece: number;
  x: number;
  from: number;
  to: number;
}

/**
 * Lets everything fall as far as it can, bottom row first. A block's bottom row falls as one, by
 * the least room under any of it, and the rows above follow it down. Sword pieces stay put.
 */
export function fall(board: Board): Fall[] {
  const falls: Fall[] = [];
  const move = (p: number, x: number, from: number, to: number) => {
    if (from >= 0) board.set(x, from, EMPTY);
    board.set(x, to, p);
    falls.push({ piece: p, x, from, to });
  };
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      let p = board.get(x, y);
      if (p === EMPTY || isSword(p)) continue;
      if (blockEdge(p, BOTTOM) || swordEdge(p, BOTTOM)) {
        const sword = isSword(p);
        let start = board.edge(x, y, LEFT, sword);
        let end = board.edge(x, y, RIGHT, sword);
        start = Math.max(start, 0);
        end = Math.min(end, W);
        let room = H - 1;
        for (let c = start; c <= end; c++) room = Math.min(room, board.dropDistance(c, y));
        if (room === 0) continue;
        for (let c = start; c <= end; c++) {
          p = board.get(c, y);
          move(p, c, y, y + room);
        }
      } else {
        const room = board.dropDistance(x, y);
        if (room === 0) continue;
        move(p, x, y, y + room);
      }
    }
  }
  return falls;
}

// ---- Joining (sword/a/e, sword/a/f) ----

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The search for the biggest block rooted at one piece (sword/a/f). */
class Join {
  x = 0;
  y = 0;
  piece = 0;
  colour = 0;
  /** diagonal, horizontal and vertical candidates */
  frames: Rect[] = [0, 1, 2].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
  /** Cleared when a cell of the wrong kind is met, which stops growing that way. */
  growing = true;

  constructor(readonly board: Board) {}

  root(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.piece = this.board.get(x, y);
    this.colour = colour(this.piece);
    for (const f of this.frames) Object.assign(f, { x, y, w: 0, h: 0 });
  }
}

/** Whether the block at (px, py) lies inside the w x h area with its bottom-left at (x, y) (e.a(SwordBoard, ...)). */
function blockInside(board: Board, x: number, y: number, w: number, h: number, px: number, py: number): boolean {
  const left = board.edge(px, py, LEFT);
  const top = board.edge(px, py, TOP);
  const right = board.edge(px, py, RIGHT);
  const bottom = board.edge(px, py, BOTTOM);
  return left >= x && top > y - h && right < x + w && bottom <= y;
}

function fits(j: Join, x: number, y: number, w: number, h: number): boolean {
  for (let r = y; r > y - h; r--) {
    for (let c = x; c < x + w; c++) {
      const p = j.board.get(c, r);
      if (!(p !== EMPTY && colour(p) === j.colour && isPlain(p))) {
        j.growing = false;
        return false;
      }
      if (isBlock(p) && !blockInside(j.board, x, y, w, h, c, r)) return false;
    }
  }
  return true;
}

function growDiagonal(j: Join): void {
  let h = 2;
  const maxW = W - j.x;
  const maxH = j.y + 1;
  j.growing = true;
  for (let w = 2; j.growing && w <= maxW && h <= maxH; h++) {
    if (fits(j, j.x, j.y, w, h)) Object.assign(j.frames[0], { w, h });
    w++;
  }
}

function growVertical(j: Join): void {
  let w = j.frames[0].w;
  if (w === 0 && isBlock(j.piece)) w = j.board.blockWidth(j.x, j.y);
  const maxH = j.y + 1;
  j.growing = true;
  for (let h = 2; j.growing && h <= maxH; h++) {
    if (fits(j, j.x, j.y, w, h)) Object.assign(j.frames[2], { w, h });
  }
  const x = j.x;
  j.growing = true;
  for (let y = j.y + 1, h = j.frames[2].h + 1; j.growing && y < H; y++) {
    if (fits(j, x, y, w, h)) Object.assign(j.frames[2], { x, y, w, h });
    h++;
  }
}

function growHorizontal(j: Join): void {
  let h = j.frames[0].h;
  if (h === 0 && isBlock(j.piece)) h = j.board.blockHeight(j.x, j.y);
  const maxW = W - j.x;
  j.growing = true;
  for (let w = 2; j.growing && w <= maxW; w++) {
    if (fits(j, j.x, j.y, w, h)) Object.assign(j.frames[1], { w, h });
  }
  const y = j.y;
  j.growing = true;
  for (let x = j.x, w = j.frames[1].w; j.growing && x >= 0; x--) {
    if (fits(j, x, y, w, h)) Object.assign(j.frames[1], { x, y, w, h });
    w++;
  }
}

/** The biggest of the three; ties favour diagonal, then vertical. */
function biggest(j: Join): Rect {
  const [d, hz, v] = j.frames.map((f) => f.w * f.h);
  if (d >= v && d >= hz) return j.frames[0];
  return v >= hz ? j.frames[2] : j.frames[1];
}

/** A piece a block can grow from: a loose plain piece, or the bottom-left corner of a block. */
function canRoot(p: number): boolean {
  return !isBlock(p) || (blockEdge(p, LEFT) && blockEdge(p, BOTTOM)) ? p !== EMPTY && isPlain(p) : false;
}

/**
 * Finds the new blocks to fuse, bottom row first (sword/a/e.a). Works on a copy; returns the blocks
 * in the order the game fuses them, or [] when nothing new forms.
 */
export function findJoins(source: Board): Block[] {
  const board = source.clone();
  const j = new Join(board);
  const found: Block[] = [];
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W - 1; x++) {
      if (!canRoot(board.get(x, y))) continue;
      if (found.some((b) => x >= b.x && x < b.x + b.w && y >= b.y - b.h + 1 && y <= b.y)) continue;
      j.root(x, y);
      growDiagonal(j);
      growVertical(j);
      growHorizontal(j);
      const r = biggest(j);
      if (r.w > 0 && r.h > 0 && !board.hasBlock(j.colour, r.x, r.y, r.w, r.h)) {
        for (let i = found.length - 1; i >= 0; i--) {
          if (blockInside(board, r.x, r.y, r.w, r.h, found[i].x, found[i].y)) found.splice(i, 1);
        }
        board.setBlock(j.colour, r.x, r.y, r.w, r.h);
        found.push({ colour: j.colour, x: r.x, y: r.y, w: r.w, h: r.h });
      }
    }
  }
  return found;
}

// ---- Clearing (sword/a/a) ----

export interface Shattered {
  x: number;
  y: number;
  piece: number;
  /** Steps out from the breaker: the game shatters each step 75ms after the last. */
  depth: number;
}

export interface Clear {
  /** Loose pieces shattered, breakers included. */
  loose: number;
  cells: Shattered[];
  blocks: Block[];
}

/** Whether `p` shatters along with `from` (a.a(int, int, int, boolean)). */
function joinsClear(p: number, from: number, chain: number, touching: boolean): boolean {
  if (p === EMPTY) return false;
  let same: boolean;
  switch (colour(p)) {
    case 5: same = true; break;
    case 6: same = chain >= 1 && (!touching || !isBreaker(from)); break;
    default: same = colour(p) === colour(from);
  }
  return same && !isStrike(p) && !isFixed(p);
}

function breakerTouches(board: Board, x: number, y: number, p: number, chain: number): boolean {
  if (y > 0 && joinsClear(board.get(x, y - 1), p, chain, true)) return true;
  if (x > 0 && joinsClear(board.get(x - 1, y), p, chain, true)) return true;
  if (y < H - 1 && joinsClear(board.get(x, y + 1), p, chain, true)) return true;
  return x < W - 1 && joinsClear(board.get(x + 1, y), p, chain, true);
}

/**
 * Every breaker touching its colour shatters with all the pieces connected to it, and fused blocks
 * go whole. `chain` is how many clears already happened since the pair landed. Doesn't change the board.
 */
export function findClear(source: Board, chain: number): Clear {
  const board = source.clone();
  const seen = new Uint8Array(W * H);
  const result: Clear = { loose: 0, cells: [], blocks: [] };
  let frontier: Shattered[] = [];
  for (let y = H - 1; y >= 0; y--) {
    for (let x = 0; x < W; x++) {
      const p = board.get(x, y);
      if (isBreaker(p) && breakerTouches(board, x, y, p, chain)) {
        const s = { x, y, piece: p, depth: 0 };
        seen[y * W + x] = 1;
        frontier.push(s);
        result.cells.push(s);
        result.loose++;
      }
    }
  }
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next: Shattered[] = [];
    for (const from of frontier) {
      const visit = (x: number, y: number) => {
        if (seen[y * W + x]) return;
        const p = board.get(x, y);
        if (!joinsClear(p, from.piece, chain, false)) return;
        seen[y * W + x] = 1;
        next.push({ x, y, piece: p, depth });
        if (isBlock(p) && !blockListHas(result.blocks, x, y)) {
          const left = board.edge(x, y, LEFT);
          const bottom = board.edge(x, y, BOTTOM);
          const top = board.edge(x, y, TOP);
          const right = board.edge(x, y, RIGHT);
          const block: Block = { colour: colour(from.piece), x: left, y: bottom, w: right - left + 1, h: bottom - top + 1 };
          result.blocks.push(block);
          for (let bx = block.x; bx <= block.x + block.w - 1; bx++) {
            for (let by = block.y; by >= block.y - block.h + 1; by--) {
              if (bx === x && by === y) continue;
              seen[by * W + bx] = 1;
              next.push({ x: bx, y: by, piece: board.get(bx, by), depth });
            }
          }
        } else {
          result.loose++;
        }
      };
      if (from.y > 0) visit(from.x, from.y - 1);
      if (from.x > 0) visit(from.x - 1, from.y);
      if (from.y < H - 1) visit(from.x, from.y + 1);
      if (from.x < W - 1) visit(from.x + 1, from.y);
    }
    frontier = next;
    result.cells.push(...next);
  }
  return result;
}
