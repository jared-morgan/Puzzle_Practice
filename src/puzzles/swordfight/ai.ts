// The training opponent. The game's own opponents are run by its server, which isn't in the
// client, so this one plays a real board under the same rules as you: for each pair it tries every
// spot the pair can reach, plays out what would happen, and picks a good one. Its skill (0-10, the
// client's "AI Skill level") sets how quickly it moves and how carefully it chooses.
import { type Attack, addAttack, attackFor, attackSize, emptyAttack } from './attack';
import { Board, colour, EMPTY, fall, findClear, findJoins, H, isBlock, isBreaker, isPlain, NORTH, W } from './board';
import { type Fighter, secondOf } from './fighter';
import type { PyRandom } from '../../core/pyrandom';

export interface Placement {
  /** Clockwise quarter turns from upright, then columns to move (negative is left). */
  turns: number;
  shift: number;
  score: number;
}

/** Where the pair comes to rest falling straight down from where it is. */
function restingRows(board: Board, col: number, row: number, orient: number): { rows: [number, number]; cols: [number, number] } {
  let r = row;
  const second = (rr: number) => secondOf({ col, row: rr, orient });
  for (;;) {
    const [sc, sr] = second(r);
    if (!board.canDrop([r, sr], [col, sc])) break;
    r++;
  }
  const [sc, sr] = second(r);
  return { rows: [r, sr], cols: [col, sc] };
}

/** Plays a landing out to the end without timing, the way Fighter does: fall, join, clear, again. */
export function playOut(board: Board): { attack: Attack; chain: number } {
  const attack = emptyAttack();
  let chain = 0;
  for (let guard = 0; guard < 200; guard++) {
    if (fall(board).length) continue;
    const joins = findJoins(board);
    if (joins.length) {
      for (const b of joins) board.setBlock(b.colour, b.x, b.y, b.w, b.h);
      continue;
    }
    const clear = findClear(board, chain);
    if (!clear.cells.length) break;
    for (const c of clear.cells) board.set(c.x, c.y, EMPTY);
    chain++;
    addAttack(attack, attackFor(clear, chain));
  }
  return { attack, chain };
}

/** What the bot values; tuned by playing practice games on its own. */
export const WEIGHTS = { attack: 8, chain: 4, height: 4.5, tallest: 0.6, middle: 40, same: 3, mixed: 1, block: 2 };
type Weights = typeof WEIGHTS;

/** Everything that makes the bot harder or easier. AI skill (0-10) is a preset of these. */
export interface BotStyle {
  /** How long it looks at each pair before moving it, in ms (varies by a quarter either way). */
  thinkMs: number;
  /** How often it misjudges, 0-100: noise on its scores up to a quarter of their spread at 100. */
  mistakes: number;
  /** How many of its best spots it checks against the next pair; 0 doesn't look ahead. */
  lookAhead: number;
  /** Drops the pair fast once it's in place. */
  fastDrop: boolean;
  /** Percent of the normal weight it puts on attacking now, on building blocks and colour groups, and on keeping its stack low. */
  attack: number;
  build: number;
  safety: number;
}

export function skillStyle(skill: number): BotStyle {
  return {
    thinkMs: 1400 - skill * 120,
    mistakes: (10 - skill) * 10,
    lookAhead: skill >= 4 ? Math.min(7, 2 + Math.floor(skill / 2)) : 0,
    fastDrop: true,
    attack: 100,
    build: 100,
    safety: 100,
  };
}

function weightsFor(style: BotStyle): Weights {
  const a = style.attack / 100;
  const b = style.build / 100;
  const s = style.safety / 100;
  const w = WEIGHTS;
  return { attack: w.attack * a, chain: w.chain * a, height: w.height * s, tallest: w.tallest * s, middle: w.middle * s, same: w.same * b, mixed: w.mixed * b, block: w.block * b };
}

/** How good a board is to be left with. */
function judge(board: Board, attack: Attack, chain: number, k: Weights): number {
  const levels = board.columnLevels();
  let score = attackSize(attack) * k.attack + chain * k.chain;
  const tallest = Math.max(...levels);
  score -= levels.reduce((n, h) => n + h, 0) * k.height;
  score -= tallest * tallest * k.tallest;
  // The fourth column must stay clear for the next pair.
  if (levels[3] > 7) score -= (levels[3] - 7) * k.middle;
  // Fused blocks and same-coloured neighbours are attacks in the making; mixed colours get in the way.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = board.get(x, y);
      if (p === EMPTY) continue;
      if (isBlock(p)) score += k.block;
      if (!isPlain(p) && !isBreaker(p)) continue;
      for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
        if (nx >= W || ny >= H) continue;
        const q = board.get(nx, ny);
        if (q === EMPTY || (!isPlain(q) && !isBreaker(q))) continue;
        if (colour(q) === colour(p)) score += isBreaker(p) || isBreaker(q) ? 0 : k.same;
        else score -= k.mixed;
      }
    }
  }
  return score;
}

