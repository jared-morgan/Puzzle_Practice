import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Treasure Haul',
  description: 'Swap coins up and down to line up three or more and send them up into the net. Rubies and emeralds blast lines of coins, and chests that reach the top are hauled aboard. Play with 0, 1 or 2 chests on their way, or drill spawning chests and clearing one against the clock.',
  help: 'The cursor covers two squares: click, or press Space or Enter, to swap them. Arrow keys move the cursor. Clicking a ruby or emerald sets it off.',
  width: 450,
  height: 600,
  order: 5,
  credits: 'Rules, art and sounds from the Puzzle Pirates client (Three Rings).',
  thumbnail,
} satisfies PuzzleMeta;
