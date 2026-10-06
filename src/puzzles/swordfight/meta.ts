import type { PuzzleMeta } from '../../core/puzzle';

export default {
  title: 'Swordfight',
  description: 'Build strikes and chain breakers against configurable TrainingBots. Practice alone or fight up to ten opponents.',
  help: 'Left/Right move the pair. Up rotates counter-clockwise; Down rotates clockwise. Space drops. A/S change target. Escape pauses the training fight.',
  width: 800,
  height: 650,
  order: 6,
} satisfies PuzzleMeta;
