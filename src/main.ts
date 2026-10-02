// The shell: a landing page listing every puzzle, and a page per puzzle.
// Routing uses the URL hash (#/forage) so it works on GitHub Pages without server rewrites.
import './style.css';
import { runPuzzle, type RunningPuzzle } from './core/host';
import { puzzles } from './core/registry';

const app = document.querySelector<HTMLDivElement>('#app')!;
let running: RunningPuzzle | null = null;
let navigation = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function showLanding(): void {
  document.title = 'Puzzle Practice';
  const cards = puzzles.map(({ id, meta }) =>
    el(
      'a',
      { className: 'card', href: `#/${id}` },
      ...(meta.thumbnail ? [el('img', { src: meta.thumbnail, alt: '', className: 'thumb' })] : []),
      el('h2', {}, meta.title),
      el('p', {}, meta.description),
    ),
  );
  app.replaceChildren(
    el('header', { className: 'site' }, el('h1', {}, 'Puzzle Practice'), el('p', {}, 'Practice tools for Puzzle Pirates puzzles. Pick one to play.')),
    el('main', { className: 'grid' }, ...cards),
  );
}

async function showPuzzle(id: string): Promise<void> {
  const entry = puzzles.find((p) => p.id === id);
  if (!entry) {
    location.hash = '#/';
    return;
  }
  const ticket = ++navigation;
  const { meta } = entry;
  document.title = `${meta.title} · Puzzle Practice`;
  const canvas = el('canvas', { className: 'game', tabIndex: 0 });
  canvas.style.aspectRatio = `${meta.width ?? 800} / ${meta.height ?? 600}`;
  const status = el('p', { className: 'status' }, 'Loading…');
  app.replaceChildren(
    el('header', { className: 'bar' }, el('a', { href: '#/' }, '← All puzzles'), el('h1', {}, meta.title)),
    el(
      'main',
      { className: 'play' },
      canvas,
      status,
      ...(meta.help ? [el('p', { className: 'help' }, meta.help)] : []),
      ...(meta.credits ? [el('p', { className: 'credits' }, meta.credits)] : []),
    ),
  );
  try {
    const factory = await entry.load();
    const started = await runPuzzle(canvas, id, meta, factory);
    if (ticket !== navigation) {
      started.stop();
      return;
    }
    running = started;
    status.remove();
    canvas.focus();
  } catch (error) {
    console.error(error);
    if (ticket === navigation) status.textContent = 'This puzzle failed to load. Try reloading the page.';
  }
}

function route(): void {
  running?.stop();
  running = null;
  navigation++;
  const id = location.hash.replace(/^#\/?/, '');
  if (id) void showPuzzle(id);
  else showLanding();
}

window.addEventListener('hashchange', route);
route();
