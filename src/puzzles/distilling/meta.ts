import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Distilling',
  description: "Swap pieces so whites go into the jug and blacks into the furnace, on the client's own rules. Also Standard, Seeded, Create and Practice drill modes.",
  help: 'Click a piece, then a neighbour to swap them, or drag a piece through several. Arrow keys or the number pad move the cursor, Space swaps, and X (or right-click) burns the column now. Esc pauses. In Create mode, hold 1-5 to paint pieces or scroll over a piece to change it.',
  width: 450,
  height: 600,
  order: 1,
  credits: 'Rules, art and sounds from the Puzzle Pirates client (Three Rings). Practice modes and drills from the Distilling Simulator (jared-morgan/Distilling_Simulator).',
  thumbnail,
} satisfies PuzzleMeta;
