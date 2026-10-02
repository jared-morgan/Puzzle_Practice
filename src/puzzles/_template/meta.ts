// Landing-page card and help text. `npm run new-puzzle -- <id> "<Title>"` copies this folder.
import type { PuzzleMeta } from '../../core/puzzle';

export default {
  title: 'Template Puzzle',
  description: 'Turn every light off. Clicking a light toggles it and its neighbours.',
  help: 'Click a light to toggle it and the four next to it. R deals a new board.',
  width: 500,
  height: 560,
  order: 100,
} satisfies PuzzleMeta;
