// Checks speed carp's hole generation against the desktop version: scripts/parity/vampire_carp_fixture.py
// ran the original HoleCreator with these seeds to produce parity-fixture.json.
import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { THREE_PIECE_HOLES, TWO_PIECE_HOLES, TWO_PIECE_HOLES_WITH_X } from './holes';
import { createSmallHole, holesWith } from './shapes';
import fixture from './parity-fixture.json';

function table(size: number, letter: string) {
  if (size === 2) return letter === 'x' ? [...TWO_PIECE_HOLES_WITH_X] : holesWith(TWO_PIECE_HOLES, letter);
  return holesWith(THREE_PIECE_HOLES, letter);
}

describe('vampire carp holes match the original', () => {
  it('deals the same speed carp holes', () => {
    for (const expected of fixture.small) {
      const [hole, next] = createSmallHole(new PyRandom(), expected.size, expected.codes, table(expected.size, expected.letter), expected.seed);
      expect(hole.grid, JSON.stringify(expected)).toEqual(expected.grid);
      expect(hole.needed).toEqual(expected.needed);
      expect(hole.code).toBe(expected.code);
      expect(next).toBe(expected.next);
    }
  });
});
