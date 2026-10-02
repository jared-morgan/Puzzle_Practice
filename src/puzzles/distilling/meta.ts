import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Distilling Simulator',
  description: 'Swap pieces to build columns before the furnace burns them. Standard, seeded, create and practice modes.',
  help: 'Left-drag a piece to swap it. Right-click to burn the column early. Esc pauses. In Create mode, hold 1–5 to paint pieces or scroll over a piece to change it.',
  width: 450,
  order: 1,
  thumbnail,
} satisfies PuzzleMeta;
