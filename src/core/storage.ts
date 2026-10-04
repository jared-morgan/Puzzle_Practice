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

/** The desktop games kept every score per settings key; this keeps the most recent this many. */
const HISTORY_LIMIT = 1000;

export class Store {
  /** Histories read so far, so panels can show them every frame without re-reading storage. */
  private readonly histories = new Map<string, GameRecord[]>();

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
    try {
      localStorage.setItem(this.key(name), JSON.stringify(value));
      return true;
    } catch {
      // Storage unavailable or full: keep playing without saving.
      return false;
    }
  }

  /** Every saved game for one settings key, oldest first. */
  history(key: string): readonly GameRecord[] {
    let games = this.histories.get(key);
    if (!games) {
      games = this.get<GameRecord[]>(`history:${key}`, []);
      this.histories.set(key, games);
    }
    return games;
  }

  /** Adds a finished game to its settings key's history and returns the history. */
  addHistory(key: string, game: { score: number; [stat: string]: number | string }): readonly GameRecord[] {
    const games = this.history(key) as GameRecord[];
    games.push({ at: Date.now(), ...game } as GameRecord);
    games.splice(0, games.length - HISTORY_LIMIT);
    this.set(`history:${key}`, games);
    return games;
  }
}

/** Everything Puzzle Practice has saved in this browser, as JSON for a backup file. */
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

/** Restores a backup from exportAll, replacing the saved values it contains. Returns how many were restored. */
export function importAll(json: string): number {
  const parsed = JSON.parse(json) as { puzzlePractice?: number; data?: Record<string, unknown> };
  if (parsed.puzzlePractice !== 1 || !parsed.data) throw new Error('Not a Puzzle Practice backup');
  let count = 0;
  for (const [key, value] of Object.entries(parsed.data)) {
    if (!key.startsWith(PREFIX)) continue;
    localStorage.setItem(key, JSON.stringify(value));
    count++;
  }
  return count;
}
