import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { GameNpc, gameSkillStyle, Npc, skillStyle } from './npc';
import { attackFor, swordFor } from './attack';
import { Board, BREAKER, findClear } from './board';
import { Match, type MatchSettings } from './match';

const settings: MatchSettings = { opponents: 1, skill: 6, opponentType: 'tally', ai: skillStyle(6), gameAi: gameSkillStyle(6), difficulty: 5, breakers: 12.5, sword: [2, 0, 0], enemySword: [6, 4, 2] };

describe('attacks (YPPedia)', () => {
  it('turns blocks into swords', () => {
    expect(swordFor(2, 2, 1)).toEqual([1, 4]);
    expect(swordFor(3, 3, 1)).toEqual([2, 4]);
    expect(swordFor(5, 5, 1)).toEqual([3, 7]);
    expect(swordFor(5, 4, 1)).toEqual([6, 3]);
    expect(swordFor(2, 3, 1)).toEqual([2, 3]);
    expect(swordFor(3, 2, 1)).toEqual([3, 2]);
    // A double doubles the longest side, the height when square.
    expect(swordFor(2, 2, 2)).toEqual([2, 4]);
    expect(swordFor(3, 2, 2)).toEqual([6, 2]);
  });

  it('sends a sprinkle for every two loose pieces of each break', () => {
    const board = new Board();
    // Two separate breaks: a red breaker with 4 reds (5 pieces), and a blue breaker with 2 blues (3 pieces).
    for (let y = 8; y < 13; y++) board.set(0, y, y === 8 ? BREAKER : 0);
    for (let y = 10; y < 13; y++) board.set(3, y, y === 10 ? BREAKER | 2 : 2);
    expect(attackFor(findClear(board, 0), 1).sprinkles).toBe(2 + 1);
    expect(attackFor(findClear(board, 0), 3).sprinkles).toBe(9);
  });
});

function play(seed: number, until = 10 * 60_000, opponents = 1) {
  const m = new Match({ ...settings, opponents }, seed, 0);
  let now = 0;
  while (!m.result && now < until) {
    now += 16;
    m.update(now);
  }
  return { m, now };
}

describe('the opponents', () => {
  it('stack their pieces on their lowest column, edges first', () => {
    const pairs: Array<[number, number]> = [[0, 1], [2, 3], [0, 0]];
    const npc = new Npc(1, { ...skillStyle(5), pairMs: 100 }, new PyRandom(1), { nextPair: () => pairs.shift()!, attack: () => {} }, 0);
    npc.update(300);
    const tops = [0, 1, 2, 3, 4, 5].map((x) => npc.board.get(x, 12));
    expect(tops).toEqual([0, 2, 0, 0, 3, 1]);
  });

  it('shatter their colour with a breaker and attack with it', () => {
    const attacks: number[] = [];
    const pairs: Array<[number, number]> = [...Array.from({ length: 20 }, (): [number, number] => [0, 0]), [BREAKER, 1]];
    const style = { ...skillStyle(10), pairMs: 100, breakAverage: 100, variation: 0, storeChance: 0 };
    const npc = new Npc(1, style, new PyRandom(2), { nextPair: () => pairs.shift()!, attack: (a) => attacks.push(a.sprinkles + a.swords.reduce((n, [w, h]) => n + w * h, 0)) }, 0);
    npc.update(2100);
    expect(npc.stats.shattered).toBeGreaterThan(20);
    expect(attacks.length).toBe(1);
    expect(npc.board.cells.filter((p) => p === 0).length).toBeLessThan(20);
  });

  it('store breakers and set them off with the next clear as a chain', () => {
    const links: number[] = [];
    const pairs: Array<[number, number]> = [...Array.from({ length: 10 }, (): [number, number] => [0, 1]), [BREAKER | 1, 2], [BREAKER, 3]];
    const style = { ...skillStyle(5), pairMs: 100, breakAverage: 100, variation: 0, storeChance: 100, comboMax: 1, strikeShare: 0 };
    const npc = new Npc(1, style, new PyRandom(3), { nextPair: () => pairs.shift()!, attack: (a) => links.push(a.sprinkles) }, 0);
    npc.update(1100);
    // The green breaker was stored; the red one can't be (one at most), so it goes off and takes the green with it.
    expect(npc.board.cells.some((p) => p === (BREAKER | 1))).toBe(true);
    npc.update(1200);
    expect(links.length).toBe(2);
    expect(npc.stats.bestChain).toBe(2);
    expect(npc.board.cells.some((p) => p === (BREAKER | 1))).toBe(false);
  });

  it('send their style: all sprinkles, or swords', () => {
    for (const share of [0, 100]) {
      const sent: Array<{ swords: number; sprinkles: number }> = [];
      const pairs: Array<[number, number]> = [...Array.from({ length: 30 }, (): [number, number] => [0, 0]), [BREAKER, 1]];
      const style = { ...skillStyle(5), pairMs: 100, breakAverage: 100, variation: 0, storeChance: 0, strikeShare: share };
      const npc = new Npc(1, style, new PyRandom(4), { nextPair: () => pairs.shift()!, attack: (a) => sent.push({ swords: a.swords.length, sprinkles: a.sprinkles }) }, 0);
      npc.update(3100);
      if (share === 0) expect(sent[0].swords).toBe(0);
      else expect(sent[0].swords).toBeGreaterThan(0);
    }
  });
});

