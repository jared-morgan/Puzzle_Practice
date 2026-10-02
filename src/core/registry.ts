// Finds every puzzle in src/puzzles/<id>/ (folders starting with "_" are skipped).
// Metadata is bundled up front for the landing page; each game's code and media load on demand.
import type { PuzzleFactory, PuzzleMeta } from './puzzle';

const metas = import.meta.glob<PuzzleMeta>(['../puzzles/*/meta.ts', '!../puzzles/_*/meta.ts'], { eager: true, import: 'default' });
const loaders = import.meta.glob<PuzzleFactory>(['../puzzles/*/index.ts', '!../puzzles/_*/index.ts'], { import: 'default' });

export interface PuzzleEntry {
  id: string;
  meta: PuzzleMeta;
  load: () => Promise<PuzzleFactory>;
}

function folder(path: string): string {
  return path.split('/').at(-2)!;
}

export const puzzles: PuzzleEntry[] = Object.entries(metas)
  .map(([path, meta]) => ({ id: folder(path), meta, path }))
  .filter(({ id }) => !id.startsWith('_'))
  .map(({ id, meta, path }) => {
    const loader = loaders[path.replace(/meta\.ts$/, 'index.ts')];
    if (!loader) throw new Error(`Puzzle "${id}" has a meta.ts but no index.ts`);
    return { id, meta, load: loader };
  })
  .sort((a, b) => (a.meta.order ?? 100) - (b.meta.order ?? 100) || a.meta.title.localeCompare(b.meta.title));
