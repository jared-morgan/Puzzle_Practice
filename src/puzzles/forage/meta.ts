import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Forage Simulator',
  description: 'Rotate 2×2 blocks to drop bone boxes, jars and chests off the bottom. Hand-made puzzles, timed CI runs and an endless mode.',
  help: 'Left-click (or X) rotates the 2×2 under the cursor anticlockwise, right-click (or C) clockwise. Click a tool to use it; the machete and earthquake go left or right with the mouse button.',
  width: 450,
  order: 2,
  credits: 'Original desktop version by Jice.',
  thumbnail,
} satisfies PuzzleMeta;
