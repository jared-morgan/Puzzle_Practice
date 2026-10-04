import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Forage Simulator',
  description: "Rotate 2×2 blocks to drop crates off the bottom, on the client's own rules. Hand-made puzzles, timed cursed isle CI runs, an endless mode and normal foraging.",
  help: 'Move the mouse or the arrow keys to place the cursor. Left-click (or X) turns the 2×2 anticlockwise, right-click (or C) clockwise. Over a tool the cursor shrinks to it: click to use it, and the machete and earthquake go left or right with the button.',
  width: 450,
  height: 600,
  order: 2,
  credits: 'Rules, art and sounds from the Puzzle Pirates client (Three Rings). Puzzles, modes and Gauntlet chests from the Forage Simulator by Jice.',
  thumbnail,
} satisfies PuzzleMeta;
