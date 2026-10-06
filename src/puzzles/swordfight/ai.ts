// The training opponent. The game's own opponents are run by its server, which isn't in the
// client, so this one plays a real board under the same rules as you: for each pair it tries every
// spot the pair can reach, plays out what would happen, and picks a good one. Its skill (0-10, the
// client's "AI Skill level") sets how quickly it moves and how carefully it chooses.
import { type Attack, addAttack, attackFor, attackSize, emptyAttack } from './attack';
import { Board, colour, EMPTY, fall, findClear, findJoins, H, isBlock, isBreaker, isPlain, W } from './board';
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

/** How good a board is to be left with. */
function judge(board: Board, attack: Attack, chain: number, skill: number): number {
  const levels = board.columnLevels();
  let score = attackSize(attack) * (6 + skill * 0.4) + chain * 4;
  const tallest = Math.max(...levels);
  score -= levels.reduce((n, h) => n + h, 0) * 1.5;
  score -= tallest * tallest * 0.6;
  if (levels[3] > 8) score -= (levels[3] - 8) * 60;
  // Fused blocks and same-coloured neighbours are attacks in the making, more so to a skilled bot.
  const build = 0.4 + skill * 0.12;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = board.get(x, y);
      if (p === EMPTY) continue;
      if (isBlock(p)) score += build * 3;
      if (isPlain(p) || isBreaker(p)) {
        for (const [nx, ny] of [[x + 1, y], [x, y + 1]]) {
          const q = board.get(nx, ny);
          if (nx < W && ny < H && q !== EMPTY && (isPlain(q) || isBreaker(q)) && colour(q) === colour(p)) score += build * (isBreaker(p) !== isBreaker(q) ? 0.2 : 1.5);
        }
      }
      // A piece with an empty square under it is a gap that's hard to fill.
      if (y < H - 1 && board.get(x, y + 1) === EMPTY) score -= 4;
    }
  }
  return score;
}

/** Every spot the falling pair can reach from where it is, judged; the bot's pick, or null. */
export function choose(fighter: Fighter, skill: number, rng: PyRandom): Placement | null {
  const pair = fighter.pair;
  if (!pair) return null;
  const options: Placement[] = [];
  for (let turns = 0; turns < 4; turns++) {
    // Turn first, as the bot would press the keys, then step sideways one column at a time.
    let state: [number, number, number] | null = [pair.orient, pair.col, pair.row];
    for (let t = 0; t < turns && state; t++) {
      const turned = fighter.board.turnPair(state[2], state[1], state[0], true, 0, false);
      state = turned ? [turned[0], turned[1], turned[2]] : null;
    }
    if (!state) continue;
    const [orient, col0, row] = state;
    for (const dir of [0, -1, 1]) {
      let col = col0;
      for (let steps = 0; steps < W; steps++) {
        if (dir !== 0 || steps === 0) {
          if (steps > 0) {
            const [sc, sr] = secondOf({ col, row, orient });
            const x = Math.min(col, sc);
            const y = Math.max(row, sr);
            if (!fighter.board.canMove(x, y, col === sc ? 1 : 2, row === sr ? 1 : 2, dir, 0)) break;
            col += dir;
          }
          const rest = restingRows(fighter.board, col, row, orient);
          const board = fighter.board.clone();
          board.ageStrikes();
          for (let i = 0; i < 2; i++) {
            if (rest.rows[i] >= 0 && board.inBounds(rest.cols[i], rest.rows[i])) board.set(rest.cols[i], rest.rows[i], pair.pieces[i]);
          }
          const { attack, chain } = playOut(board);
          options.push({ turns, shift: col - pair.col, score: judge(board, attack, chain, skill) });
        }
        if (dir === 0) break;
      }
    }
  }
  if (!options.length) return null;
  // Less skilled bots misjudge: noise on every score, up to a quarter of the spread at skill 0.
  const spread = Math.max(...options.map((o) => o.score)) - Math.min(...options.map((o) => o.score));
  const noise = (spread * (10 - skill)) / 40;
  let best = options[0];
  let bestScore = -Infinity;
  for (const o of options) {
    const s = o.score + (rng.random() * 2 - 1) * noise;
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  return best;
}

/** How long the bot looks at a pair before moving it. */
export const thinkMs = (skill: number) => 1400 - skill * 120;

/** Drives one fighter: waits, turns and moves the pair to its pick, then drops it. */
export class Bot {
  private plannedFor: object | null = null;
  private actAt = 0;
  private plan: Placement | null = null;

  constructor(readonly fighter: Fighter, readonly skill: number, private readonly rng: PyRandom) {}

  update(now: number): void {
    const f = this.fighter;
    const pair = f.pair;
    if (!pair || f.out) return;
    if (this.plannedFor !== pair) {
      this.plannedFor = pair;
      this.plan = choose(f, this.skill, this.rng);
      this.actAt = now + thinkMs(this.skill) * (0.75 + this.rng.random() * 0.5);
      f.setFast(false, now);
      return;
    }
    if (this.plan && now >= this.actAt) {
      for (let t = 0; t < this.plan.turns; t++) f.rotate(true, now);
      const dir = Math.sign(this.plan.shift);
      for (let s = 0; s < Math.abs(this.plan.shift); s++) f.move(dir, now);
      f.setFast(true, now);
      this.plan = null;
    }
  }
}
