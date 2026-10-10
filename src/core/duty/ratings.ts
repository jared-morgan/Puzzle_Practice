// The game's duty performance words (puzzle/general.properties, m.performance0-12) and how a
// session's result becomes one. CI foraging and vampire carpentry use YPPedia's published point
// thresholds; all scales are fixed in code.
import { Store } from '../storage';

const preferences = new Store('global');
export const extraRatings = (): boolean => preferences.get('extraRatings', true);
/** Old reports also follow the current global preference. */
export const displayedPerformance = (performance: number): number => extraRatings() ? performance : Math.min(performance, 12);

/** m.performance0-6: duty ratings; 6 is a practice session, shown in green. */
export const PERFORMANCE = [
  'Booched', 'Poor', 'Fine', 'Good', 'Excellent', 'Incredible', 'Learning',
  // 7-12: Gauntlet foraging and vampirate board-ups rate speed instead.
  'Asleep', 'Lethargic', 'Steady', 'Brisk', 'Swift', 'Frenetic',
  // 13-17: ours, above Frenetic, for scores the game's ratings stop short of.
  'Blazing', 'Breakneck', 'Tempestuous', 'Legendary', '👀',
] as const;

export const LEARNING = 6;
const GAUNTLET = 7;

/** The face the game's report gives a pirate for each rating: really sad up to really happy. */
const MOOD_OF = [0, 1, 2, 3, 4, 4, 2, 0, 1, 2, 3, 4, 4, 4, 4, 4, 4, 4] as const;
export const MOODS = ['really_sad', 'sad', 'normal', 'happy', 'really_happy'] as const;
export type Mood = (typeof MOODS)[number];

export function moodFor(performance: number): Mood {
  return MOODS[MOOD_OF[performance] ?? 2];
}

export function performanceWord(performance: number): string {
  return PERFORMANCE[displayedPerformance(performance)] ?? PERFORMANCE[LEARNING];
}

/** One way a puzzle measures a session, with the least it takes for each rating above the lowest. */
export interface RatingScale {
  /** Key for the fixed scale, unique within the puzzle. */
  id: string;
  /** What's measured, e.g. 'Points a move'. */
  label: string;
  /** Cut-offs above the lowest: five for Poor to Incredible, or up to ten for Lethargic to 👀. */
  cutoffs: readonly number[];
  /** Rated with the Gauntlet words (Asleep up to Frenetic). */
  gauntlet?: boolean;
  step?: number;
}

/** Fixed thresholds; previously saved custom cut-offs are deliberately ignored. */
export function cutoffsFor(_store: Store, scale: RatingScale): number[] {
  return [...scale.cutoffs];
}

/** The rating a measure earns: the lowest word, plus one for each cut-off it reaches. */
export function rate(value: number, cutoffs: readonly number[], gauntlet = false): number {
  let level = 0;
  if (Number.isFinite(value)) for (const cutoff of cutoffs) if (value >= cutoff) level++;
  return (gauntlet ? GAUNTLET : 0) + level;
}

/** Rates a measure on a puzzle's scale with fixed cut-offs; null (no measure) is Learning. */
export function rateOn(store: Store, scale: RatingScale | null, value: number | null): number {
  if (!scale || value === null) return LEARNING;
  return displayedPerformance(rate(value, cutoffsFor(store, scale), scale.gauntlet));
}

/** The words a scale's cut-offs lead to. */
export function cutoffWords(scale: RatingScale): string[] {
  const first = scale.gauntlet ? GAUNTLET + 1 : 1;
  return PERFORMANCE.slice(first, first + scale.cutoffs.length) as unknown as string[];
}
