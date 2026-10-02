// Board rules from the Forage simulator (board_calc, board_matches, board_movement,
// board_turn, reserve_top_off, reserve_horizontal, random_board, puzzles_randomize and
// Scramble_keys). The rules and the order of random draws are unchanged, so with the same
// seed these produce the same boards as the Python code.
//
// The board is 10 rows by 7 columns, indexed board[row][column] with row 0 at the top.
// Letters:
//   u v w x y  the five colours (dirt, wood, grass, sand, stone)
//   z          empty
//   s          "any colour" in a puzzle template
//   k          bone box (1x1)
//   g h / i j  jar (2x2, top-left g)
//   a b c / d e f  chest (3x2, top-left a)
//   m machete, n shovel, o earthquake, p monkey, q ant (never spawns)
import type { PyRandom } from '../../core/pyrandom';
import { fallDuration, type Sprite, type StepRecorder } from './steps';

export type Board = string[][];

export const ROWS = 10;
export const COLS = 7;

export const COLOURS = ['u', 'v', 'w', 'x', 'y'] as const;
const COLOUR_SET = new Set<string>(COLOURS);
const CHEST_PIECES = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
const DELETEABLE = new Set(['u', 'v', 'w', 'x', 'y', 'm', 'n', 'o', 'p', 'q', 'z']);
const FALLS_ALONE = new Set(['u', 'v', 'w', 'x', 'y', 'k', 'm', 'n', 'o', 'p', 'q']);
const MULTI_CELL = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']);
/** Specials that make the cursor shrink to one cell, since clicking them uses them. */
export const TOOLS = new Set(['m', 'n', 'o', 'p']);

export type Mode = 'puzzle' | 'ci' | 'infinite';

export interface Settings {
  mode: Mode;
  /** Which chests spawn outside puzzle mode. */
  bb: boolean;
  fj: boolean;
  cc: boolean;
  /** Which tools can drop in from the top outside puzzle mode. */
  eq: boolean;
  machete: boolean;
  shovel: boolean;
  monkey: boolean;
  /** Puzzle mode: re-roll the colours of the puzzle as well as its "s" cells. */
  scramble: boolean;
  /** Forage level 0–15; sets how often each chest type spawns. */
  forageLevel: number;
}

/** [bone boxes, jars, chests] cleared. */
export type Cleared = [number, number, number];

export function emptyBoard(fill = 's'): Board {
  return Array.from({ length: ROWS }, () => Array<string>(COLS).fill(fill));
}

export function parseBoard(rows: readonly string[]): Board {
  return rows.map((row) => row.split(''));
}

export function copyBoard(board: Board): Board {
  return board.map((row) => [...row]);
}

/** Pieces and weights that drop in from the top. */
function dropPool(settings: Settings, specials: boolean): [string[], number[]] {
  const pieces: string[] = [...COLOURS];
  const weights = [0.196, 0.196, 0.196, 0.196, 0.196];
  if (specials && settings.mode !== 'puzzle') {
    // Order and odds from reserve_top_off.py: earthquake, machete, shovel, monkey (ants never enabled).
    const enabled = [settings.eq, settings.machete, settings.shovel, settings.monkey];
    const specialPieces = ['o', 'm', 'n', 'p'];
    const specialWeights = [0.004, 0.004, 0.004, 0.008];
    enabled.forEach((on, i) => {
      if (on) {
        pieces.push(specialPieces[i]);
        weights.push(specialWeights[i]);
      }
    });
  }
  return [pieces, weights];
}

/** Marks every run of three or more matching colours as empty. Returns whether any matched. */
export function boardMatches(board: Board, rec?: StepRecorder): boolean {
  let matched = false;
  const marks = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  for (let r = 0; r < ROWS; r++) {
    let same = 0;
    let check = '';
    for (let c = 0; c < COLS; c++) {
      if (board[r][c] === check) {
        same++;
        if (same === 2) {
          matched = true;
          marks[r][c - 2] = marks[r][c - 1] = marks[r][c] = 1;
        } else if (same > 2) marks[r][c] = 1;
      } else if (COLOUR_SET.has(board[r][c])) {
        check = board[r][c];
        same = 0;
      } else {
        check = '';
        same = 0;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    let same = 0;
    let check = '';
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c] === check) {
        same++;
        if (same === 2) {
          matched = true;
          marks[r - 2][c] = marks[r - 1][c] = marks[r][c] = 1;
        } else if (same > 2) marks[r][c] = 1;
      } else if (COLOUR_SET.has(board[r][c])) {
        check = board[r][c];
        same = 0;
      } else {
        check = '';
        same = 0;
      }
    }
  }
  const sprites: Sprite[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!marks[r][c]) continue;
      sprites.push({ piece: board[r][c], from: [r, c], to: [r, c], fade: 'out' });
      board[r][c] = 'z';
    }
  }
  rec?.add(board, sprites, 180);
  return matched;
}