describe("the game-numbers opponents", () => {
  const filled = (n: number): Array<[number, number]> => Array.from({ length: n }, (): [number, number] => [0, 0]);

  it('destroy between the base and maximum of their colour', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const pairs = [...filled(20), [BREAKER, 1] as [number, number]];
      const style = { ...gameSkillStyle(5), pairMs: 100, chainChance: 0 };
      const npc = new GameNpc(1, style, new PyRandom(seed), { nextPair: () => pairs.shift()!, attack: () => {} }, 0);
      npc.update(2100);
      // 40 reds, 30% to 60% of them shattered, plus the breaker.
      expect(npc.stats.shattered).toBeGreaterThanOrEqual(12 + 1);
      expect(npc.stats.shattered).toBeLessThanOrEqual(24 + 1);
    }
  });

  it("clear only the breaker's colour, sending some clears as chained", () => {
    const sent: number[] = [];
    for (const chain of [0, 100]) {
      const pairs: Array<[number, number]> = [...Array.from({ length: 10 }, (): [number, number] => [0, 1]), [BREAKER, 2]];
      const style = { ...gameSkillStyle(5), pairMs: 100, baseDestroy: 100, maxDestroy: 100, chainChance: chain, strikeShare: 0 };
      const npc = new GameNpc(1, style, new PyRandom(1), { nextPair: () => pairs.shift()!, attack: (a) => sent.push(a.sprinkles) }, 0);
      npc.update(1100);
      expect(npc.board.cells.filter((p) => p === 1).length).toBe(10);
      expect(npc.board.cells.filter((p) => p === 0).length).toBe(0);
    }
    expect(sent[1]).toBe(sent[0] * 2);
  });

  it('play more slowly while targeted', () => {
    const npc = new GameNpc(1, { ...gameSkillStyle(5), pairMs: 1000, targetedSlowdown: 100 }, new PyRandom(1), { nextPair: () => [0, 1], attack: () => {} }, 0);
    npc.targeted = () => true;
    npc.update(10_000);
    expect(npc.stats.pairs).toBe(5);
  });
});

describe('a fight', () => {
  it('knocks out a player who does nothing, after taking attacks', () => {
    const { m, now } = play(3);
    expect(m.result).toBe('lost');
    expect(now).toBeLessThan(120_000);
  });

  it('plays out the same way from the same seed', () => {
    const a = play(11, 40_000, 3);
    const b = play(11, 40_000, 3);
    for (let i = 0; i < 4; i++) expect(Array.from(a.m.fighters[i].board.cells)).toEqual(Array.from(b.m.fighters[i].board.cells));
    expect(a.m.player.stats).toEqual(b.m.player.stats);
  });

  it('opponents send attacks', () => {
    const { m } = play(5, 90_000, 2);
    expect(m.player.stats.received).toBeGreaterThan(0);
  });
});
