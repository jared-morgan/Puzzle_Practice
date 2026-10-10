import { describe, expect, it } from 'vitest';
import { BREAKER } from './board';
import { Fighter } from './fighter';

describe('combat statistics', () => {
  it('counts a received attack once, including its strikes and sprinkles', () => {
    const fighter = new Fighter(0, 5, { nextPair: () => [0, 1], peekPair: () => [2, 3], swordOf: () => null });
    fighter.receive({ from: 1, id: 0, sprinkles: 7, strikes: [{ id: 0, pieces: [], width: 2, height: 4, x: 0, y: 0, orient: 0 }] });
    fighter.receive({ from: 1, id: 1, sprinkles: 3, strikes: [] });
    expect(fighter.stats.largestReceived).toBe(15);
    // Attacks waiting in the queue have not yet dealt damage.
    expect(fighter.stats.received).toBe(0);
    fighter.out = true;
    fighter.receive({ from: 1, id: 2, sprinkles: 50, strikes: [] });
    expect(fighter.stats.largestReceived).toBe(15);
  });

  it('counts dealt pieces, not previews, and includes an unfinished drought', () => {
    const fighter = new Fighter(0, 5, {
      nextPair: () => [0, BREAKER | 1],
      peekPair: () => [BREAKER, BREAKER | 2], swordOf: () => null,
    });
    fighter.update(0);
    expect(fighter.pair?.pieces).toEqual([0, BREAKER | 1]);
    expect(fighter.stats.breakerDroughts).toEqual([2, 1, 2, 2]);
    fighter.update(100);
    expect(fighter.stats.breakerDroughts).toEqual([2, 1, 2, 2]);
  });
});