/** One step of gravity. Chests that reach the bottom row are cleared and counted. Returns whether anything moved. */
export function boardMovement(board: Board, cleared: Cleared, rec?: StepRecorder): boolean {
  let moved = false;
  const sprites: Sprite[] = [];
  const pieceMove = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  const chestMove = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));

  // How far the piece above each empty cell should fall; a multi-cell chest resets the count.
  for (let c = 0; c < COLS; c++) {
    let columnMove = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c] === 'z') {
        columnMove++;
        pieceMove[r][c] = columnMove;
      } else if (MULTI_CELL.has(board[r][c])) {
        chestMove[r][c] = columnMove;
        columnMove = 0;
      }
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 2; r >= 0; r--) {
      if (FALLS_ALONE.has(board[r][c])) pieceMove[r][c] = pieceMove[r + 1][c];
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (pieceMove[r][c] > 0 && board[r][c] !== 'z') {
        moved = true;
        const target = pieceMove[r][c] + r;
        sprites.push({ piece: board[r][c], from: [r, c], to: [target, c], ...(board[r][c] === 'k' && target === 9 && { fade: 'out' as const }) });
        if (board[r][c] === 'k' && target === 9) {
          board[r][c] = 'z';
          cleared[0]++;
        } else {
          board[target][c] = board[r][c];
          board[r][c] = 'z';
        }
      }
    }
  }
  // Jars (bottom-left i) and chests (bottom-left d) fall as far as their shortest column allows.
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 1; r >= 0; r--) {
      const width = board[r][c] === 'i' ? 2 : board[r][c] === 'd' ? 3 : 0;
      if (!width) continue;
      const fall = Math.min(...Array.from({ length: width }, (_, i) => chestMove[r][c + i]));
      if (fall <= 0) continue;
      moved = true;
      for (let i = 0; i < width; i++) {
        for (const row of [r - 1, r]) {
          sprites.push({ piece: board[row][c + i], from: [row, c + i], to: [row + fall, c + i], ...(fall + r === 9 && { fade: 'out' as const }) });
        }
      }
      if (fall + r === 9) {
        cleared[width - 1]++;
        for (let i = 0; i < width; i++) board[r][c + i] = board[r - 1][c + i] = 'z';
      } else {
        for (let i = 0; i < width; i++) {
          board[r + fall][c + i] = board[r][c + i];
          board[r][c + i] = 'z';
          board[r + fall - 1][c + i] = board[r - 1][c + i];
          board[r - 1][c + i] = 'z';
        }
      }
    }
  }
  rec?.add(board, sprites, sprites.length ? fallDuration(sprites) : 0);
  return moved;
}

/** Drops pieces from the reserve into empty cells at the top, and refills the reserve. Returns whether anything dropped. */
export function reserveTopOff(board: Board, reserve: Board, settings: Settings, rng: PyRandom, specials = true, rec?: StepRecorder): boolean {
  let moved = false;
  const reserveMove = Array<number>(COLS).fill(0);
  for (let c = 0; c < COLS; c++) {
    let r = 0;
    while (r < ROWS && board[r][c] === 'z') {
      moved = true;
      r++;
      reserveMove[c] = r;
    }
  }
  for (let c = 0; c < COLS; c++) {
    for (let r = ROWS - 1; r >= 0; r--) {
      if (r + reserveMove[c] > 9) board[reserveMove[c] + r - 10][c] = reserve[r][c];
      else reserve[r + reserveMove[c]][c] = reserve[r][c];
    }
  }
  if (rec) {
    const sprites: Sprite[] = [];
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < reserveMove[c]; r++) sprites.push({ piece: board[r][c], from: [r - reserveMove[c], c], to: [r, c] });
    }
    rec.add(board, sprites, sprites.length ? fallDuration(sprites) : 0);
  }
  const [pieces, weights] = dropPool(settings, specials);
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (reserveMove[c] >= r + 1) reserve[r][c] = rng.choiceWeighted(pieces, weights);
    }
  }
  return moved;
}

