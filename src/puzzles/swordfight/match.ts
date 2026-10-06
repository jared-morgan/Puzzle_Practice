// A fight: your team (you, fighter 0, and any thralls and skilled swabbies) against cultists and
// homunculi, or you on your own. Deals the pairs, passes each attack to its target, and decides when
// the fight is over. How pairs are dealt and when attacks are sent are choices made here (see
// docs/swordfight-findings.md).
import { PyRandom } from '../../core/pyrandom';
import type { Attack } from './attack';
import { BREAKER } from './board';
import { Fighter, type FighterHooks, type SoundName } from './fighter';
import { GameNpc, type GameStyle, gameSkillStyle, Npc, type NpcStyle, skillStyle } from './npc';
import { PLAIN_SWORDS, type Shaft, type Strike, Sword } from './strikes';

export interface MatchSettings {
  /** Enemies: cultists (spears) and homunculi (tree trunks); none is practice on your own. */
  cultists: number;
  homunculi: number;
  /** cultists + homunculi. */
  opponents: number;
  /** Allies on your team: thralls and skilled swabbies. */
  thralls: number;
  swabbies: number;
  /** Each kind's AI skill, 0 to 100. */
  cultistSkill: number;
  homunculusSkill: number;
  thrallSkill: number;
  swabbieSkill: number;
  /** Which kind of AI: one that stores breakers for combos, or one on the game's AI numbers. */
  opponentType: 'tally' | 'game';
  /** How each kind of AI plays, apart from what its skill sets. */
  ai: NpcStyle;
  gameAi: GameStyle;
  /** The puzzle difficulty that sets the starting speed (0.01 x (difficulty + 1) pixels per ms). */
  difficulty: number;
  /** Chance a dealt piece is a breaker, in percent. */
  breakers: number;
  /** Your sword (type, primary colour, secondary colour). */
  sword: [number, number, number];
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
  sound?(name: SoundName | 'self_knocked_out' | 'opponent_knocked_out' | 'teammate_knocked_out' | 'win' | 'lose' | 'fanfare', fighter: number): void;
  message?(text: string, fighter: number): void;
}

/** Cultists fight with spears and homunculi with tree trunks; allies with any sword. All in random colours. */
const SPEAR = 16;
const TRUNK = 17;

type Kind = 'Cultist' | 'Homunculus' | 'Thrall' | 'Skilled swabbie';

/** An AI's style: the chosen kind's settings, with what its skill sets on top. */
export function styleFor(settings: MatchSettings, skill: number): { tally: NpcStyle; game: GameStyle } {
  const t = skillStyle(skill);
  const g = gameSkillStyle(skill);
  return {
    tally: { ...settings.ai, breakAverage: t.breakAverage, heightBoost: t.heightBoost, storeChance: t.storeChance, comboMax: t.comboMax },
    game: { ...settings.gameAi, baseDestroy: g.baseDestroy, maxDestroy: g.maxDestroy, chainChance: g.chainChance },
  };
}

export class Match {
  readonly fighters: Array<Fighter | Npc | GameNpc> = [];
  readonly swords: Sword[] = [];
  readonly names: string[] = [];
  /** 0 for your side, 1 for the enemies. */
  readonly teams: number[] = [];
  /** Who each fighter is attacking (TeamPuzzleController targets); targets[0] is yours. */
  readonly targets: number[] = [];
  result: 'won' | 'lost' | null = null;
  endedAt = 0;
  /** When the boards had finished moving after the fight ended. */
  settledAt = 0;
  private readonly strikeIds: PyRandom;
  private readonly picks: PyRandom;
  private readonly shaftIds: number[] = [];
  private readonly knockedOut = new Set<number>();

