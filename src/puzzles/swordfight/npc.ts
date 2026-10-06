// The opponents. They don't play the puzzle: each one keeps the pieces it's dealt on its board as
// a tally of colours, stacked on its lowest column, and never fuses blocks.
//   - A pair comes every `pairMs`. Plain pieces go on the lowest column (ties: columns 1, 6, 2, 5,
//     3, 4).
//   - A breaker may be stored on the board (`storeChance`, up to `comboMax` at once). Otherwise
//     it shatters about `breakAverage` percent of its colour, more the higher the board is
//     (`heightBoost`), taken evenly from the columns centre first. Stored breakers go off with
//     it, up to `comboMax` of them, each shattering its own colour as the next link of a chain.
//   - Each break is sent as an attack: `strikeShare` percent of the shattered pieces as fused
//     blocks (swords), the rest as loose pieces (sprinkles), with the chain multiplier.
//   - Your attacks land on top of its columns as plain pieces, at most one every few of its pairs.
// AI skill is a preset for all of these.
import type { PyRandom } from '../../core/pyrandom';
import { type Attack, swordFor } from './attack';
import { Board, BREAKER, colour, EMPTY, H, isBreaker, W } from './board';
import type { FighterStats } from './fighter';
import type { Shaft } from './strikes';

export interface NpcStyle {
  /** How often it's dealt a pair, in ms. */
  pairMs: number;
  /** How much of its colour a breaker shatters on average, in percent. */
  breakAverage: number;
  /** How far a break varies either way, in percent (a normal spread). */
  variation: number;
  /** How much more a breaker shatters on a full board than an empty one: 2 doubles it at the top. */
  heightBoost: number;
  /** Chance a breaker is stored instead of used, in percent. */
  storeChance: number;
  /** How many stored breakers it keeps, and sets off with its next break. */
  comboMax: number;
  /** How much of a break is sent as swords rather than sprinkles, in percent. */
  strikeShare: number;
  /** Your attacks land at most once per this many of its pairs. */
  pairsPerAttack: number;
}

/** The fight's AI skill levels, 0-10: the least and most of its board an opponent destroys. */
const BASE_DESTROY = [0.07, 0.08, 0.13, 0.18, 0.24, 0.3, 0.38, 0.43, 0.5, 0.55, 0.6];
const MAX_DESTROY = [0.1, 0.25, 0.37, 0.47, 0.52, 0.6, 0.63, 0.65, 0.69, 0.69, 0.7];

export function skillStyle(skill: number): NpcStyle {
  return {
    pairMs: 2000 - skill * 125,
    breakAverage: Math.round(100 * BASE_DESTROY[skill]),
    variation: 15,
    heightBoost: Math.round((MAX_DESTROY[skill] / BASE_DESTROY[skill]) * 10) / 10,
    storeChance: 10 + skill * 4,
    comboMax: Math.floor(skill / 3),
    strikeShare: 50,
    pairsPerAttack: 3,
  };
}

/** Columns for its own pieces and the leftovers of attacks: edges first. Clearing goes the other way. */
const FILL_ORDER = [0, 5, 1, 4, 2, 3];
const CLEAR_ORDER = [3, 2, 4, 1, 5, 0];

/** Fused block shapes it can break, 2x2 up to 6x8. */
const GEM_SHAPES: Array<[number, number]> = [];
for (let h = 2; h <= 8; h++) for (let w = 2; w <= W; w++) GEM_SHAPES.push([w, h]);

export interface NpcHooks {
  nextPair(): [number, number];
  attack(attack: Attack): void;
}

export class Npc {
  board = new Board();
  out = false;
  stats: FighterStats = { pairs: 0, shattered: 0, bestChain: 0, sent: 0, received: 0, swordsSent: 0, biggestSword: 0 };
  private nextAt: number;
  private incoming: number[] = [];
  private pairsSinceAttack = 0;

  constructor(readonly index: number, readonly style: NpcStyle, private readonly rng: PyRandom, private readonly hooks: NpcHooks, started: number) {
    this.nextAt = started + style.pairMs;
  }

