import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.webp?url';

export default {
  title: 'Vampire Carp',
  description: 'The Vampire Lair’s carpentry, rebuilt from the game: patch coffin holes with planks before they rattle loose or the holes split wider.',
  help: 'Click a plank in the toolbox (or press 1, 2, 3) to pick it up, then click a hole to place it, or drag it there. Right-click or Space flips; the wheel, middle-click or X and C rotate; Z clicks at the cursor. Until you take the next plank, click the one you just placed to nudge it a cell or turn it. Press Start to begin a two-minute session.',
  width: 450,
  order: 3,
  thumbnail,
} satisfies PuzzleMeta;