  constructor(readonly settings: MatchSettings, readonly seed: number, readonly startedAt: number, private readonly events: MatchEvents = {}) {
    this.strikeIds = new PyRandom(seed ^ 0x5f3759df);
    this.picks = new PyRandom(seed ^ 0x1b873593);
    const colours = new PyRandom(seed ^ 0x2c1b3c6d);
    // You, then your allies, then the enemies.
    const kinds: Kind[] = [
      ...Array<Kind>(settings.thralls).fill('Thrall'), ...Array<Kind>(settings.swabbies).fill('Skilled swabbie'),
      ...Array<Kind>(settings.cultists).fill('Cultist'), ...Array<Kind>(settings.homunculi).fill('Homunculus'),
    ];
    const skills: Record<Kind, number> = {
      Cultist: settings.cultistSkill, Homunculus: settings.homunculusSkill, Thrall: settings.thrallSkill, 'Skilled swabbie': settings.swabbieSkill,
    };
    for (let i = 0; i <= kinds.length; i++) {
      const dealer = new Dealer(seed, settings.breakers);
      const kind = kinds[i - 1];
      let sword: [number, number, number] = settings.sword;
      if (i > 0) {
        const type = kind === 'Cultist' ? SPEAR : kind === 'Homunculus' ? TRUNK : PLAIN_SWORDS[colours.randintN(0, PLAIN_SWORDS.length - 1)];
        sword = [type, colours.randintN(0, 7), colours.randintN(0, 7)];
      }
      this.swords.push(new Sword(...sword));
      const same = kinds.filter((k) => k === kind).length;
      const nth = kinds.slice(0, i).filter((k) => k === kind).length;
      this.names.push(i === 0 ? 'You' : same > 1 ? `${kind} ${nth}` : kind);
      this.teams.push(i === 0 || kind === 'Thrall' || kind === 'Skilled swabbie' ? 0 : 1);
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
        : this.ai(i, skills[kind], hooks, seed, startedAt));
    }
    for (let i = 0; i < this.fighters.length; i++) this.targets.push(-1);
    for (let i = 0; i < this.fighters.length; i++) this.retarget(i);
    // You start on the first enemy.
    this.targets[0] = this.enemiesOf(0)[0] ?? -1;
  }

  private ai(i: number, skill: number, hooks: FighterHooks, seed: number, startedAt: number): Npc | GameNpc {
    const rng = new PyRandom(seed + i * 7919);
    const npcHooks = { nextPair: hooks.nextPair, attack: hooks.attack! };
    const style = styleFor(this.settings, skill);
    if (this.settings.opponentType === 'tally') return new Npc(i, style.tally, rng, npcHooks, startedAt);
    const npc = new GameNpc(i, style.game, rng, npcHooks, startedAt);
    npc.targeted = () => this.targeters(i).length;
    return npc;
  }

  get player(): Fighter {
    return this.fighters[0] as Fighter;
  }

  /** The other side's fighters still standing. */
  enemiesOf(index: number): number[] {
    return this.fighters.filter((f) => this.teams[f.index] !== this.teams[index] && !f.out).map((f) => f.index);
  }

  /** The enemies still standing. */
  alive(): number[] {
    return this.enemiesOf(0);
  }

  /** Who is attacking a fighter. */
  targeters(index: number): number[] {
    return this.fighters.filter((f) => !f.out && this.targets[f.index] === index).map((f) => f.index);
  }

  get target(): number {
    return this.targets[0];
  }

  /** An AI picks a random enemy still standing. */
  private retarget(index: number): void {
    if (index === 0) return;
    const enemies = this.enemiesOf(index);
    this.targets[index] = enemies.length ? enemies[this.picks.randintN(0, enemies.length - 1)] : -1;
  }

  /** Steps your target through the enemies still in (target_next_player / target_prev_player). */
  cycleTarget(step: number): void {
    const alive = this.alive();
    if (!alive.length) return;
    const at = alive.indexOf(this.targets[0]);
    this.targets[0] = alive[((at < 0 ? 0 : at + step) % alive.length + alive.length) % alive.length];
  }

  setTarget(index: number): void {
    if (this.alive().includes(index)) this.targets[0] = index;
  }

  private send(from: number, attack: Attack): void {
    if (this.result) return;
    const to = this.targets[from];
    const target = this.fighters[to];
    if (!target || target.out || this.teams[to] === this.teams[from]) return;
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
      if (!f.out || this.knockedOut.has(f.index)) continue;
      this.knockedOut.add(f.index);
      if (f.index === 0) {
        this.events.message?.('Ye be knocked out!', 0);
        this.events.sound?.('self_knocked_out', 0);
      } else if (this.teams[f.index] === 0) {
        this.events.message?.(`${this.names[f.index]} was knocked out!`, 0);
        this.events.sound?.('teammate_knocked_out', 0);
      } else {
        if (f.index === this.targets[0]) this.events.message?.(`${this.names[f.index]} was knocked out!`, 0);
        this.events.sound?.('opponent_knocked_out', 0);
      }
    }
    // Anyone whose target went down picks another.
    for (let i = 0; i < this.fighters.length; i++) {
      const t = this.targets[i];
      if (t >= 0 && this.fighters[t].out) {
        if (i === 0) this.cycleTarget(1);
        else this.retarget(i);
      }
    }
    if (this.settings.opponents === 0) {
      if (this.player.out) this.finish('lost', now);
      return;
    }
    // A side loses when everyone on it is out; with allies, you can be out and still win.
    if (!this.alive().length) this.finish('won', now);
    else if (!this.enemiesOf(this.alive()[0]).length) this.finish('lost', now);
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
