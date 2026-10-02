// The Forage simulator (app.pyw and gui_functions.py), rebuilt on the shared core, playing by
// the real game's rules and timings (engine.ts). The panel follows the desktop version's
// layout. Options it showed but never implemented (Normal mode, Animations, Skip, Custom ID)
// are left out; its unused Ants checkbox now turns ants on and off.
import { Images } from '../../core/assets';
import { pygameFont } from '../../core/fonts';
import { within, type InputEvent, type Point } from '../../core/input';
import type { PuzzleFactory } from '../../core/puzzle';
import { floatStr } from '../../core/py';
import { PyRandom } from '../../core/pyrandom';
import { type Cell, Forage, type Grid, type Rules, type Sprite, type Step, TIMING } from './engine';
import {
  CHEST_WEIGHTINGS,
  COLS,
  fillPuzzle,
  type Mode,
  parseBoard,
  randomizeColours,
  ROWS,
  scramblePuzzle,
  type Settings,
} from './logic';
import { PUZZLES } from './puzzles';

const imageUrls = import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' });

const BLACK = 'rgb(31, 31, 31)';
const WHITE = '#ffffff';
const BLUE = 'rgb(85, 162, 250)';
const GREY = 'rgb(150, 150, 150)';
const font = pygameFont(32);
const fontLarge = pygameFont(96);
const fontSmall = pygameFont(16);

const CI_DURATION = 120000;
const CELL = 45;
const LEFT = 67;
const TOP = 50;
const COLOUR_IMAGES: Record<string, string> = {
  u: 'piece_red',
  v: 'piece_brown',
  w: 'piece_green',
  x: 'piece_yellow',
  y: 'piece_grey',
};
const TOOL_IMAGES: Record<string, string> = { m: 'machete', p: 'monkey', o: 'earthquake', n: 'shovel' };
const CRATE_IMAGES = ['', 'bb', 'fj', 'cc'];
/** Puzzles the random pick chooses between (the desktop version drew from 1–14). */
const RANDOM_POOL = Object.keys(PUZZLES)
  .map(Number)
  .filter((id) => id <= 14);

type Toggle = 'scramble' | 'bb' | 'fj' | 'cc' | 'eq' | 'machete' | 'shovel' | 'monkey' | 'ants';

/** Labels and checkboxes, at their desktop positions. Infinite takes the unused Normal row. */
const MODES: { mode: Mode; label: string; y: number }[] = [
  { mode: 'puzzle', label: 'Puzzle', y: 15 },
  { mode: 'ci', label: 'CI', y: 40 },
  { mode: 'infinite', label: 'Infinite', y: 65 },
];
const TOGGLES: { key: Toggle; label: string; text: Point; box: Point }[] = [
  { key: 'scramble', label: 'Scramble', text: [615, 115], box: [723, 118] },
  { key: 'bb', label: 'BB', text: [460, 140], box: [497, 143] },
  { key: 'fj', label: 'FJ', text: [522, 140], box: [554, 143] },
  { key: 'cc', label: 'CC', text: [577, 140], box: [616, 143] },
  { key: 'eq', label: 'EQ', text: [460, 165], box: [497, 168] },
  { key: 'machete', label: 'Machete', text: [522, 165], box: [617, 168] },
  { key: 'shovel', label: 'Shovel', text: [642, 165], box: [721, 168] },
  { key: 'monkey', label: 'Monkey', text: [460, 190], box: [548, 193] },
  { key: 'ants', label: 'Ants', text: [575, 190], box: [632, 193] },
];

/** Every special is on by default, as in the real game past the first difficulty levels. */
const DEFAULT_SETTINGS: Settings = {
  mode: 'ci',
  bb: true,
  fj: true,
  cc: false,
  eq: true,
  machete: true,
  shovel: true,
  monkey: true,
  ants: true,
  scramble: true,
  forageLevel: 6,
};

interface PuzzleRecord {
  moves: number;
  time: number;
}

interface Pop {
  cell: Cell;
  at: [number, number];
  start: number;
}

