import { HaulBoard, W, RUBY, EMERALD } from './logic';
import { PyRandom } from '../../core/pyrandom';

export type ClearPack = 'standard' | 'efficient' | 'emeralds' | 'edges';
export interface Drill {
  board: HaulBoard;
  chest: { x: number; y: number };
  /** A known opening for the efficient pack, useful for validation. */
  opening?: [number, number];
}

/** Practice boards have no automatic matches, and never overwrite another chest. */
export function createDrill(random: () => number, pack: ClearPack): Drill {
  const edge = pack === 'edges';
  const gemEdge = edge && random() < 0.5;
  const x = edge ? (random() < 0.5 ? 0 : W - 2) : 2 + Math.floor(random() * 3);
  // Both chest rows lie inside the middle four rows (2–5).
  const combo = pack === 'efficient' || (edge && !gemEdge);
  const y = combo ? 5 : 3 + Math.floor(random() * 3);
  for (let attempt = 0; attempt < 500; attempt++) {
    const board = new HaulBoard(random);
    board.populate();
    board.placeChest(x, y, Math.floor(random() * 3));
    const outside = x === W - 2 ? x - 1 : x + 2;
    let opening: [number, number] | undefined;
    if (pack === 'efficient') {
      const colour = Math.floor(random() * 4);
      const other = (colour + 1) % 4;
      const mirrored = random() < 0.5;
      const column = mirrored ? x + 1 : x;
      const direction = mirrored ? -1 : 1;
      // Swapping rows 1 and 0 completes a same-colour cross beneath the chest.
      // The vertical three are entirely below it; the horizontal crosses its other column.
      board.set(column, 3, colour);
      board.set(column, 2, colour);
      board.set(column, 1, other);
      board.set(column, 0, colour);
      board.set(column + direction, 1, colour);
      board.set(column + 2 * direction, 1, colour);
      const start = Math.min(column, column + 2 * direction);
      const end = Math.max(column, column + 2 * direction);
      if (start > 0) board.set(start - 1, 1, other);
      if (end < W - 1) board.set(end + 1, 1, other);
      opening = [column, 1];
    } else if (combo) {
      const a = Math.floor(random() * 4);
      const b = (a + 1) % 4;
      const c = (a + 2) % 4;
      // One swap makes a horizontal 3 above the chest and a vertical 3 beside it.
      // The piece at row 3 then rises into a second horizontal 3, hauling the chest.
      board.set(x, 7, a); board.set(x + 1, 7, a);
      board.set(x, 6, c); board.set(x + 1, 6, c);
      board.set(outside, 7, b); board.set(outside, 6, a);
      board.set(outside, 5, b); board.set(outside, 4, b); board.set(outside, 3, c);
      const start = Math.min(x, outside);
      const end = Math.max(x + 1, outside);
      if (start > 0) board.set(start - 1, 7, b);
      if (end < W - 1) board.set(end + 1, 7, b);
      opening = [outside, 7];
    }
    if (pack === 'emeralds') {
      board.set(0, 7, EMERALD);
      board.set(W - 1, 6, EMERALD);
    }
    if (gemEdge) {
      // Chained rubies above both columns clear the otherwise stuck edge pieces.
      board.set(x, 7, RUBY);
      board.set(x + 1, 7, RUBY);
    }
    if (!board.findRuns().length) return { board, chest: { x, y }, ...(opening && { opening }) };
  }
  // A deterministic, validated fallback still carries the pack's promised solution.
  const fallback = new PyRandom(0);
  return createDrill(() => fallback.random(), pack);
}
