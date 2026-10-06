import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { Bot } from './ai';
import { attackFor, swordFor } from './attack';
import { Board, BREAKER, findClear } from './board';
import { Match, type MatchSettings } from './match';

const settings: MatchSettings = { opponents: 1, skill: 6, difficulty: 5, breakers: 12.5, sword: [2, 0, 0], enemySword: [6, 4, 2] };

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

function play(seed: number, player: boolean, until = 10 * 60_000) {
  const m = new Match(settings, seed, 0);
  const me = player ? new Bot(m.player, 8, new PyRandom(seed + 1)) : null;
  let now = 0;
  while (!m.result && now < until) {
    now += 16;
    me?.update(now);
    m.update(now);
  }
  return { m, now };
}

describe('a fight', () => {
  it('ends with one side knocked out', () => {
    const { m } = play(7, true);
    expect(m.result).not.toBeNull();
    expect(m.player.stats.pairs).toBeGreaterThan(20);
    expect(m.fighters[1].stats.sent + m.player.stats.sent).toBeGreaterThan(0);
  });

  it('plays out the same way from the same seed and inputs', () => {
    const a = play(11, true, 40_000);
    const b = play(11, true, 40_000);
    expect(Array.from(a.m.player.board.cells)).toEqual(Array.from(b.m.player.board.cells));
    expect(Array.from(a.m.fighters[1].board.cells)).toEqual(Array.from(b.m.fighters[1].board.cells));
    expect(a.m.player.stats).toEqual(b.m.player.stats);
  });

  it('knocks out a player who does nothing', () => {
    const { m, now } = play(3, false);
    expect(m.result).toBe('lost');
    expect(now).toBeLessThan(120_000);
  });
});
