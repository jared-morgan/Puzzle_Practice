// A fight: you (fighter 0) against training opponents, or on your own. Deals the pairs, passes each
// finished cascade's attack to its target, and decides when the fight is over. The game's server
// does this part and isn't in the client, so the dealing and the timing of attacks are choices made
// here (see docs/swordfight-client-findings.md).
import { PyRandom } from '../../core/pyrandom';
import { Bot } from './ai';
import type { Attack } from './attack';
import { BREAKER } from './board';
import { Fighter, type FighterHooks, type SoundName } from './fighter';
import { type Shaft, type Strike, Sword } from './strikes';

export interface MatchSettings {
  /** 0 is practice on your own. */
  opponents: number;
  /** 0-10, the client's AI skill level. */
  skill: number;
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

export class Match {
  readonly fighters: Fighter[] = [];
  readonly swords: Sword[] = [];
  readonly bots: Bot[] = [];
  readonly names: string[] = [];
  /** Who you're attacking (TeamPuzzleController targets). */
  target = 1;
  result: 'won' | 'lost' | null = null;
  endedAt = 0;
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
      this.names.push(i === 0 ? 'You' : `Bot ${i}`);
      this.shaftIds.push(0);
      const hooks: FighterHooks = {
        sound: (name) => this.events.sound?.(name, i),
        message: (text) => this.events.message?.(text, i),
        attack: (attack) => this.send(i, attack),
        nextPair: () => dealer.next(),
        peekPair: () => dealer.peek(),
        swordOf: (from) => this.swords[from] ?? null,
      };
      const fighter = new Fighter(i, settings.difficulty, hooks, startedAt);
      this.fighters.push(fighter);
      if (i > 0) this.bots.push(new Bot(fighter, settings.skill, new PyRandom(seed + i * 7919)));
    }
  }

  get player(): Fighter {
    return this.fighters[0];
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
    // The fight ends with the boards as they are.
    if (this.result) return;
    for (const bot of this.bots) bot.update(now);
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
    if (this.settings.opponents === 0) return;
    this.events.message?.(result === 'won' ? 'Ye be the victor!' : 'Ye be defeated!', 0);
    this.events.sound?.(result === 'won' ? 'win' : 'lose', 0);
  }
}