/** Cascades the board until nothing matches or moves. Returns the chests cleared. */
export function boardCalc(board: Board, reserve: Board, settings: Settings, rng: PyRandom, specials = true, rec?: StepRecorder): Cleared {
  const cleared: Cleared = [0, 0, 0];
  let moved = true;
  let matched = false;
  while (moved || matched) {
    matched = boardMatches(board, rec);
    if (matched) moved = true;
    while (moved) {
      moved = boardMovement(board, cleared, rec);
      if (moved) matched = true;
    }
    if (reserveTopOff(board, reserve, settings, rng, specials, rec)) {
      moved = true;
      matched = true;
    }
  }
  return cleared;
}

/**
 * Applies a click at (row, col): rotates the 2x2 below-right of the cell (left click
 * anticlockwise, right click clockwise), or uses a tool. Returns the moves used (0 or 1).
 */
export function boardTurn(board: Board, row: number, col: number, button: 1 | 3, rng: PyRandom, rec?: StepRecorder): number {
  const piece = board[row][col];
  const before = rec ? copyBoard(board) : board;
  /** Fades out whatever the tool removed or replaced. */
  const recordToolUse = (duration: number) => {
    const sprites: Sprite[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (before[r][c] !== board[r][c] && before[r][c] !== 'z') sprites.push({ piece: before[r][c], from: [r, c], to: [r, c], fade: 'out' });
      }
    }
    rec?.add(board, sprites, duration, true);
  };
  if (piece === 'm') {
    // Machete: clears the row to the left (left click) or right (right click), itself included.
    for (let c = 0; c < COLS; c++) {
      if ((button === 1 ? c <= col : c >= col) && DELETEABLE.has(board[row][c])) board[row][c] = 'z';
    }
    recordToolUse(220);
    return 1;
  }
  if (piece === 'n') {
    // Shovel: clears its column from here down.
    for (let r = row; r < ROWS; r++) if (DELETEABLE.has(board[r][col])) board[r][col] = 'z';
    recordToolUse(220);
    return 1;
  }
  if (piece === 'p') {
    // Monkey: re-rolls everything in the 5x5 around it.
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (Math.abs(c - col) <= 2 && Math.abs(r - row) <= 2 && DELETEABLE.has(board[r][c])) board[r][c] = rng.choice(COLOURS);
      }
    }
    recordToolUse(300);
    return 1;
  }
  if (piece === 'o') {
    board[row][col] = 'z';
    rec?.add(board, [{ piece: 'o', from: [row, col], to: [row, col], fade: 'out' }], 150);
    earthquake(board, button, rng, rec);
    return 1;
  }
  const r = Math.min(row, ROWS - 2);
  const c = Math.min(col, COLS - 2);
  const square = [board[r][c], board[r][c + 1], board[r + 1][c], board[r + 1][c + 1]];
  if (!square.every((p) => COLOUR_SET.has(p))) return 0;
  const [tl, tr, bl, br] = button === 1 ? [square[1], square[3], square[0], square[2]] : [square[2], square[0], square[3], square[1]];
  board[r][c] = tl;
  board[r][c + 1] = tr;
  board[r + 1][c] = bl;
  board[r + 1][c + 1] = br;
  if (rec) {
    // Each piece slides to the next corner: anticlockwise for a left click.
    const corners: [number, number][] = [[r, c], [r, c + 1], [r + 1, c + 1], [r + 1, c]];
    const shift = button === 1 ? 3 : 1;
    rec.add(
      board,
      corners.map((from, i) => ({ piece: before[from[0]][from[1]], from, to: corners[(i + shift) % 4] })),
      140,
    );
  }
  return 1;
}

