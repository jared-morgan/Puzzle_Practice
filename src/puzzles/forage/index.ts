// The Forage simulator (app.pyw and gui_functions.py), rebuilt on the shared core.
// Layout, rules and timings follow the desktop version. Options it showed but never
// implemented (Normal mode, Animations, Ants, Skip, Custom ID) are left out.
import { Images } from '../../core/assets';
import { pygameFont } from '../../core/fonts';
import { within, type InputEvent, type Point } from '../../core/input';
import type { PuzzleFactory } from '../../core/puzzle';
import { floatStr } from '../../core/py';
import { PyRandom } from '../../core/pyrandom';
import {
  afterMove,
  type Board,
  boardCalc,
  boardTurn,
  COLS,
  createSpawner,
  emptyBoard,
  fillPuzzle,
  generateRandomBoard,
  type Mode,
  parseBoard,
  randomizeColours,
  ROWS,
  scramblePuzzle,
  type Settings,
  type ChestSpawner,
  TOOLS,
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
const X_COORDS = [67, 112, 157, 202, 247, 292, 337];
const Y_COORDS = [50, 95, 140, 185, 230, 275, 320, 365, 410, 455];
const PIECE_IMAGES: Record<string, string> = {
  u: 'piece_red',
  v: 'piece_brown',
  w: 'piece_green',
  x: 'piece_yellow',
  y: 'piece_grey',
  k: 'bb',
  g: 'fj',
  a: 'cc',
  m: 'machete',
  p: 'monkey',
  o: 'earthquake',
  n: 'shovel',
};
/** Puzzles the random pick chooses between (the desktop version drew from 1–14). */
const RANDOM_POOL = Object.keys(PUZZLES)
  .map(Number)
  .filter((id) => id <= 14);

type Toggle = 'scramble' | 'bb' | 'fj' | 'cc' | 'eq' | 'machete' | 'shovel' | 'monkey';

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
];

const DEFAULT_SETTINGS: Settings = {
  mode: 'ci',
  bb: true,
  fj: true,
  cc: false,
  eq: false,
  machete: true,
  shovel: true,
  monkey: false,
  scramble: true,
  forageLevel: 6,
};

interface PuzzleRecord {
  moves: number;
  time: number;
}

export default (async ({ screen, input, store, ticks }) => {
  const images = await Images.load(imageUrls);
  const img = (name: string) => images.get(name);
  const rng = new PyRandom();

  const settings: Settings = { ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>('settings', {}) };
  const saveSettings = () => store.set('settings', settings);
  const puzzleRecords = store.get<Record<string, PuzzleRecord>>('puzzleRecords', {});
  const ciBest = store.get<Record<string, number>>('ciBest', {});

  let board: Board = emptyBoard();
  let reserve: Board = parseBoard(RESERVE);
  let spawner: ChestSpawner | null = null;
  let boardActive = false;
  let ended = false;
  let movesUsed = 0;
  let score = 0;
  let cleared = [0, 0, 0];
  let startTime = 0;
  let timePassed = 0;
  let bestScore: number | null = null;
  let record: PuzzleRecord | null = null;

  // Text fields: the puzzle ID ("0" means random) and the forage level.
  let puzzleId = '0';
  let pickedRandomly = false;
  let forageText = String(settings.forageLevel);
  let editing: 'puzzle' | 'forage' | null = null;

  const ciKey = () =>
    (['bb', 'fj', 'cc', 'eq', 'machete', 'shovel', 'monkey'] as const).map((k) => (settings[k] ? 'b' : 'a')).join('') +
    settings.forageLevel;

  function newRandomBoard(): void {
    [board, reserve] = generateRandomBoard(settings, rng);
    spawner = createSpawner(settings, rng);
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
      board = settings.scramble ? scramblePuzzle(id, puzzle, reserve, settings, rng) : fillPuzzle(puzzle, reserve, settings, rng);
    } else {
      newRandomBoard();
      score = 0;
      cleared = [0, 0, 0];
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
      store.set('ciBest', ciBest);
    }
    bestScore = Math.max(bestScore ?? 0, score);
  }

  function clickBoard(pos: Point, button: 1 | 3): void {
    const col = Math.floor((pos[0] - 66) / 45);
    const row = Math.floor((pos[1] - 49) / 45);
    movesUsed += boardTurn(board, row, col, button, rng);
    const got = boardCalc(board, reserve, settings, rng);
    if (settings.mode === 'puzzle') return;
    cleared = cleared.map((n, i) => n + got[i]);
    score = cleared[0] + cleared[1] * 2 + cleared[2] * 3;
    if (spawner) afterMove(board, spawner, rng);
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
    if (boardActive && 66 < pos[0] && pos[0] < 380 && 49 < pos[1] && pos[1] < 498) clickBoard(pos, button);
  }

  function key(name: string): void {
    if (!editing) return;
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

  function drawBoard(): void {
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const name = PIECE_IMAGES[board[r][c]];
        if (name) screen.blit(img(name), X_COORDS[c], Y_COORDS[r]);
      }
    }
    const [mx, my] = input.mouse;
    if (66 < mx && mx < 380 && 49 < my && my < 498) {
      const col = Math.floor((mx - 66) / 45);
      const row = Math.floor((my - 49) / 45);
      if (TOOLS.has(board[row][col])) screen.blit(img('cursor_small'), X_COORDS[col] - 7, Y_COORDS[row] - 7);
      else screen.blit(img('cursor_large'), X_COORDS[Math.min(col, 5)] - 7, Y_COORDS[Math.min(row, 8)] - 7);
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
      if (settings.mode === 'puzzle' && !board.some((row) => row.some((p) => p === 'a' || p === 'g' || p === 'k'))) finishPuzzle();
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

/** board_pool_reserve.py's first reserve: what drops in before any random pieces are generated. */
const RESERVE = ['xxxuuxw', 'wywvvuy', 'uxyyxwv', 'vuxvxxw', 'wwuuyxy', 'wvyyvuu', 'uxuxvwx', 'yxyywxu', 'xuwuxyx', 'wvwwxuu'];

