import type { PuzzleMeta } from '../../core/puzzle';

export default {
  title: 'Distilling (client rules)',
  description: 'Swap pieces so the light ones rise and the dark ones sink, before the furnace takes each column. Whites into the jug, blacks into the fire.',
  help: 'Click a piece, then a neighbour to swap them, or drag a piece through several. Arrow keys or the number pad move the cursor, Space swaps, and X burns the column now.',
  width: 450,
  height: 600,
  order: 5,
  credits: 'Rules, art and sounds from the Puzzle Pirates client (Three Rings).',
} satisfies PuzzleMeta;