/** Earthquake: every row slides one cell left (left click) or right, closing gaps, but not past chests. */
function earthquake(board: Board, button: 1 | 3, rng: PyRandom, rec?: StepRecorder): void {
  const sprites: Sprite[] = [];
  const moves = Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));
  // Walk away from the edge the pieces slide towards.
  const edge = button === 1 ? 0 : COLS - 1;
  const step = button === 1 ? 1 : -1;
  const columns = button === 1 ? [1, 2, 3, 4, 5, 6] : [5, 4, 3, 2, 1, 0];
  // The chest cell whose row pair limits the slide: bottom-left going left, bottom-right going right.
  const chestCorner = button === 1 ? ['d', 'i'] : ['f', 'j'];
  for (let r = 0; r < ROWS; r++) moves[r][edge] = CHEST_PIECES.has(board[r][edge]) ? 0 : 1;
  for (const c of columns) {
    for (let r = 0; r < ROWS; r++) {
      moves[r][c] += moves[r][c - step];
      if (board[r][c] === 'z') moves[r][c]++;
      if (chestCorner.includes(board[r][c])) {
        const limit = Math.min(moves[r][c], moves[r - 1][c]);
        moves[r][c] = moves[r - 1][c] = limit;
        // Cells already passed can't move further than the chest.
        for (let z = edge; z !== c; z += step) {
          if (moves[r][z] > limit) moves[r][z] = limit;
          if (moves[r - 1][z] > moves[r - 1][c]) moves[r - 1][z] = moves[r - 1][c];
        }
      }
    }
  }
  for (let r = 0; r < ROWS; r++) {
    if (moves[r][edge] !== 1) continue;
    if (board[r][edge] !== 'z') sprites.push({ piece: board[r][edge], from: [r, edge], to: [r, edge - step], fade: 'out' });
    board[r][edge] = 'z';
  }
  for (const c of columns) {
    for (let r = 0; r < ROWS; r++) {
      const m = moves[r][c];
      if (m > 0 && board[r][c] !== 'z') {
        sprites.push({ piece: board[r][c], from: [r, c], to: [r, c - step * m] });
        board[r][c - step * m] = board[r][c];
        board[r][c] = 'z';
      }
    }
  }
  // reserve_horizontal.py: new pieces slide in from the far edge.
  const far = COLS - 1 - edge;
  for (let r = 0; r < ROWS; r++) {
    for (let i = 0; i < moves[r][far]; i++) {
      board[r][far - step * i] = rng.choice(COLOURS);
      sprites.push({ piece: board[r][far - step * i], from: [r, far - step * i + step * moves[r][far]], to: [r, far - step * i] });
    }
  }
  rec?.add(board, sprites, sprites.length ? fallDuration(sprites) : 0);
}

/** A random starting board for CI and Infinite modes, plus a reserve that may hold tools. */
export function generateRandomBoard(settings: Settings, rng: PyRandom): [Board, Board] {
  const board = emptyBoard();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) board[r][c] = rng.choice(COLOURS);
  const reserve = emptyBoard();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) reserve[r][c] = rng.choice(COLOURS);
  boardCalc(board, reserve, settings, rng, false);
  const [pieces, weights] = dropPool(settings, true);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) reserve[r][c] = rng.choiceWeighted(pieces, weights);
  return [board, reserve];
}

/** puzzles_randomize.py: swaps the five colours of a puzzle for a random permutation. */
export function randomizeColours(puzzle: Board, rng: PyRandom): Board {
  const order: string[] = [];
  while (order.length < 5) {
    const pick = rng.choice(COLOURS);
    if (!order.includes(pick)) order.push(pick);
  }
  return puzzle.map((row) => row.map((p) => (COLOUR_SET.has(p) ? order[COLOURS.indexOf(p as (typeof COLOURS)[number])] : p)));
}

/**
 * Fills a puzzle's "s" cells with random colours, retrying until the board is stable:
 * nothing matches and every fixed cell is as the author placed it.
 */
export function fillPuzzle(puzzle: Board, reserve: Board, settings: Settings, rng: PyRandom): Board {
  for (;;) {
    const board = puzzle.map((row) => row.map((p) => (p === 's' ? rng.choice(COLOURS) : p)));
    boardCalc(board, reserve, settings, rng);
    let ok = true;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (puzzle[r][c] !== 's' ? board[r][c] !== puzzle[r][c] : board[r][c] === 'z') ok = false;
      }
    }
    if (ok) return board;
  }
}

/** Scramble_keys.py: cells marked 0 keep their colour when a puzzle is scrambled. */
const SCRAMBLE_KEYS: Record<number, readonly string[]> = {
  1: ['1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111100', '1111100', '1111100', '1111000'],
  3: ['1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111100'],
  10: ['1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111101', '1111010'],
  23: ['1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111111', '1111100', '1111000'],
  27: ['1111111', '1111111', '1111111', '1111111', '1111111', '1101111', '1001111', '1001111', '0001111', '1001111'],
};

/** Re-rolls every colour of a puzzle (except its key cells), retrying until the result is stable. */
export function scramblePuzzle(id: number, puzzle: Board, reserve: Board, settings: Settings, rng: PyRandom): Board {
  const key = SCRAMBLE_KEYS[id];
  const scrambled = (r: number, c: number) => (!key || key[r][c] === '1') && (COLOUR_SET.has(puzzle[r][c]) || puzzle[r][c] === 's');
  for (;;) {
    const board = puzzle.map((row, r) => row.map((p, c) => (scrambled(r, c) ? rng.choice(COLOURS) : p)));
    boardCalc(board, reserve, settings, rng);
    let ok = true;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!scrambled(r, c)) {
          if (board[r][c] !== puzzle[r][c]) ok = false;
        } else if (board[r][c] === 'z' && puzzle[r][c] !== 'z') ok = false;
      }
    }
    if (ok) return board;
  }
}

