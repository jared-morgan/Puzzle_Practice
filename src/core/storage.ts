// Saved settings and scores, kept in localStorage under one key per puzzle.
// The desktop games wrote YAML files next to the executable; this is the browser's equivalent.
// Every access is guarded: private windows and blocked storage just mean nothing persists.

const PREFIX = 'puzzle-practice:';

/** One finished game: when it ended, its score, and whatever else the puzzle shows about it. */
export interface GameRecord {
  /** Date.now() when the game ended. */
  at: number;
  score: number;
  [stat: string]: number | string;
}

/** A graphable score row, independent of the compressed replay payload. */
export interface ScoreRecord {
  puzzle: string;
  settingsKey: string;
  at: number;
  score: number;
  stats: Record<string, number | string>;
  /** Matches ReplayMetadata.id; absent when the game had no saved replay. */
  replayFileId?: string;
}

/** Reads plain score histories from a browser snapshot or folder manifest, never replay blobs. */
export function scoreRecords(data: Record<string, unknown>, puzzle?: string): ScoreRecord[] {
  const scores: ScoreRecord[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(PREFIX)) continue;
    const marker = key.indexOf(':history:', PREFIX.length);
    if (marker < 0 || !Array.isArray(value)) continue;
    const namespace = key.slice(PREFIX.length, marker);
    if (puzzle !== undefined && namespace !== puzzle) continue;
    const settingsKey = key.slice(marker + ':history:'.length);
    for (const game of value) {
      if (!game || typeof game !== 'object' || !Number.isFinite(game.at) || !Number.isFinite(game.score)) continue;
      const { at, score, replayAt, replayId, ...stats } = game as GameRecord;
      const replayFileId = typeof replayAt === 'number' && Number.isFinite(replayAt)
        ? `${namespace}:${replayAt}${typeof replayId === 'string' && replayId ? `:${replayId}` : ''}` : undefined;
      scores.push({ puzzle: namespace, settingsKey, at, score, stats,
        ...(replayFileId ? { replayFileId } : {}) });
    }
  }
  return scores.sort((a, b) => a.at - b.at || a.puzzle.localeCompare(b.puzzle) || a.settingsKey.localeCompare(b.settingsKey));
}

/** The desktop games kept every score per settings key; this keeps the most recent this many. */
const HISTORY_LIMIT = 1000;
let historyRevision = 0;

function backupItemKey(item: unknown): string {
  if (item && typeof item === 'object') {
    const replay = item as { puzzle?: unknown; at?: unknown };
    if (typeof replay.puzzle === 'string' && typeof replay.at === 'number' && Number.isFinite(replay.at)) {
      return `replay:${replay.puzzle}:${replay.at}`;
    }
  }
  return JSON.stringify(item) ?? 'null';
}

export class Store {
  private readOnly = false;
  /** Replay simulations can read scores/settings but must never persist or mutate histories. */
  setReadOnly(readOnly: boolean): void { this.readOnly = readOnly; }
  /** Histories read so far, so panels can show them every frame without re-reading storage. */
  private readonly histories = new Map<string, GameRecord[]>();
  private historiesRevision = historyRevision;

  constructor(private readonly namespace: string) {}

  private key(name: string): string {
    return `${PREFIX}${this.namespace}:${name}`;
  }

  get<T>(name: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(this.key(name));
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  /** Saves a value; false if storage is unavailable or full. */
  set(name: string, value: unknown): boolean {
    if (this.readOnly) return false;
    try {
      localStorage.setItem(this.key(name), JSON.stringify(value));
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('puzzle-practice-data-changed'));
      return true;
    } catch {
      // Storage unavailable or full: keep playing without saving.
      return false;
    }
  }

  /** Every saved game for one settings key, oldest first. */
  history(key: string): readonly GameRecord[] {
    if (this.historiesRevision !== historyRevision) {
      this.histories.clear();
      this.historiesRevision = historyRevision;
    }
    let games = this.histories.get(key);
    if (!games) {
      games = this.get<GameRecord[]>(`history:${key}`, []);
      this.histories.set(key, games);
    }
    return games;
  }