  receive(shaft: Shaft): void {
    if (this.out) return;
    const amount = shaft.sprinkles + shaft.strikes.reduce((n, s) => n + s.width * s.height, 0);
    if (amount > 0) this.incoming.push(amount);
  }

  update(now: number): void {
    while (!this.out && now >= this.nextAt) {
      this.step();
      this.nextAt += Math.max(50, this.style.pairMs);
    }
  }

  private gauss(): number {
    const u = Math.max(1e-12, this.rng.random());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng.random());
  }

  private height(x: number): number {
    let n = 0;
    for (let y = 0; y < H; y++) if (this.board.get(x, y) !== EMPTY) n++;
    return n;
  }

  /** Puts a piece on top of a column; false if it's full. */
  private stack(x: number, piece: number): boolean {
    const h = this.height(x);
    if (h >= H) return false;
    this.board.set(x, H - 1 - h, piece);
    return true;
  }

  /** Lets every column's pieces fall to the bottom. */
  private compact(): void {
    for (let x = 0; x < W; x++) {
      let write = H - 1;
      for (let y = H - 1; y >= 0; y--) {
        const p = this.board.get(x, y);
        if (p === EMPTY) continue;
        if (write !== y) this.board.set(x, write, p);
        write--;
      }
      while (write >= 0) this.board.set(x, write--, EMPTY);
    }
  }

  private count(c: number): number {
    let n = 0;
    for (const p of this.board.cells) if (p !== EMPTY && !isBreaker(p) && colour(p) === c) n++;
    return n;
  }

  private stored(): number[] {
    return Array.from(this.board.cells).filter((p) => p !== EMPTY && isBreaker(p));
  }

  /** Takes a stored breaker of colour c off the board. */
  private useStored(c: number): void {
    const i = this.board.cells.findIndex((p) => p !== EMPTY && isBreaker(p) && colour(p) === c);
    if (i >= 0) this.board.cells[i] = EMPTY;
  }

  /** Shatters part of a colour, taken evenly from the columns, centre first. */
  private shatter(c: number): number {
    const matching = this.count(c);
    if (!matching) return 0;
    const s = this.style;
    // The higher the board, the more it breaks: up to heightBoost times as much when full.
    const fill = this.board.cells.filter((p) => p !== EMPTY).length / (W * H);
    const boost = 1 + (s.heightBoost - 1) * fill;
    const percent = Math.max(0, Math.min(100, Math.round((s.breakAverage + this.gauss() * s.variation) * boost)));
    const target = Math.round((matching * percent) / 100);
    let removed = 0;
    while (removed < target) {
      let took = false;
      for (const x of CLEAR_ORDER) {
        if (removed >= target) break;
        for (let y = 0; y < H; y++) {
          const p = this.board.get(x, y);
          if (p !== EMPTY && !isBreaker(p) && colour(p) === c) {
            this.board.set(x, y, EMPTY);
            removed++;
            took = true;
            break;
          }
        }
      }
      if (!took) break;
    }
    return removed;
  }

  /** One pair dealt: its pieces stacked or set off, then any of your attacks that are due. */
  private step(): void {
    const pair = this.hooks.nextPair();
    this.stats.pairs++;
    const breaks: number[] = [];
    const plain: number[] = [];
    for (const piece of pair) {
      const c = colour(piece);
      if (!isBreaker(piece)) {
        plain.push(c);
        continue;
      }
      if (this.stored().length < this.style.comboMax && this.rng.random() * 100 < this.style.storeChance) {
        plain.push(c | BREAKER);
        continue;
      }
      // The breaker goes off, then the stored ones with it, each the next link of the chain.
      const first = this.shatter(c) + 1;
      breaks.push(first);
      for (const saved of this.stored().slice(0, this.style.comboMax)) {
        const sc = colour(saved);
        this.useStored(sc);
        breaks.push(this.shatter(sc) + 1);
      }
    }
    if (breaks.length) this.compact();
    // Own pieces go on the lowest column; ties go to the first in FILL_ORDER.
    for (const piece of plain) {
      let best = -1;
      let bestHeight = Infinity;
      for (const x of FILL_ORDER) {
        const h = this.height(x);
        if (h < H && h < bestHeight) {
          best = x;
          bestHeight = h;
        }
      }
      if (best < 0) break;
      this.stack(best, piece);
    }
    this.stats.shattered += breaks.reduce((n, b) => n + b, 0);
    this.stats.bestChain = Math.max(this.stats.bestChain, breaks.length);
    breaks.forEach((cleared, i) => this.send(cleared, i + 1));
    this.checkOut();
    if (!this.out) this.landIncoming();
  }

  /** A break as an attack: about strikeShare percent of it as fused blocks, the rest loose. */
  private send(cleared: number, link: number): void {
    // Each attack varies a little around the style, except all-or-nothing styles.
    const base = this.style.strikeShare / 100;
    const share = Math.max(0, Math.min(1, base + this.gauss() * 0.1 * Math.min(1, 4 * base * (1 - base))));
    let budget = Math.round(cleared * share);
    let used = 0;
    const swords: Array<[number, number]> = [];
    while (budget >= 4) {
      const gem = this.pickGem(budget);
      if (!gem) break;
      swords.push(swordFor(gem[0], gem[1], link));
      budget -= gem[0] * gem[1];
      used += gem[0] * gem[1];
    }
    const sprinkles = Math.floor(Math.max(0, cleared - used) / 2) * link;
    if (!swords.length && !sprinkles) return;
    const attack: Attack = { swords, sprinkles };
    this.stats.sent += sprinkles + swords.reduce((n, [w, h]) => n + w * h, 0);
    this.stats.swordsSent += swords.length;
    for (const [w, h] of swords) this.stats.biggestSword = Math.max(this.stats.biggestSword, w * h);
    this.hooks.attack(attack);
  }

  /** Small blocks are most common, two-wide towers and squares a little more so. */
  private pickGem(budget: number): [number, number] | null {
    const weights = GEM_SHAPES.map(([w, h]) => {
      if (w * h > budget) return 0;
      let weight = 1 / Math.pow(w * h, 0.9);
      if (w === 2) weight *= 1.4;
      if (w === h) weight *= 1.2;
      return weight;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) return null;
    let roll = this.rng.random() * total;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      roll -= weights[i];
      if (roll < 0) return GEM_SHAPES[i];
    }
    for (let i = weights.length - 1; i >= 0; i--) if (weights[i] > 0) return GEM_SHAPES[i];
    return null;
  }

  /** Your oldest attack lands once enough of its pairs have passed: an even share on every column, leftovers edges first. */
  private landIncoming(): void {
    if (this.pairsSinceAttack < this.style.pairsPerAttack) this.pairsSinceAttack++;
    if (this.pairsSinceAttack < this.style.pairsPerAttack) return;
    const amount = this.incoming.shift();
    if (amount === undefined) return;
    this.pairsSinceAttack = 0;
    this.stats.received += amount;
    this.compact();
    const share = new Array<number>(W).fill(Math.floor(amount / W));
    for (let i = 0; i < amount % W; i++) share[FILL_ORDER[i % W]]++;
    let overflow = 0;
    for (const x of FILL_ORDER) {
      for (let i = 0; i < share[x]; i++) if (!this.stack(x, this.rng.randintN(0, 3))) overflow++;
    }
    while (overflow > 0) {
      let fitted = false;
      for (const x of FILL_ORDER) {
        if (overflow === 0) break;
        if (this.stack(x, this.rng.randintN(0, 3))) {
          overflow--;
          fitted = true;
        }
      }
      if (!fitted) break;
    }
    this.checkOut();
  }

  /** Knocked out, like you, when the top of its fourth column is filled. */
  private checkOut(): void {
    if (this.board.get(3, 0) !== EMPTY) this.out = true;
  }
}
