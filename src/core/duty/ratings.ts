// The game's duty performance words (puzzle/general.properties, m.performance0-12) and how a
// session's result becomes one. The game works the performance out on its server, which keeps
// the cut-offs to itself, so each puzzle here has its own measure and default cut-offs, and the
// player can change them on the Settings tab.
import type { Store } from '../storage';

/** m.performance0-6: duty ratings; 6 is a practice session, shown in green. */
export const PERFORMANCE = [
  'Booched', 'Poor', 'Fine', 'Good', 'Excellent', 'Incredible', 'Learning',
  // 7-12: Gauntlet foraging and vampirate board-ups rate speed instead.
  'Asleep', 'Lethargic', 'Steady', 'Brisk', 'Swift', 'Frenetic',
  // 13-16: ours, above Frenetic, for scores the game's ratings stop short of.
  'Blazing', 'Breakneck', 'Tempestuous', 'Legendary',
] as const;

export const LEARNING = 6;
const GAUNTLET = 7;

/** The face the game's report gives a pirate for each rating: really sad up to really happy. */
const MOOD_OF = [0, 1, 2, 3, 4, 4, 2, 0, 1, 2, 3, 4, 4, 4, 4, 4, 4] as const;
export const MOODS = ['really_sad', 'sad', 'normal', 'happy', 'really_happy'] as const;
export type Mood = (typeof MOODS)[number];

export function moodFor(performance: number): Mood {
  return MOODS[MOOD_OF[performance] ?? 2];
}

export function performanceWord(performance: number): string {
  return PERFORMANCE[performance] ?? PERFORMANCE[LEARNING];
}

/** One way a puzzle measures a session, with the least it takes for each rating above the lowest. */
export interface RatingScale {
  /** Key for the player's own cut-offs, unique within the puzzle. */
  id: string;
  /** What's measured, e.g. 'Points a move'. */
  label: string;
  /** Cut-offs for each rating above the lowest: five for Poor up to Incredible, or up to nine for Lethargic up to Legendary. */
  cutoffs: readonly number[];
  /** Rated with the Gauntlet words (Asleep up to Frenetic). */
  gauntlet?: boolean;
  step?: number;
}

/** The player's cut-offs for a scale, or the defaults. */
export function cutoffsFor(store: Store, scale: RatingScale): number[] {
  const saved = store.get<unknown>(`ratingCutoffs:${scale.id}`, null);
  if (Array.isArray(saved) && saved.length === scale.cutoffs.length && saved.every((n) => typeof n === 'number' && Number.isFinite(n))) return saved;
  return [...scale.cutoffs];
}

/** The rating a measure earns: the lowest word, plus one for each cut-off it reaches. */
export function rate(value: number, cutoffs: readonly number[], gauntlet = false): number {
  let level = 0;
  if (Number.isFinite(value)) for (const cutoff of cutoffs) if (value >= cutoff) level++;
  return (gauntlet ? GAUNTLET : 0) + level;
}

/** Rates a measure on a puzzle's scale with the player's cut-offs; null (no measure) is Learning. */
export function rateOn(store: Store, scale: RatingScale | null, value: number | null): number {
  if (!scale || value === null) return LEARNING;
  return rate(value, cutoffsFor(store, scale), scale.gauntlet);
}

/** The words a scale's cut-offs lead to. */
export function cutoffWords(scale: RatingScale): string[] {
  const first = scale.gauntlet ? GAUNTLET + 1 : 1;
  return PERFORMANCE.slice(first, first + scale.cutoffs.length) as unknown as string[];
}
