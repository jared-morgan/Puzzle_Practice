// A Forage session as it was played, so it can be watched back: the settings and seeds that make
// its boards, every move with the time it was made, and where the mouse was and clicked.
// Times are milliseconds from the session's start.
import type { Settings } from './logic';

export type ReplayEvent =
  /** A turn or tool that went through, with the cursor's top-left cell. */
  | { t: number; k: 'act'; x: number; y: number; ccw: boolean }
  /** A mouse button going down on the canvas (1 left, 3 right), in canvas pixels. */
  | { t: number; k: 'click'; b: number; x: number; y: number }
  /** The arrow keys moving the cursor. */
  | { t: number; k: 'cursor'; x: number; y: number }
  /** The New board button. */
  | { t: number; k: 'newboard' };

export interface Replay {
  v: 1;
  /** Date.now() when the session started. */
  at: number;
  settings: Settings;
  /** The Puzzle box and whether the last puzzle was picked at random, which decide the puzzle. */
  puzzleId: string;
  pickedRandomly: boolean;
  /** Seeds for the game's random numbers and for the pieces' flight paths. */
  seeds: [number, number];
  /** Each board's seed, in the order they were dealt (as strings: they're 48-bit). */
  boards: string[];
  /** Mouse samples as [t, x, y, t, x, y, ...], taken when it moved. */
  mouse: number[];
  events: ReplayEvent[];
  /** When the session ended. */
  end: number;
  /** How it went, for the replay list: e.g. "Score 41" or "Puzzle 3, 12 moves". */
  result: string;
}

/** Replays kept in the browser; older ones drop off unless saved to a file. */
export const KEPT_REPLAYS = 10;

export function isReplay(data: unknown): data is Replay {
  const r = data as Replay;
  return !!r && r.v === 1 && Array.isArray(r.seeds) && Array.isArray(r.boards) && Array.isArray(r.mouse) && Array.isArray(r.events) && typeof r.settings === 'object';
}

/** A short line for the replay list. */
export function replayLabel(r: Replay, modeLabel: string): string {
  const date = new Date(r.at);
  const when = `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return `${when} · ${modeLabel} · ${r.result}`;
}
