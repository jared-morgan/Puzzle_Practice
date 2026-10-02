// The contract between the shell and a puzzle. A puzzle is a folder in src/puzzles/ with:
//   meta.ts   – `export default { title, description, ... } satisfies PuzzleMeta`
//   index.ts  – `export default (async (ctx) => { ...; return { frame } }) satisfies PuzzleFactory`
// The shell finds both automatically; see docs/adding-a-puzzle.md.
import type { Input, InputEvent } from './input';
import type { Panel } from './panel';
import type { Screen } from './screen';
import type { Store } from './storage';

export interface PuzzleMeta {
  title: string;
  /** One or two sentences for the landing page. */
  description: string;
  /** Controls summary shown under the game. */
  help?: string;
  /** Logical canvas size; defaults to 800×600. Settings go in the panel beside it, not on the canvas. */
  width?: number;
  height?: number;
  /** Lower numbers are listed first on the landing page. */
  order?: number;
  /** Original authors, shown under the game. */
  credits?: string;
  /** Thumbnail URL for the landing page (import it with `?url`). */
  thumbnail?: string;
}

export interface PuzzleContext {
  screen: Screen;
  input: Input;
  /** HTML controls beside the canvas (modes, options, buttons, scores); see panel.ts. */
  panel: Panel;
  /** Saved settings and scores for this puzzle only. */
  store: Store;
  /** Milliseconds since the puzzle started, like pygame.time.get_ticks(). */
  ticks(): number;
}

export interface PuzzleInstance {
  /** Called up to 60 times a second (pygame's clock.tick(60)) with the input since the last frame. */
  frame(events: InputEvent[]): void;
  /** Called when the player leaves the puzzle. Release anything the puzzle started. */
  dispose?(): void;
}

export type PuzzleFactory = (ctx: PuzzleContext) => PuzzleInstance | Promise<PuzzleInstance>;
