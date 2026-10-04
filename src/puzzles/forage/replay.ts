// A Forage session as it was played, so it can be watched back: the settings and seeds that make
// its boards, every move with the time it was made, and where the mouse was and clicked.
// Times are milliseconds from the session's start.
import type { Settings } from './logic';
import { PUZZLES } from './puzzles';

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
  v: 1 | 2;
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
const sizes = new WeakMap<Replay, number>();
/** Exact UTF-8 size of the downloaded JSON; finished replay data is immutable. */
export function replayBytes(replay: Replay): number {
  let size = sizes.get(replay);
  if (size === undefined) {
    size = new TextEncoder().encode(JSON.stringify(replay)).length;
    sizes.set(replay, size);
  }
  return size;
}

export function isReplay(data: unknown): data is Replay {
  if (!data || typeof data !== 'object') return false;
  const r = data as Replay;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (![1, 2].includes(r.v) || !finite(r.at) || !finite(r.end) || r.end < 0 ||
      typeof r.result !== 'string' || typeof r.puzzleId !== 'string' || typeof r.pickedRandomly !== 'boolean' ||
      !Array.isArray(r.seeds) || r.seeds.length !== 2 || !r.seeds.every(finite) ||
      !Array.isArray(r.boards) || !r.boards.every((s) => typeof s === 'string' && /^\d{1,15}$/.test(s)) ||
      !Array.isArray(r.mouse) || r.mouse.length % 3 !== 0 || !r.mouse.every(finite) ||
      !Array.isArray(r.events) || !r.settings || typeof r.settings !== 'object') return false;
  const settings = r.settings;
  if (!['puzzle', 'ci', 'infinite', 'normal', 'chaos'].includes(settings.mode) ||
      !Number.isInteger(settings.forageLevel) || settings.forageLevel < 0 || settings.forageLevel > 15 ||
      !(['bb', 'fj', 'cc', 'eq', 'machete', 'shovel', 'monkey', 'ants', 'scramble'] as const).every((k) => typeof settings[k] === 'boolean')) return false;
  if (settings.mode === 'puzzle' && r.puzzleId !== '0' && !(r.puzzleId in PUZZLES)) return false;
  const ratios = (a: unknown) => Array.isArray(a) && a.length === 3 && a.every((n) => finite(n) && n >= 0);
  if (!ratios(settings.normalRatios) || (settings.chestRatios !== undefined && !ratios(settings.chestRatios)) ||
      (settings.roundSeconds !== undefined && (!finite(settings.roundSeconds) || settings.roundSeconds < 0))) return false;
  let previous = -1;
  for (let i = 0; i < r.mouse.length; i += 3) {
    if (r.mouse[i] < 0 || r.mouse[i] < previous || r.mouse[i] > r.end) return false;
    previous = r.mouse[i];
  }
  previous = -1;
  for (const e of r.events) {
    if (!e || !finite(e.t) || e.t < 0 || e.t < previous || e.t > r.end) return false;
    previous = e.t;
    if (e.k === 'newboard') continue;
    if (!finite(e.x) || !finite(e.y)) return false;
    if (e.k === 'click') { if (!finite(e.b)) return false; }
    else if (e.k === 'act' || e.k === 'cursor') {
      if (!Number.isInteger(e.x) || !Number.isInteger(e.y) || e.x < 0 || e.x >= 7 || e.y < 0 || e.y >= 10) return false;
      if (e.k === 'act' && typeof e.ccw !== 'boolean') return false;
    } else return false;
  }
  return true;
}

/** A short line for the replay list. */
export function replayLabel(r: Replay, modeLabel: string): string {
  const date = new Date(r.at);
  const when = `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
  return `${when} · ${modeLabel} · ${r.result}`;
}
