// Saved settings and scores, kept in localStorage under one key per puzzle.
// The desktop games wrote YAML files next to the executable; this is the browser's equivalent.
// Every access is guarded: private windows and blocked storage just mean nothing persists.

export class Store {
  constructor(private readonly namespace: string) {}

  private key(name: string): string {
    return `puzzle-practice:${this.namespace}:${name}`;
  }

  get<T>(name: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(this.key(name));
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  set(name: string, value: unknown): void {
    try {
      localStorage.setItem(this.key(name), JSON.stringify(value));
    } catch {
      // Storage unavailable or full: keep playing without saving.
    }
  }
}
