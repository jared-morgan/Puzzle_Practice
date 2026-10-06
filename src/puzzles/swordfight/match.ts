// A fight: you (fighter 0) against training opponents, or on your own. Deals the pairs, passes each
// attack to its target, and decides when the fight is over. How pairs are dealt and when attacks
// are sent are choices made here (see docs/swordfight-findings.md).
import { PyRandom } from '../../core/pyrandom';
import type { Attack } from './attack';
import { BREAKER } from './board';
import { Fighter, type FighterHooks, type SoundName } from './fighter';
import { GameNpc, type GameStyle, Npc, type NpcStyle } from './npc';
import { type Shaft, type Strike, Sword } from './strikes';

export interface MatchSettings {
  /** 0 is practice on your own. */
  opponents: number;
  /** 0-10, the fight's AI skill level: a preset for `ai`. */
  skill: number;
  /** Which kind of opponent: one that stores breakers for combos, or one on the game's AI numbers. */
  opponentType: 'tally' | 'game';
  /** How each kind plays. */
  ai: NpcStyle;
  gameAi: GameStyle;
  /** The puzzle difficulty that sets the starting speed (0.01 x (difficulty + 1) pixels per ms). */
  difficulty: number;
  /** Chance a dealt piece is a breaker, in percent. */
  breakers: number;
  /** Your sword and the opponents' (type, primary colour, secondary colour). */
  sword: [number, number, number];
  enemySword: [number, number, number];
}

/** Each fighter gets the same pairs in the same order, from a generator seeded alike. */
class Dealer {
  private readonly rng: PyRandom;
  private readonly queue: Array<[number, number]> = [];

  constructor(seed: number, private readonly breakerChance: number) {
    this.rng = new PyRandom(seed);
  }

  private piece(): number {
    const c = this.rng.randintN(0, 3);
    return this.rng.random() * 100 < this.breakerChance ? c | BREAKER : c;
  }

  private fill(): void {
    while (this.queue.length < 2) this.queue.push([this.piece(), this.piece()]);
  }

  next(): [number, number] {
    this.fill();
    return this.queue.shift()!;
  }

  peek(): [number, number] {
    this.fill();
    return this.queue[0];
  }
}

export interface MatchEvents {
  sound?(name: SoundName | 'self_knocked_out' | 'opponent_knocked_out' | 'win' | 'lose' | 'fanfare', fighter: number): void;
  message?(text: string, fighter: number): void;
}

/** Names for the opponents. */
const BOT_NAMES = ['TrainingBot', 'Bilgerat', 'Barnacle', 'Scurvydog', 'Grogbelly', 'Plankwalker'];

export class Match {
  readonly fighters: Array<Fighter | Npc | GameNpc> = [];
  readonly swords: Sword[] = [];
  readonly names: string[] = [];
  /** Who you're attacking (TeamPuzzleController targets). */
  target = 1;
  result: 'won' | 'lost' | null = null;
  endedAt = 0;
  /** When the boards had finished moving after the fight ended. */
  settledAt = 0;
  private readonly strikeIds: PyRandom;
  private readonly shaftIds: number[] = [];
  private readonly knockedOut = new Set<number>();

  constructor(readonly settings: MatchSettings, readonly seed: number, readonly startedAt: number, private readonly events: MatchEvents = {}) {
    this.strikeIds = new PyRandom(seed ^ 0x5f3759df);
    const count = 1 + settings.opponents;
    for (let i = 0; i < count; i++) {
      const dealer = new Dealer(seed, settings.breakers);
      const [type, primary, secondary] = i === 0 ? settings.sword : settings.enemySword;
      this.swords.push(new Sword(type, primary, secondary));
      this.names.push(i === 0 ? 'You' : BOT_NAMES[(i - 1) % BOT_NAMES.length]);
      this.shaftIds.push(0);
      const hooks: FighterHooks = {
        sound: (name) => this.events.sound?.(name, i),
        message: (text) => this.events.message?.(text, i),
        attack: (attack) => this.send(i, attack),
        nextPair: () => dealer.next(),
        peekPair: () => dealer.peek(),
        swordOf: (from) => this.swords[from] ?? null,
      };
      this.fighters.push(i === 0
        ? new Fighter(i, settings.difficulty, hooks, startedAt)
        : this.opponent(i, hooks, seed, startedAt));
    }
  }

  private opponent(i: number, hooks: FighterHooks, seed: number, startedAt: number): Npc | GameNpc {
    const rng = new PyRandom(seed + i * 7919);
    const npcHooks = { nextPair: hooks.nextPair, attack: hooks.attack! };
    if (this.settings.opponentType === 'tally') return new Npc(i, this.settings.ai, rng, npcHooks, startedAt);
    const npc = new GameNpc(i, this.settings.gameAi, rng, npcHooks, startedAt);
    npc.targeted = () => this.target === i;
    return npc;
  }

  get player(): Fighter {
    return this.fighters[0] as Fighter;
  }

  /** The opponents still standing. */
  alive(): number[] {
    return this.fighters.filter((f) => f.index > 0 && !f.out).map((f) => f.index);
  }

  /** Steps the target through the opponents still in (target_next_player / target_prev_player). */
  cycleTarget(step: number): void {
    const alive = this.alive();
    if (!alive.length) return;
    const at = alive.indexOf(this.target);
    this.target = alive[((at < 0 ? 0 : at + step) % alive.length + alive.length) % alive.length];
  }

  setTarget(index: number): void {
    if (this.alive().includes(index)) this.target = index;
  }

  private send(from: number, attack: Attack): void {
    if (this.result) return;
    const to = from === 0 ? this.target : 0;
    const target = this.fighters[to];
    if (!target || target.out || to === from) return;
    this.shaftIds[from] = (this.shaftIds[from] + 1) & 0xff;
    const strikes: Strike[] = attack.swords.map(([width, height]) => ({
      id: this.strikeIds.randintN(0, 255), width, height, x: 0, y: 0, orient: 0, pieces: [],
    }));
    const shaft: Shaft = { from, id: this.shaftIds[from], strikes, sprinkles: attack.sprinkles };
    target.receive(shaft);
  }

  update(now: number): void {
    // After the fight, your board finishes falling and clearing, then everything stops.
    if (this.result) {
      if (this.settledAt) return;
      const player = this.player;
      player.update(now);
      if (player.out || (!player.pair && player.idle(now))) this.settledAt = now;
      return;
    }
    for (const f of this.fighters) f.update(now);
    for (const f of this.fighters) {
      if (f.out && !this.knockedOut.has(f.index)) {
        this.knockedOut.add(f.index);
        if (f.index === 0) {
          this.events.message?.('Ye be knocked out!', 0);
          this.events.sound?.('self_knocked_out', 0);
        } else if (!this.result) {
          if (f.index === this.target) this.events.message?.(`${this.names[f.index]} was knocked out!`, 0);
          this.events.sound?.('opponent_knocked_out', 0);
        }
      }
    }
    if (!this.alive().includes(this.target)) this.cycleTarget(1);
    if (this.result) return;
    if (this.player.out) this.finish('lost', now);
    else if (this.settings.opponents > 0 && !this.alive().length) this.finish('won', now);
  }

  private finish(result: 'won' | 'lost', now: number): void {
    this.result = result;
    this.endedAt = now;
    this.player.halted = true;
    if (this.settings.opponents === 0) return;
    this.events.message?.(result === 'won' ? 'Ye be the victor!' : 'Ye be defeated!', 0);
    this.events.sound?.(result === 'won' ? 'win' : 'lose', 0);
  }
}
