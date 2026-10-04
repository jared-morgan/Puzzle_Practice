import type { PuzzleMeta } from '../../core/puzzle';
import thumbnail from './thumbnail.jpg?url';

export default {
  title: 'Blacksmithing',
  description: 'Forge a sword by striking each square three times. The piece you strike, a number or a chess piece, decides where you can strike next. Also a Perfect board mode: small boards that can always be cleared.',
  help: 'Click a square to strike it; the squares you can strike next glow. Arrow keys or the number pad move the cursor and Space or Enter strikes.',
  width: 450,
  height: 600,
  order: 4,
  credits: 'Based on Puzzle Pirates (Three Rings). Original puzzle design by Aenor.',
  thumbnail,
} satisfies PuzzleMeta;