interface Option {
  turns: number;
  shift: number;
  board: Board;
  attack: Attack;
  chain: number;
  score: number;
}

/** Every spot a pair can reach from where it is, played out and judged (turning first, then stepping sideways, as the bot presses the keys). */
function options(start: Board, col0: number, row0: number, orient0: number, pieces: readonly number[], k: Weights): Option[] {
  const found: Option[] = [];
  for (let turns = 0; turns < 4; turns++) {
    let state: [number, number, number] | null = [orient0, col0, row0];
    for (let t = 0; t < turns && state; t++) {
      const turned = start.turnPair(state[2], state[1], state[0], true, 0, false);
      state = turned ? [turned[0], turned[1], turned[2]] : null;
    }
    if (!state) continue;
    const [orient, turnedCol, row] = state;
    for (const dir of [0, -1, 1]) {
      let col = turnedCol;
      for (let steps = dir === 0 ? 0 : 1; steps < (dir === 0 ? 1 : W); steps++) {
        const [sc, sr] = secondOf({ col, row, orient });
        if (dir !== 0) {
          if (!start.canMove(Math.min(col, sc), Math.max(row, sr), col === sc ? 1 : 2, row === sr ? 1 : 2, dir, 0)) break;
          col += dir;
        }
        const rest = restingRows(start, col, row, orient);
        const board = start.clone();
        board.ageStrikes();
        for (let i = 0; i < 2; i++) {
          if (rest.rows[i] >= 0 && board.inBounds(rest.cols[i], rest.rows[i])) board.set(rest.cols[i], rest.rows[i], pieces[i]);
        }
        const { attack, chain } = playOut(board);
        found.push({ turns, shift: col - col0, board, attack, chain, score: judge(board, attack, chain, k) });
      }
    }
  }
  return found;
}

/** The bot's pick for the falling pair, or null. Skilled bots also look at the next pair. */
export function choose(fighter: Fighter, style: BotStyle, rng: PyRandom): Placement | null {
  const k = weightsFor(style);
  const pair = fighter.pair;
  if (!pair) return null;
  const first = options(fighter.board, pair.col, pair.row, pair.orient, pair.pieces, k);
  if (!first.length) return null;
  const next = fighter.next;
  if (next && style.lookAhead > 0) {
    // Look ahead at the most promising few: what's the best the next pair can do after each?
    const ahead = Math.min(first.length, style.lookAhead);
    const ranked = [...first].sort((a, b) => b.score - a.score).slice(0, ahead);
    const floor = Math.min(...first.map((o) => o.score));
    for (const o of first) if (!ranked.includes(o)) o.score = floor - 1000;
    for (const o of ranked) {
      const replies = options(o.board, 3, o.board.isRowEmpty(1) ? 0 : -1, NORTH, next, k);
      const best = replies.length ? Math.max(...replies.map((r) => r.score)) : o.score - 1000;
      o.score = attackSize(o.attack) * k.attack + best;
    }
  }
  // Mistakes: noise on every score, up to a quarter of the spread at 100.
  const scores = first.map((o) => o.score).filter((n) => n > -Infinity);
  const spread = Math.max(...scores) - Math.min(...scores);
  const noise = (spread * style.mistakes) / 400;
  let best = first[0];
  let bestScore = -Infinity;
  for (const o of first) {
    const sc = o.score + (rng.random() * 2 - 1) * noise;
    if (sc > bestScore) {
      bestScore = sc;
      best = o;
    }
  }
  return { turns: best.turns, shift: best.shift, score: best.score };
}

/** Drives one fighter: waits, turns and moves the pair to its pick, then drops it. */
export class Bot {
  private plannedFor: object | null = null;
  private actAt = 0;
  private plan: Placement | null = null;

  constructor(readonly fighter: Fighter, readonly style: BotStyle, private readonly rng: PyRandom) {}

  update(now: number): void {
    const f = this.fighter;
    const pair = f.pair;
    if (!pair || f.out) return;
    if (this.plannedFor !== pair) {
      this.plannedFor = pair;
      this.plan = choose(f, this.style, this.rng);
      this.actAt = now + this.style.thinkMs * (0.75 + this.rng.random() * 0.5);
      f.setFast(false, now);
      return;
    }
    if (this.plan && now >= this.actAt) {
      for (let t = 0; t < this.plan.turns; t++) f.rotate(true, now);
      const dir = Math.sign(this.plan.shift);
      for (let s = 0; s < Math.abs(this.plan.shift); s++) f.move(dir, now);
      if (this.style.fastDrop) f.setFast(true, now);
      this.plan = null;
    }
  }
}
