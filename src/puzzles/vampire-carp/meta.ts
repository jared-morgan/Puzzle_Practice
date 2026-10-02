import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Vampire Carp',
  description: 'Patch coffin holes with pentomino planks before the timer runs out. Perfect fits score best, and neglected holes start to tear.',
  help: 'Click a plank in the toolbox (or press 1, 2, 3) to pick it up, then click a hole to place it. Right-click or Space flips, the wheel or X and C rotate, Z places at the cursor. Click the piece you just placed to pick it back up and nudge it. Press Start to begin a two-minute session.',
  width: 450,
  order: 3,
  thumbnail,
} satisfies PuzzleMeta;