// ---- Chest spawning (board_calc.try_spawn_chest and the CI loop in app.pyw) ----

/** Chance of a bone box, jar or chest at each forage level, from app.pyw. */
export const CHEST_WEIGHTINGS: readonly (readonly [number, number, number])[] = [
  [0.33, 0.33, 0.33],
  [0.91, 0.09, 0],
  [0.71, 0.218, 0.072],
  [0.6, 0.291, 0.109],
  [0.523, 0.343, 0.134],
  [0.463, 0.382, 0.155],
  [0.414, 0.415, 0.171],
  [0.373, 0.443, 0.184],
  [0.337, 0.467, 0.196],
  [0.305, 0.488, 0.207],
  [0.277, 0.507, 0.216],
  [0.251, 0.524, 0.225],
  [0.228, 0.539, 0.233],
  [0.206, 0.554, 0.24],
  [0.186, 0.567, 0.247],
  [0.168, 0.579, 0.253],
];

/** 1 bone box, 2 jar, 3 chest. */
export type ChestKind = 1 | 2 | 3;

export interface ChestSpawner {
  kinds: ChestKind[];
  weights: number[];
  next: ChestKind;
  column: number;
  movesSinceLast: number;
}

function pickColumn(kind: ChestKind, rng: PyRandom): number {
  return rng.choice(Array.from({ length: 8 - kind }, (_, i) => i));
}

export function createSpawner(settings: Settings, rng: PyRandom): ChestSpawner | null {
  const kinds: ChestKind[] = [];
  const weights: number[] = [];
  const level = CHEST_WEIGHTINGS[settings.forageLevel];
  ([settings.bb, settings.fj, settings.cc] as const).forEach((on, i) => {
    if (on) {
      kinds.push((i + 1) as ChestKind);
      weights.push(level[i]);
    }
  });
  if (!kinds.length) return null;
  const next = rng.choiceWeighted(kinds, weights);
  return { kinds, weights, next, column: pickColumn(next, rng), movesSinceLast: -1 };
}

/** Counts [total, bone boxes, jars, chests] by their top-left letters. */
export function countChests(board: Board): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const row of board) {
    for (const p of row) {
      if (p === 'a') counts[3]++;
      if (p === 'g') counts[2]++;
      if (p === 'k') counts[1]++;
      if (p === 'a' || p === 'g' || p === 'k') counts[0]++;
    }
  }
  return counts;
}

function blocked(board: Board, kind: ChestKind, column: number): boolean {
  const height = kind === 1 ? 1 : 2;
  for (let r = 0; r < height; r++) {
    for (let i = 0; i < kind; i++) if (!COLOUR_SET.has(board[r][column + i])) return true;
  }
  return false;
}

function placeChest(board: Board, kind: ChestKind, column: number): void {
  const shape = kind === 1 ? ['k'] : kind === 2 ? ['gh', 'ij'] : ['abc', 'def'];
  shape.forEach((row, r) => row.split('').forEach((p, i) => (board[r][column + i] = p)));
}

function trySpawn(board: Board, s: ChestSpawner, rng: PyRandom): void {
  let isBlocked = blocked(board, s.next, s.column);
  if (isBlocked && s.movesSinceLast >= 3) {
    // After three blocked moves, try every column in a random order (the last one tried wins).
    const columns = rng.shuffle(Array.from({ length: 8 - s.next }, (_, i) => i));
    for (const column of columns) {
      s.column = column;
      isBlocked = blocked(board, s.next, column);
    }
  } else if (isBlocked) {
    return;
  }
  if (isBlocked) return;
  placeChest(board, s.next, s.column);
  s.next = rng.choiceWeighted(s.kinds, s.weights);
  s.movesSinceLast = 0;
  s.column = pickColumn(s.next, rng);
}

/** Called after each move outside puzzle mode: maybe drops the next chest in at the top. */
export function afterMove(board: Board, s: ChestSpawner, rng: PyRandom): void {
  const onBoard = countChests(board);
  s.movesSinceLast++;
  if (s.movesSinceLast >= 2 && onBoard[0] < 3) {
    if (
      (s.next === 3 && onBoard[2] === 0 && onBoard[3] < 1) ||
      (s.next === 2 && onBoard[3] === 0 && onBoard[2] < 2) ||
      s.next === 1
    ) {
      trySpawn(board, s, rng);
    }
  }
  if (onBoard[0] === 3) s.movesSinceLast = -1;
}
