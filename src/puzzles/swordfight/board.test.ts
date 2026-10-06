import { describe, expect, it } from 'vitest';
import { Board, EMPTY, fall, findClear, findJoins } from './board';
import { sprinkleColumns, type Strike, StrikePlacer, Sword } from './strikes';
import parity from './sword-parity.json';

// Cases recorded from the real client classes by scripts/parity/SwordParity.java.

/** One evolve step the way Fighter (and sword/client/s.o) does it, applied at once. */
function step(board: Board, chain: { n: number }): string | null {
  if (fall(board).length) return 'fall';
  const joins = findJoins(board);
  if (joins.length) {
    for (const b of joins) board.setBlock(b.colour, b.x, b.y, b.w, b.h);
    return 'join';
  }
  const clear = findClear(board, chain.n);
  if (!clear.cells.length) return null;
  for (const c of clear.cells) board.set(c.x, c.y, EMPTY);
  chain.n++;
  return `clear:${clear.loose}:${clear.blocks.length}`;
}

describe('settling matches the client', () => {
  parity.settle.forEach((game, g) => {
    it(`game ${g}`, () => {
      for (const turn of game) {
        const board = new Board(turn.start);
        const chain = { n: 0 };
        for (const expected of turn.steps) {
          expect(step(board, chain)).toBe(expected.kind);
          expect(Array.from(board.cells)).toEqual(expected.board);
        }
        expect(step(board, chain)).toBeNull();
      }
    });
  });
});

type Recorded = { id: number; w: number; h: number; x: number; y: number; orient: number; pieces: (number[] | null)[] | null };
const shown = (s: Strike): Recorded => ({ id: s.id, w: s.width, h: s.height, x: s.x, y: s.y, orient: s.orient, pieces: s.pieces.map((p) => p ?? null) });

describe('strikes are placed as the client places them', () => {
  parity.strikes.forEach((c, n) => {
    it(`attack ${n}`, () => {
      const sword = new Sword(c.sword[0], c.sword[1], c.sword[2]);
      const placer = new StrikePlacer();
      const strikes: Strike[] = c.asked.map((s) => ({ id: s.id, width: s.w, height: s.h, x: 0, y: 0, orient: 0, pieces: [] }));
      const placed = placer.place(new Board(c.board), sword, strikes);
      expect(placed.map(shown)).toEqual(c.placed);
      placer.replace(new Board(c.landingBoard), sword, placed);
      expect(placed.map(shown)).toEqual(c.landed);
    });
  });
});

describe('sprinkles', () => {
  it('spread over the columns as the client spreads them', () => {
    for (const c of parity.sprinkles) expect(sprinkleColumns([...c.levels], c.count, c.shaft)).toEqual(c.added);
  });
});

describe('sword patterns', () => {
  it('colour every square as the client does', () => {
    for (const c of parity.swords) {
      const sword = new Sword(c.sword[0], c.sword[1], c.sword[2]);
      c.strike.forEach((row, y) => row.forEach((colour, x) => expect(sword.shaftPiece(x, y, true)).toBe(colour)));
      c.sprinkle.forEach((row, y) => row.forEach((colour, x) => expect(sword.shaftPiece(x, y, false)).toBe(colour)));
    }
  });
});

describe('turning and moving the pair', () => {
  it('matches the client', () => {
    for (const c of parity.turns) {
      const board = new Board(c.board);
      const turned = board.turnPair(c.row, c.col, c.orient, c.clockwise, c.progress, c.kick);
      expect(turned && [turned[0], turned[1], turned[2], turned[3] ? 1 : 0]).toEqual(c.turned);
      const second = c.orient === 3 ? [c.col, c.row - 1] : c.orient === 7 ? [c.col, c.row + 1] : c.orient === 1 ? [c.col - 1, c.row] : [c.col + 1, c.row];
      const x = Math.min(c.col, second[0]);
      const y = Math.max(c.row, second[1]);
      expect(board.canMove(x, y, c.col === second[0] ? 1 : 2, c.row === second[1] ? 1 : 2, c.dx, c.progress)).toBe(c.moved);
    }
  });
});