export default (async ({ screen, input, store, ticks }) => {
  const images = await Images.load(imageUrls);
  const img = (name: string) => images.get(name);
  const rng = new PyRandom();

  const settings: Settings = { ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>('settings', {}) };
  const saveSettings = () => store.set('settings', settings);
  const puzzleRecords = store.get<Record<string, PuzzleRecord>>('puzzleRecords', {});
  // Scores follow the real game's crate points now, so they're kept apart from older bests.
  const ciBest = store.get<Record<string, number>>('ciBestCratePoints', {});

  let game = new Forage(rng, rules());
  let boardActive = false;
  let ended = false;
  let movesUsed = 0;
  let score = 0;
  let startTime = 0;
  let timePassed = 0;
  let bestScore: number | null = null;
  let record: PuzzleRecord | null = null;
  /** The move being animated: its steps, and when the current one started. */
  let playing: Step[] = [];
  let stepStart = 0;
  let pops: Pop[] = [];
  /** "Double!" or "Triple!", shown when crates land in two or more steps of one move. */
  let banner: { text: string; until: number } | null = null;
  let pendingBanner = '';

  // Text fields: the puzzle ID ("0" means random) and the forage level.
  let puzzleId = '0';
  let pickedRandomly = false;
  let forageText = String(settings.forageLevel);
  let editing: 'puzzle' | 'forage' | null = null;

  const ciKey = () =>
    (['bb', 'fj', 'cc', 'eq', 'machete', 'shovel', 'monkey', 'ants'] as const).map((k) => (settings[k] ? 'b' : 'a')).join('') +
    settings.forageLevel;

  function rules(): Rules {
    const weights = CHEST_WEIGHTINGS[settings.forageLevel];
    return {
      specials: { n: settings.shovel, m: settings.machete, p: settings.monkey, o: settings.eq, ants: settings.ants },
      crates: settings.mode === 'puzzle' ? null : [settings.bb ? weights[0] : 0, settings.fj ? weights[1] : 0, settings.cc ? weights[2] : 0],
    };
  }

  function reset(): void {
    playing = [];
    pops = [];
    banner = null;
    game = new Forage(rng, rules());
  }

  function newRandomBoard(): void {
    reset();
    game.fillRandom();
  }

  function start(): void {
    movesUsed = 0;
    ended = false;
    if (settings.mode === 'puzzle') {
      if (puzzleId === '0' || pickedRandomly) {
        puzzleId = String(rng.choice(RANDOM_POOL));
        pickedRandomly = true;
      }
      const id = Number(puzzleId);
      record = puzzleRecords[puzzleId] ?? null;
      const puzzle = randomizeColours(parseBoard(PUZZLES[id]), rng);
      const reserve = parseBoard(RESERVE);
      reset();
      game.load(settings.scramble ? scramblePuzzle(id, puzzle, reserve, settings, rng) : fillPuzzle(puzzle, reserve, settings, rng));
    } else {
      newRandomBoard();
      score = 0;
      bestScore = settings.mode === 'ci' ? (ciBest[ciKey()] ?? 0) : null;
    }
    startTime = ticks();
    timePassed = 0;
  }

  function finishPuzzle(): void {
    ended = true;
    boardActive = false;
    if (settings.scramble) return;
    const best = record ?? { moves: movesUsed, time: timePassed };
    record = { moves: Math.min(best.moves, movesUsed), time: Math.min(best.time, timePassed) };
    puzzleRecords[puzzleId] = record;
    store.set('puzzleRecords', puzzleRecords);
  }

  function finishCi(): void {
    ended = true;
    boardActive = false;
    const key = ciKey();
    if (score > (ciBest[key] ?? 0)) {
      ciBest[key] = score;
      store.set('ciBestCratePoints', ciBest);
    }
    bestScore = Math.max(bestScore ?? 0, score);
  }

  /** A rotation or tool at the cell under `pos`. Ignored while a move is still playing out, as in the game. */
  function act(pos: Point, ccw: boolean): void {
    if (playing.length || !within(pos, LEFT, LEFT + CELL * COLS - 1, TOP, TOP + CELL * ROWS - 1)) return;
    const col = Math.floor((pos[0] - LEFT) / CELL);
    const row = Math.floor((pos[1] - TOP) / CELL);
    game.steps = [];
    let counts = game.useTool(row, col, ccw);
    if (!counts) {
      const turned = game.turn(row, col, ccw);
      if (turned === 'illegal') return;
      counts = turned === 'moved';
    }
    if (counts) {
      movesUsed++;
      const result = game.settle();
      if (settings.mode !== 'puzzle') score += result.points;
      pendingBanner = result.crateSteps >= 3 ? 'Triple!' : result.crateSteps === 2 ? 'Double!' : '';
    }
    playing = game.steps;
    game.steps = [];
    stepStart = ticks();
  }

  function click(pos: Point, button: 1 | 3): void {
    if (!boardActive) {
      const mode = MODES.find((m) => within(pos, 545, 560, m.y + 3, m.y + 18));
      const toggle = TOGGLES.find((t) => within(pos, t.box[0], t.box[0] + 15, t.box[1], t.box[1] + 15));
      if (mode) settings.mode = mode.mode;
      else if (toggle) settings[toggle.key] = !settings[toggle.key];
      else if (within(pos, 576, 789, 36, 64)) {
        editing = 'puzzle';
        puzzleId = '';
      } else if (within(pos, 733, 787, 135, 163)) {
        editing = 'forage';
        forageText = '';
      }
      if (mode || toggle) saveSettings();
    }
    if (within(pos, 460, 573, 225, 253)) {
      if (boardActive) boardActive = false;
      else if (!editing) {
        boardActive = true;
        start();
      }
    } else if (within(pos, 460, 573, 260, 288) && settings.mode !== 'puzzle') {
      newRandomBoard();
    }
    if (boardActive) act(pos, button === 1);
  }

  function key(name: string): void {
    // X and C turn anticlockwise and clockwise under the cursor, as in the game.
    if (!editing) {
      if (boardActive && (name === 'x' || name === 'c')) act(input.mouse, name === 'x');
      return;
    }
    if (name === 'enter') {
      if (editing === 'puzzle') {
        if (!(Number(puzzleId) in PUZZLES)) puzzleId = '0';
        puzzleId = String(Number(puzzleId));
      } else {
        settings.forageLevel = forageText === '' ? 6 : Math.min(15, Number(forageText));
        forageText = String(settings.forageLevel);
        saveSettings();
      }
      editing = null;
    } else if (name === 'backspace') {
      if (editing === 'puzzle') puzzleId = puzzleId.slice(0, -1);
      else forageText = forageText.slice(0, -1);
    } else if (editing === 'puzzle') {
      if (/^[0-9]$/.test(name)) puzzleId += name;
      pickedRandomly = false;
    } else if (/^[0-9]$/.test(name)) {
      forageText += name;
    }
  }

  // ---- Drawing ----

  /** Ants have no picture in the desktop media, so they're drawn: a small ant facing its way, and how much it can still eat. */
  function drawAnt(cell: Extract<Cell, { kind: 'ant' }>, x: number, y: number, alpha: number): void {
    const ctx = screen.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(70, 45, 20, 0.85)';
    ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
    ctx.translate(x + CELL / 2, y + CELL / 2);
    ctx.rotate(((cell.dir - 1) * Math.PI) / 2);
    ctx.strokeStyle = '#1b1008';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const ly of [-4, 2, 8]) {
      ctx.moveTo(-11, ly - 3);
      ctx.lineTo(11, ly + 1);
      ctx.moveTo(11, ly - 3);
      ctx.lineTo(-11, ly + 1);
    }
    ctx.moveTo(-2, -14);
    ctx.lineTo(-6, -19);
    ctx.moveTo(2, -14);
    ctx.lineTo(6, -19);
    ctx.stroke();
    ctx.fillStyle = '#2a170a';
    for (const [cy, r] of [
      [-11, 4],
      [-2, 4.5],
      [9, 6.5],
    ]) {
      ctx.beginPath();
      ctx.ellipse(0, cy, r * 0.85, r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    screen.text(String(cell.count), x + 31, y + 28, fontSmall, WHITE, alpha * 255);
  }

  function drawCell(cell: Cell, x: number, y: number, alpha = 1): void {
    if (cell.kind === 'ant') return drawAnt(cell, x, y, alpha);
    const name = cell.kind === 'colour' ? COLOUR_IMAGES[cell.colour] : cell.kind === 'tool' ? TOOL_IMAGES[cell.tool] : CRATE_IMAGES[cell.width];
    screen.blit(img(name), x, y, alpha < 1 ? { alpha: alpha * 255 } : {});
  }

  /** Draws each piece once, at its top-left cell. */
  function drawGrid(grid: Grid): void {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cell = grid[r][c];
        if (cell && grid[r - 1]?.[c] !== cell && grid[r][c - 1] !== cell) drawCell(cell, LEFT + CELL * c, TOP + CELL * r);
      }
    }
  }

  /** The step playing now, after moving past finished ones; null once the move has played out. */
  function currentStep(): [Step, number] | null {
    while (playing.length) {
      const elapsed = ticks() - stepStart;
      if (elapsed < playing[0].duration) return [playing[0], elapsed];
      // Cleared pieces pop after they dim; the pop doesn't hold up the next step.
      for (const s of playing[0].sprites) if (s.fade === 'clear') pops.push({ cell: s.cell, at: s.to, start: stepStart + s.delay + s.duration });
      stepStart += playing[0].duration;
      playing.shift();
      if (!playing.length && pendingBanner) {
        banner = { text: pendingBanner, until: stepStart + 1200 };
        pendingBanner = '';
      }
    }
    return null;
  }

  function drawSprite(s: Sprite, elapsed: number): void {
    const local = elapsed - s.delay;
    const fades = s.fade === 'clear' || s.fade === 'out';
    if (local < 0 && !fades) return;
    const t = Math.max(0, Math.min(1, local / s.duration));
    if (t >= 1 && fades) return;
    let alpha = 1;
    if (s.fade === 'clear') alpha = 1 - 0.8 * t;
    else if (s.fade === 'out') alpha = 1 - t;
    else if (s.fade === 'in') alpha = t;
    let x = LEFT + CELL * (s.from[1] + (s.to[1] - s.from[1]) * t);
    let y = TOP + CELL * (s.from[0] + (s.to[0] - s.from[0]) * t);
    if (s.motion === 'wobble' && t < 1) y += TIMING.wobblePx * Math.sin(TIMING.wobbleRate * local);
    if (s.motion === 'arc') y -= Math.sin(Math.PI * t) * (20 + 0.3 * CELL * Math.abs(s.to[1] - s.from[1]));
    if (s.motion === 'bob') {
      y -= Math.abs(Math.sin((local / 100) * Math.PI)) * 8;
      x += Math.sin((local / 200) * Math.PI) * 4;
    }
    drawCell(s.cell, x, y, alpha);
  }

  function drawPops(now: number): void {
    const ctx = screen.ctx;
    pops = pops.filter((p) => now < p.start + TIMING.pop);
    for (const p of pops) {
      const t = (now - p.start) / TIMING.pop;
      if (t < 0) continue;
      const scale = 1 + 0.5 * t;
      ctx.save();
      ctx.translate(LEFT + CELL * (p.at[1] + 0.5), TOP + CELL * (p.at[0] + 0.5));
      ctx.scale(scale, scale);
      drawCell(p.cell, -CELL / 2, -CELL / 2, 0.6 * (1 - t));
      ctx.restore();
    }
  }

  function drawBoard(): void {
    const step = currentStep();
    const ctx = screen.ctx;
    ctx.save();
    // Pieces coming in from above or past the sides only show inside the board.
    ctx.beginPath();
    ctx.rect(LEFT, TOP, CELL * COLS, CELL * ROWS);
    ctx.clip();
    if (step) {
      drawGrid(step[0].grid);
      for (const s of step[0].sprites) drawSprite(s, step[1]);
    } else {
      drawGrid(game.grid);
    }
    drawPops(ticks());
    ctx.restore();
    if (banner && ticks() < banner.until) screen.text(banner.text, 130, 245, fontLarge, WHITE, 255 * Math.min(1, (banner.until - ticks()) / 400));

    const [mx, my] = input.mouse;
    if (within(input.mouse, LEFT, LEFT + CELL * COLS - 1, TOP, TOP + CELL * ROWS - 1)) {
      const col = Math.floor((mx - LEFT) / CELL);
      const row = Math.floor((my - TOP) / CELL);
      // Over a tool the cursor shrinks to that cell, since clicking uses it.
      if (game.grid[row][col]?.kind === 'tool') screen.blit(img('cursor_small'), LEFT + CELL * col - 7, TOP + CELL * row - 7);
      else screen.blit(img('cursor_large'), LEFT + CELL * Math.min(col, COLS - 2) - 7, TOP + CELL * Math.min(row, ROWS - 2) - 7);
    }
  }

  const seconds = (ms: number) => (ms < 9999000 ? floatStr(ms / 1000).slice(0, 5) : 'Lots!');
  const text = (value: string, x: number, y: number, colour = WHITE) => screen.text(value, x, y, font, colour);

  function drawPanel(): void {
    for (const m of MODES) {
      screen.blit(img(settings.mode === m.mode ? 'checkbox_yes' : 'checkbox_no'), 545, m.y + 3);
      text(m.label, 460, m.y);
    }
    for (const t of TOGGLES) {
      screen.blit(img(settings[t.key] ? 'checkbox_yes' : 'checkbox_no'), t.box[0], t.box[1]);
      text(t.label, t.text[0], t.text[1]);
    }
    screen.blit(img('box_one'), 460, 225);
    screen.blit(img('box_one'), 460, 260);
    screen.blit(img('box_two'), 575, 35);
    screen.blit(img('box4'), 733, 135);
    screen.blit(img('table'), 452, 408);
    text('Puzzle ID:', 575, 15);
    text(puzzleId, 580, 40, editing === 'puzzle' ? BLUE : WHITE);
    text('Forage:', 650, 140);
    text(editing === 'forage' ? forageText : String(settings.forageLevel), 738, 140, editing === 'forage' ? BLUE : WHITE);
    text(boardActive ? 'Stop' : 'Start', boardActive ? 493 : 490, 229);
    text('Dismiss', 473, 265, settings.mode === 'puzzle' ? GREY : WHITE);
    text('Now', 540, 425);
    text('Best', 605, 425);
    text('Time', 460, 450);
    text('Moves', 460, 475);
    text('Score', 460, 500);
    text(seconds(timePassed), 537, 450);
    text(movesUsed > 9999 ? 'Lots!' : String(movesUsed), 537, 475);
    text(String(score), 537, 500);
    if (settings.mode === 'puzzle' && !settings.scramble && record) {
      text(seconds(record.time), 602, 450);
      text(String(record.moves), 602, 475);
    }
    if (settings.mode === 'ci' && bestScore !== null) text(String(bestScore), 605, 500);
    screen.text('Created by: IGN: Jice, Discord: Jc#4182', 588, 585, fontSmall, GREY);
  }

  function frame(events: InputEvent[]): void {
    screen.fill(BLACK);
    screen.blit(img('background'), 0, 0);
    screen.blit(img('title_cursed'), 113, 0);

    for (const event of events) {
      // The desktop version acts on button release.
      if (event.type === 'mouseup' && (event.button === 1 || event.button === 3)) click(event.pos, event.button);
      else if (event.type === 'keydown') key(event.key);
    }

    if (boardActive) {
      timePassed = ticks() - startTime;
      drawBoard();
      if (playing.length) {
        // Wait for the move to finish playing before calling the puzzle cleared.
      } else if (settings.mode === 'puzzle' && game.crateCount() === 0) finishPuzzle();
      else if (settings.mode === 'ci' && timePassed >= CI_DURATION) finishCi();
    } else if (!ended) {
      screen.text('Paused', 105, 245, fontLarge);
    }
    if (ended && settings.mode === 'puzzle') {
      screen.text('Puzzle', 105, 210, fontLarge);
      screen.text('Cleared', 105, 265, fontLarge);
    }
    drawPanel();
  }

  return { frame };
}) satisfies PuzzleFactory;

/** board_pool_reserve.py's first reserve, which the desktop version used when filling puzzles. */
const RESERVE = ['xxxuuxw', 'wywvvuy', 'uxyyxwv', 'vuxvxxw', 'wwuuyxy', 'wvyyvuu', 'uxuxvwx', 'yxyywxu', 'xuwuxyx', 'wvwwxuu'];