  /** Adds a finished game to its settings key's history and returns the history. */
  addHistory(key: string, game: { score: number; [stat: string]: number | string }): readonly GameRecord[] {
    if (this.readOnly) return this.history(key);
    const games = this.history(key) as GameRecord[];
    games.push({ at: Date.now(), ...game } as GameRecord);
    games.splice(0, games.length - HISTORY_LIMIT);
    this.set(`history:${key}`, games);
    return games;
  }
}

/** Settings and score histories; binary replay files are exported separately by data-backups. */
export function exportAll(): string {
  const data: Record<string, unknown> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) data[key] = JSON.parse(localStorage.getItem(key)!);
    }
  } catch {
    // Unreadable storage: export what was read.
  }
  return JSON.stringify({ puzzlePractice: 1, saved: new Date().toISOString(), data }, null, 1);
}

/** Merges a browser snapshot into an archive without dropping older score or replay records. */
export function mergeBackupFiles(currentJson: string, archiveJson: string, replayLimit = Number.POSITIVE_INFINITY): string {
  const current = JSON.parse(currentJson) as { puzzlePractice?: number; data?: Record<string, unknown> };
  const archive = JSON.parse(archiveJson) as { puzzlePractice?: number; data?: Record<string, unknown> };
  if (current.puzzlePractice !== 1 || !current.data || archive.puzzlePractice !== 1 || !archive.data) {
    throw new Error('Not a Puzzle Practice backup');
  }
  const data = { ...archive.data, ...current.data };
  for (const [key, incoming] of Object.entries(current.data)) {
    const old = archive.data[key];
    const isReplays = key.endsWith(':replays');
    const isHistory = key.includes(':history:');
    if (!Array.isArray(incoming) || (!isReplays && !isHistory)) continue;
    const unique = new Map<string, unknown>();
    for (const item of [...(Array.isArray(old) ? old : []), ...incoming]) unique.set(isReplays ? backupItemKey(item) : JSON.stringify(item) ?? 'null', item);
    const merged = [...unique.values()];
    if (isReplays) {
      merged.sort((a, b) => Number((b as { at?: number })?.at ?? 0) - Number((a as { at?: number })?.at ?? 0));
      if (Number.isFinite(replayLimit)) merged.splice(Math.max(0, replayLimit));
    } else {
      merged.sort((a, b) => Number((a as { at?: number })?.at ?? 0) - Number((b as { at?: number })?.at ?? 0));
    }
    data[key] = merged;
  }
  return JSON.stringify({ puzzlePractice: 1, saved: new Date().toISOString(), data }, null, 1);
}

/** Merges a full backup into the current browser data. Repeated imports do not duplicate games/replays. */
export function importAll(json: string, replayLimit = 10): number {
  const parsed = JSON.parse(json) as { puzzlePractice?: number; data?: Record<string, unknown> };
  if (parsed.puzzlePractice !== 1 || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
    throw new Error('Not a Puzzle Practice backup');
  }
  let count = 0;
  historyRevision++;
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!key.startsWith(PREFIX)) continue;
    let next = value;
    if (Array.isArray(value) && (key.includes(':history:') || key.endsWith(':replays'))) {
      let existing: unknown;
      try { existing = JSON.parse(localStorage.getItem(key) ?? 'null'); }
      catch { /* Replace a corrupt value with the valid backup value. */ }
      const unique = new Map<string, unknown>();
      for (const item of [...(Array.isArray(existing) ? existing : []), ...value]) {
        unique.set(key.endsWith(':replays') ? backupItemKey(item) : JSON.stringify(item) ?? 'null', item);
      }
      let merged = [...unique.values()];
      if (key.endsWith(':replays')) {
        merged.sort((a, b) => Number((b as { at?: number })?.at ?? 0) - Number((a as { at?: number })?.at ?? 0));
        merged = merged.slice(0, replayLimit);
      } else {
        merged.sort((a, b) => Number((a as { at?: number })?.at ?? 0) - Number((b as { at?: number })?.at ?? 0));
        merged = merged.slice(-HISTORY_LIMIT);
      }
      next = merged;
    }
    localStorage.setItem(key, JSON.stringify(next));
    count++;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('puzzle-practice-data-changed'));
  return count;
}
