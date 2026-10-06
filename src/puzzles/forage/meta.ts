import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Forage',
  description: "Rotate 2×2 blocks to drop crates off the bottom. Hand-made puzzles, Gauntlet, Chaos and normal foraging, with optional timers.",
  help: 'Move the mouse or the arrow keys to place the cursor. Left-click (or X) turns the 2×2 anticlockwise, right-click (or C) clockwise. Over a tool the cursor shrinks to it: click to use it, and the machete and earthquake go left or right with the button.',
  width: 450,
  height: 600,
  order: 2,
  thumbnail,
} satisfies PuzzleMeta;
