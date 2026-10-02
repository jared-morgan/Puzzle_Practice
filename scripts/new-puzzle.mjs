// Starts a new puzzle from src/puzzles/_template:
//   npm run new-puzzle -- my-puzzle "My Puzzle"
// The folder name becomes the URL (#/my-puzzle). Edit meta.ts and index.ts from there.
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id, title] = process.argv.slice(2);
if (!id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
  console.error('Usage: npm run new-puzzle -- <id> "<Title>"   (id: lower-case words joined by dashes)');
  process.exit(1);
}

const puzzles = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'puzzles');
const target = join(puzzles, id);
if (existsSync(target)) {
  console.error(`src/puzzles/${id} already exists.`);
  process.exit(1);
}

cpSync(join(puzzles, '_template'), target, { recursive: true });
const meta = join(target, 'meta.ts');
const name = title ?? id.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
writeFileSync(meta, readFileSync(meta, 'utf8').replace("'Template Puzzle'", JSON.stringify(name).replace(/^"|"$/g, "'")));
console.log(`Created src/puzzles/${id}. Run npm run dev and open #/${id}.`);
