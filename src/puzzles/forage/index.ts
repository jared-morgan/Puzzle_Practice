// Forage, rebuilt from the Puzzle Pirates client (duty/forage, build 20260909165753): the rules are
// in board.ts and engine.ts, and this file is ForagePanel and ForageBoardView with their helper
// classes: the client's art, sounds and timings, the cursor, crates glowing and sparkling, cleared
// pieces popping, the monkey, ants, the earthquake's bob, the banana meter, the floating messages
// and the intro and outro. The canvas is the 450x600 puzzle panel; settings and scores are in the
// side panel.
//
// On top of the client's game are the Forage Simulator's modes: Puzzle (its hand-made boards, from
// logic.ts and puzzles.ts), CI and Infinite (cursed isle foraging, with the simulator's chests and
// flat 1/2/3 scoring, crates.ts) and Normal (normal foraging on the client's crate rules and points).
import { Images } from '../../core/assets';
import { SoundBank } from '../../core/audio';
import { loadFont } from '../../core/fonts';
import type { InputEvent, Point } from '../../core/input';
import type { Option } from '../../core/panel';
import type { PuzzleFactory } from '../../core/puzzle';
import { PyRandom } from '../../core/pyrandom';
import {
  antCount,
  antFacing,
  crateKey,
  crateSize,
  CRATE_SIZES,
  EMPTY,
  HEIGHT,
  isAnts,
  isCrate,
  isCrateAnchor,
  isTool,
  makeAnts,
  makeCrate,
  WIDTH,
} from './board';
import { GauntletChests, ServerRequests, CURSED_TILES } from './crates';
import { type Cell, CELL, type Effect, Forage, type SoundName, type Sprite, type Step, TIMING } from './engine';
import { CHEST_WEIGHTINGS, fillPuzzle, type Mode, parseBoard, randomizeColours, scramblePuzzle, type Settings } from './logic';
import { PUZZLES } from './puzzles';
import delarobbUrl from './delarobb.ttf?url';

const soundUrls = import.meta.glob<string>('./sounds/*.mp3', { eager: true, query: '?url', import: 'default' });
const imageUrls = import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' });

/** The board view sits at (67, 50) in the panel, 315x450 (ForageBoardView.c, d, a, b). */
const LEFT = 67;
const TOP = 50;
const VIEW_W = WIDTH * CELL;
const VIEW_H = HEIGHT * CELL;
/** The cursor's frame reaches 7px past its cells (ForageBoardView.j). */
const CURSOR_PAD = 7;
/** The banana meter (puzzle/client/d) at (20, 335): bananas 21px, stacked 19px apart from the bottom of nine. */
const METER_X = 20;
const METER_Y = 335;
const BANANA = 21;
const BANANA_STEP = 19;
/** A banana fills in 500ms (puzzle/client/d: bananas x 500 / 100 ms a percent). */
const BANANA_MS = 500;
const FONT = 'Delarobb';
/** Floating messages drift up 30px over 1.5s, fading out in the second half. */
const FLOAT_MS = 1500;
const FLOAT_PX = 30;
/** Ants' counts sit here in their cell, by facing (ForageBoardView.g). */
const ANT_NUMBER_AT: Cell[] = [
  [28, 13],
  [15, 28],
  [1, 14],
  [13, 0],
];

const CI_DURATION = 120000;
/** Every board brings a full meter of nine. */
const BANANAS = 9;
/** Puzzles the random pick chooses between (the desktop version drew from 1–14). */
const RANDOM_POOL = Object.keys(PUZZLES)
  .map(Number)
  .filter((id) => id <= 14);

/**
 * CI and Infinite are cursed isle (Gauntlet) foraging: when a board's crates are all collected,
 * deal a new one (within the 2 minutes, for CI). Normal is normal foraging on the client's rules,
 * with no clock (the client has none), and is one board: it ends when the banana meter is full,
 * or when the player dismisses it.
 */
const MODES: Option<Mode>[] = [
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'ci', label: 'CI (Gauntlet, 2 min)' },
  { value: 'infinite', label: 'Infinite (Gauntlet)' },
  { value: 'normal', label: 'Normal' },
];
/** Modes that end and keep a best score. */
const SCORED = new Set<Mode>(['ci', 'normal']);

/**
 * Normal mode's default chest mix: observed rates of 0.65, 0.345 and 0.0047 for 1x1, 2x2 and
 * 3x2, as ratios, with the 3x2 doubled.
 */
const NORMAL_RATIOS: Settings['normalRatios'] = [0.6472, 0.3435, 0.0094];

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
  normalRatios: [...NORMAL_RATIOS],
};

interface PuzzleRecord {
  moves: number;
  time: number;
}

/** The simulator's letters as client pieces. Colours u-y are dirt, wood, grass, sand and stone. */
const LETTER_PIECES: Record<string, number> = { u: 0, v: 4, w: 1, x: 2, y: 3, n: 5, m: 6, p: 7, o: 8, z: EMPTY };

/** A puzzle board in the simulator's letters, as client cells (crates as cursed ones). */
function lettersToCells(board: string[][]): number[] {
  const cells: number[] = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const ch = board[y][x];
      if (ch in LETTER_PIECES) cells.push(LETTER_PIECES[ch]);
      else if (ch === 'q') cells.push(makeAnts(8, 3));
      // Crates: k bone box; g h / i j jar (bottom-left i); a b c / d e f chest (bottom-left d).
      else if (ch === 'k') cells.push(makeCrate(0, 0, 0));
      else if (ch === 'i') cells.push(makeCrate(0, 1, 1));
      else if (ch === 'j') cells.push(makeCrate(1, 1, 1));
      else if (ch === 'g' || ch === 'h') cells.push(makeCrate(2, 1, 1));
      else if (ch === 'd') cells.push(makeCrate(0, 2, 2));
      else if (ch === 'e' || ch === 'f') cells.push(makeCrate(1, 2, 2));
      else cells.push(makeCrate(2, 2, 2));
    }
  }
  return cells;
}

/** Something drawn for a while that doesn't hold up the board. */
interface Timed {
  effect: Effect;
  start: number;
}

export default (async ({ screen, input, panel, store, ticks }) => {
  const [images] = await Promise.all([Images.load(imageUrls), loadFont(FONT, delarobbUrl)]);
  const img = (name: string) => images.get(name);
  const rng = new PyRandom();
  const sounds = new SoundBank<SoundName>(soundUrls);

  const settings: Settings = { ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>('settings', {}) };
  const saveSettings = () => store.set('settings', settings);
  const puzzleRecords = store.get<Record<string, PuzzleRecord>>('puzzleRecords', {});
  const ciBest = store.get<Record<string, number>>('ciBest', {});
  // Normal's score is points per move.
  const normalBest = store.get<Record<string, number>>('normalBestPerMove', {});
  const bests = () => (settings.mode === 'normal' ? normalBest : ciBest);

  /** Normal foraging looks like the fruit jungle; the rest are cursed isle boards. */
  const cursed = () => settings.mode !== 'normal';

  let game = newGame();
  let boardActive = false;
  let ended = false;
  let movesUsed = 0;
  let score = 0;
  /** The banana meter: crates collected on this board, and how full it's drawn (0-100%). */
  let crates = 0;
  let meterShown = 0;
  let meterAt = 0;
  let startTime = 0;
  let timePassed = 0;
  let bestScore: number | null = null;
  let record: PuzzleRecord | null = null;
  /** The move being animated, and when its current step started. */
  let playing: Step[] = [];
  let stepStart = 0;
  let timed: Timed[] = [];
  /** The intro or outro: pieces flying on or off the board. */
  let flight: { pieces: { piece: number; at: Cell; from: Point; duration: number }[]; start: number; out: boolean } | null = null;
  /** The cursor's top-left cell (ForageBoardView._cpos). */
  let cursor: Cell = [4, 6];

  /** The puzzle to play; 0 picks one at random each time. */
  let puzzleId = '0';
  let pickedRandomly = false;

  const ciKey = () =>
    (['bb', 'fj', 'cc', 'eq', 'machete', 'shovel', 'monkey'] as const).map((k) => (settings[k] ? 'b' : 'a')).join('') +
    (settings.mode === 'normal' ? settings.normalRatios.join('-') : settings.forageLevel) +
    // Older bests were all without ants, so those keep their keys.
    (settings.ants ? 'ants' : '');

  /** Crate weights for the mode, with turned-off crates at 0. */
  function crateWeights(): [number, number, number] {
    const w = settings.mode === 'normal' ? settings.normalRatios : CHEST_WEIGHTINGS[settings.forageLevel];
    return [settings.bb ? w[0] : 0, settings.fj ? w[1] : 0, settings.cc ? w[2] : 0];
  }

  /** A fresh client board from a random seed, with the mode's crates and the chosen specials. */
  function newGame(): Forage {
    const seed = BigInt(Math.floor(Math.random() * 2 ** 48));
    const source =
      settings.mode === 'normal'
        ? new ServerRequests(rng, crateWeights(), BANANAS)
        : settings.mode === 'puzzle'
          ? {}
          : new GauntletChests(rng, crateWeights(), BANANAS);
    const g = new Forage(seed, source);
    // Shovel, machete, monkey, earthquake, ants.
    g.board.allowed = [settings.shovel, settings.machete, settings.monkey, settings.eq, settings.ants];
    if (settings.mode !== 'normal') g.crateArt = [...CURSED_TILES];
    return g;
  }

  /** Deals a board; New board keeps the clock running. */
  function newBoard(restartClock = false): void {
    playing = [];
    timed = [];
    game = newGame();
    crates = 0;
    meterShown = 0;
    intro(restartClock);
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
      playing = [];
      timed = [];
      game = newGame();
      game.load(lettersToCells(settings.scramble ? scramblePuzzle(id, puzzle, reserve, settings, rng) : fillPuzzle(puzzle, reserve, settings, rng)));
      intro(true);
    } else {
      newBoard(true);
      score = 0;
      bestScore = SCORED.has(settings.mode) ? (bests()[ciKey()] ?? 0) : null;
    }
    timePassed = 0;
  }

  /** Pieces fly in from beyond the nearest corner, 1 ms a pixel along an arc (client/j). */
  function intro(restartClock: boolean): void {
    sounds.play(cursed() ? 'cursed_intro' : 'intro');
    flight = { pieces: flyingPieces(), start: ticks(), out: false };
    // The clock starts once the pieces are in.
    if (restartClock) startTime = ticks() + flightLength();
  }

  function outro(delay = 0): void {
    flight = { pieces: flyingPieces(), start: ticks() + delay, out: true };
    window.setTimeout(() => sounds.play('outro'), delay);
  }

  function flyingPieces() {
    const out: { piece: number; at: Cell; from: Point; duration: number }[] = [];
    game.cells.forEach((piece, i) => {
      if (piece === EMPTY || (isCrate(piece) && !isCrateAnchor(piece))) return;
      const at: Cell = [i % WIDTH, Math.floor(i / WIDTH)];
      const [px, py] = pieceTopLeft(piece, at);
      const fx = px < VIEW_W / 2 ? -(Math.random() * 90 + 45) : VIEW_W + Math.random() * 90;
      const fy = py < VIEW_H / 2 ? -(Math.random() * 90 + 45) : VIEW_H + Math.random() * 90;
      out.push({ piece, at, from: [fx, fy], duration: (Math.abs(fx - px) + Math.abs(fy - py)) * TIMING.introPerPx });
    });
    return out;
  }

  const flightLength = () => Math.max(0, ...(flight?.pieces.map((p) => p.duration) ?? []));

  function finishPuzzle(): void {
    ended = true;
    boardActive = false;
    if (settings.scramble) return;
    const best = record ?? { moves: movesUsed, time: timePassed };
    record = { moves: Math.min(best.moves, movesUsed), time: Math.min(best.time, timePassed) };
    puzzleRecords[puzzleId] = record;
    store.set('puzzleRecords', puzzleRecords);
  }

  /** Normal foraging rates a run by points per move; the other modes show total points. */
  function shownScore(): number {
    return settings.mode === 'normal' ? (movesUsed ? score / movesUsed : 0) : score;
  }
  const scoreText = (n: number) => (settings.mode === 'normal' ? n.toFixed(2) : String(n));

  function finishScored(): void {
    ended = true;
    boardActive = false;
    const key = ciKey();
    const best = bests();
    const final = shownScore();
    if (final > (best[key] ?? 0)) {
      best[key] = final;
      store.set(settings.mode === 'normal' ? 'normalBestPerMove' : 'ciBest', best);
    }
    bestScore = Math.max(bestScore ?? 0, final);
    // A full meter is "Great work!" in the client, and the pieces fly off a second later.
    if (settings.mode === 'normal' && boardDone()) {
      timed.push({ effect: { kind: 'text', text: 'Great work!', size: 32, delay: 0 }, start: ticks() });
      outro(TIMING.outroDelay);
    } else outro();
  }

  /** The board can take a click: playing, not mid-cascade, not flying in or out. */
  const inPlay = () => boardActive && !playing.length && !flight;

  /** A turn or tool with the cursor's top-left at `cell`; clicks during a cascade are dropped, as in the client. */
  function act(cell: Cell, ccw: boolean): void {
    if (!inPlay()) return;
    game.steps = [];
    const outcome = game.act(cell[0], cell[1], ccw);
    if (outcome === 'illegal') return;
    if (outcome === 'moved') {
      movesUsed++;
      const result = game.lastResult;
      if (settings.mode === 'normal') score += result.points;
      else if (settings.mode !== 'puzzle') score += result.gauntletPoints;
      crates += result.collected[0] + result.collected[1] + result.collected[2];
      // The score sound, by the move's client points (client/o.p()).
      if (result.points > 0 && !(settings.mode === 'normal' && crates >= BANANAS)) {
        const last = game.steps[game.steps.length - 1];
        last.sounds.push({ name: result.points > 14 ? 'score_big' : result.points > 7 ? 'score_medium' : 'score_small', delay: last.duration });
      }
    }
    playing = game.steps;
    game.steps = [];
    stepStart = ticks();
    startStep();
  }

  /** Plays the current step's sounds and starts its effects. */
  function startStep(): void {
    const step = playing[0];
    if (!step) return;
    const heard = new Set<string>();
    for (const s of step.sounds) {
      const key = `${s.name}@${s.delay}`;
      if (heard.has(key)) continue;
      heard.add(key);
      if (s.delay <= 0) sounds.play(s.name);
      else window.setTimeout(() => sounds.play(s.name), s.delay);
    }
    for (const effect of step.effects) timed.push({ effect, start: stepStart + effect.delay });
  }

  function toggleRunning(): void {
    // Dismissing a Normal session ends it early, with no best recorded.
    if (boardActive && settings.mode === 'normal') {
      boardActive = false;
      ended = true;
    } else if (boardActive) boardActive = false;
    else {
      boardActive = true;
      start();
    }
  }

  // ---- Cursor (ForageBoardView.d, w, e; client/o.a(int)) ----

  const toolAt = (x: number, y: number) => isTool(game.board.getPiece(x, y));

  /** The mouse picks the cell under it if that's a tool (the cursor shrinks to it), else the 2x2 there. */
  function cursorFromMouse([mx, my]: Point): void {
    const px = mx - LEFT;
    const py = my - TOP;
    let x = Math.max(0, Math.min(Math.floor(px / CELL), WIDTH - 1));
    let y = Math.max(0, Math.min(HEIGHT - 1, Math.floor(py / CELL)));
    if (!toolAt(x, y)) {
      x = Math.max(0, Math.min(Math.floor(px / CELL), WIDTH - 2));
      y = Math.max(0, Math.min(HEIGHT - 2, Math.floor(py / CELL)));
    }
    cursor = [x, y];
  }

  /** Arrow keys: the cursor stays a 2x2 inside the board, except on a tool in the last row or column. */
  function moveCursor(dx: number, dy: number): void {
    const [cx, cy] = cursor;
    const x = Math.max(cx + dx, 0);
    const y = Math.max(cy + dy, 0);
    if ((x < WIDTH - 1 && y < HEIGHT - 1) || (x < WIDTH && y < HEIGHT && toolAt(x, y))) cursor = [x, y];
    else if (cx === WIDTH - 2 && cy === HEIGHT - 2 && toolAt(WIDTH - 1, HEIGHT - 1)) cursor = [WIDTH - 1, HEIGHT - 1];
    else if (cx === WIDTH - 1 && cy === HEIGHT - 1 && !toolAt(x, y)) cursor = [WIDTH - 2, HEIGHT - 2];
  }

  /** After a move the cursor re-fits the board (ForageBoardView.w). */
  function refitCursor(): void {
    let x = Math.max(0, Math.min(cursor[0], WIDTH - 1));
    let y = Math.max(0, Math.min(HEIGHT - 1, cursor[1]));
    if (!toolAt(x, y)) {
      x = Math.max(0, Math.min(cursor[0], WIDTH - 2));
      y = Math.max(0, Math.min(HEIGHT - 2, cursor[1]));
    }
    cursor = [x, y];
  }

  const overBoard = ([mx, my]: Point) => mx >= LEFT && mx < LEFT + VIEW_W && my >= TOP && my < TOP + VIEW_H;

  function key(name: string): void {
    if (!boardActive) return;
    // X turns anticlockwise and C clockwise, as in the game; the arrows move the cursor.
    if (name === 'x' || name === 'c') act(cursor, name === 'x');
    else if (name === 'arrowleft') moveCursor(-1, 0);
    else if (name === 'arrowright') moveCursor(1, 0);
    else if (name === 'arrowup') moveCursor(0, -1);
    else if (name === 'arrowdown') moveCursor(0, 1);
  }

  // ---- Panel ----

  const isPuzzle = () => settings.mode === 'puzzle';
  const locked = () => boardActive;
  const setting = <K extends keyof Settings>(k: K) => ({
    get: () => settings[k],
    set: (value: Settings[K]) => {
      settings[k] = value;
      saveSettings();
    },
  });
  const bind = <K extends 'scramble' | 'bb' | 'fj' | 'cc' | 'eq' | 'machete' | 'shovel' | 'monkey' | 'ants'>(
    group: ReturnType<typeof panel.group>,
    label: string,
    k: K,
    hidden?: () => boolean,
  ) => {
    const { get, set } = setting(k);
    group.toggle(label, get, set, { disabled: locked, hidden });
  };

  const isCi = () => settings.mode === 'ci';
  panel.clock(() => {
    if (isCi()) return { label: 'Time left', ms: CI_DURATION - timePassed, countdown: true, warn: boardActive && CI_DURATION - timePassed < 10000 };
    const puzzleBest = isPuzzle() && !settings.scramble && record;
    return { label: 'Time', ms: timePassed, best: puzzleBest ? record!.time : null };
  });

  const session = panel.group();
  session.select('Mode', MODES, setting('mode').get, setting('mode').set, { disabled: locked });
  session.number(
    'Puzzle',
    () => Number(puzzleId),
    (n) => {
      puzzleId = n in PUZZLES ? String(n) : '0';
      pickedRandomly = false;
    },
    { min: 0, disabled: locked, hidden: () => !isPuzzle(), title: '0 picks a puzzle at random' },
  );
  session.note(() => {
    const on = (list: [string, boolean][]) => list.filter(([, b]) => b).map(([name]) => name);
    const parts: string[] = [];
    if (isPuzzle()) {
      if (settings.scramble) parts.push('Scrambled');
    } else if (settings.mode !== 'normal') parts.push(`Forage level ${settings.forageLevel}`);
    const crates = on([['Bone box', settings.bb], ['Fetish jar', settings.fj], ['Cursed chest', settings.cc]]);
    const specials = on([['Earthquake', settings.eq], ['Machete', settings.machete], ['Shovel', settings.shovel], ['Monkey', settings.monkey], ['Ants', settings.ants]]);
    parts.push(crates.length ? crates.join(', ') : 'No special crates');
    if (specials.length) parts.push(specials.join(', '));
    return parts.join(' · ');
  });
  session
    .button('Start', toggleRunning, { variant: 'primary', label: () => (!boardActive ? 'Start' : settings.mode === 'normal' ? 'Dismiss' : 'Stop') })
    .button('New board', () => newBoard(), {
      disabled: () => isPuzzle() || settings.mode === 'normal' || !boardActive,
      title: 'Deal a fresh board and bananas without restarting the clock; crates from a move still playing out still count',
    });

  panel
    .group('Score')
    .stats(['', 'Now', 'Best'], () => {
      const puzzleBest = isPuzzle() && !settings.scramble && record;
      return [
        ['Moves', movesUsed > 9999 ? 'Lots!' : String(movesUsed), puzzleBest ? String(record!.moves) : ''],
        ...(settings.mode === 'normal' ? [['Points', String(score), '']] : []),
        [settings.mode === 'normal' ? 'Points / move' : 'Score', scoreText(shownScore()), SCORED.has(settings.mode) && bestScore !== null ? scoreText(bestScore) : ''],
      ];
    });

  const setup = panel.settings.group('Game', { hidden: () => settings.mode === 'normal' });
  setup.number('Forage level', setting('forageLevel').get, setting('forageLevel').set, {
    min: 0,
    max: 15,
    disabled: locked,
    hidden: () => isPuzzle(),
    title: 'Sets which crate sizes are likely',
  });
  bind(setup, 'Scramble', 'scramble', () => !isPuzzle());

  const crateGroup = panel.settings.group('Crates');
  bind(crateGroup, 'Bone box', 'bb');
  bind(crateGroup, 'Fetish jar', 'fj');
  bind(crateGroup, 'Cursed chest', 'cc');

  const ratios = panel.settings.group('Chest ratios', { columns: 3, hidden: () => settings.mode !== 'normal' });
  (['1x1', '2x2', '3x2'] as const).forEach((label, i) =>
    ratios.number(
      label,
      () => settings.normalRatios[i],
      (value) => {
        settings.normalRatios[i] = value;
        saveSettings();
      },
      { min: 0, step: 0.0001, disabled: locked },
    ),
  );
  ratios.button(
    'Defaults',
    () => {
      settings.normalRatios = [...NORMAL_RATIOS];
      saveSettings();
    },
    { disabled: locked, title: 'Rates of 0.65, 0.345 and 0.0047 as ratios, with the 3x2 doubled' },
  );

  const specials = panel.settings.group('Specials');
  bind(specials, 'Earthquake', 'eq');
  bind(specials, 'Machete', 'machete');
  bind(specials, 'Shovel', 'shovel');
  bind(specials, 'Monkey', 'monkey');
  bind(specials, 'Ants', 'ants');

  // ---- Drawing ----

  /** A piece's image's top-left in view pixels when its anchor cell is at `at`: crates draw up from their bottom-left cell. */
  function pieceTopLeft(piece: number, [x, y]: Cell): Point {
    const up = isCrateAnchor(piece) ? CRATE_SIZES[crateSize(piece)].height - 1 : 0;
    return [x * CELL, (y - up) * CELL];
  }

  /** Ants: ant.png is 4 walking frames facing left, turned a quarter clockwise per facing, with their count. */
  function drawAnts(piece: number, x: number, y: number, alpha: number, frame: number): void {
    const ctx = screen.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.trunc(x) + CELL / 2, Math.trunc(y) + CELL / 2);
    ctx.rotate((antFacing(piece) * Math.PI) / 2);
    ctx.drawImage(img('ant'), frame * CELL, 0, CELL, CELL, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.restore();
    const [nx, ny] = ANT_NUMBER_AT[antFacing(piece)];
    screen.blit(img('ant_numbers'), x + nx, y + ny, { area: [(antCount(piece) - 1) * 17, 0, 17, 17], alpha: alpha * 255 });
  }

  /** A crate's glow pulses between 40% and full behind it (ForageBoardView.c, E). */
  function glowAlpha(now: number): number {
    const t = (now % 1600) / 800;
    return 0.4 + 0.6 * (t < 1 ? t : 2 - t);
  }

  /**
   * A crate with its glow and, for fruit, gems and gold, a sparkle that plays one time in three at
   * 20 fps (ForageBoardView.c, k).
   */
  function drawCrate(piece: number, x: number, y: number, alpha: number, now: number): void {
    const size = crateSize(piece);
    const { width, height } = CRATE_SIZES[size];
    const art = game.crateArt[crateKey(piece)];
    const ctx = screen.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    const fruit = !cursed();
    if (size < 2) {
      const glow = img(`glow_${size === 0 ? 'small' : 'large'}_${fruit ? 'fruit' : 'cursed'}`);
      const off = size === 0 ? -15 : -27;
      ctx.globalAlpha = alpha * glowAlpha(now);
      ctx.drawImage(glow, x + off, y + off);
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(img(`crate${width}x${height}`), art * width * CELL, 0, width * CELL, height * CELL, x, y, width * CELL, height * CELL);
    const flash = fruit ? (size === 0 ? 'sparks_small_fruit' : size === 1 ? 'sparks_large_fruit' : art === 0 ? 'sparks_gems' : 'sparks_gold') : null;
    if (flash) {
      const sheet = img(flash);
      const fw = size === 0 ? 76 : size === 1 ? 145 : 135;
      const fh = size === 0 ? 76 : size === 1 ? 145 : 90;
      const frames = Math.floor(sheet.width / fw);
      const frame = Math.floor(now / 50) % (frames * 3);
      const off = size === 0 ? -15 : size === 1 ? -27 : 0;
      if (frame < frames) ctx.drawImage(sheet, frame * fw, 0, fw, fh, x + off, y + off, fw, fh);
    }
    ctx.restore();
  }

  /** Draws a piece with its image's top-left at view pixel (x, y). */
  function drawPiece(piece: number, x: number, y: number, alpha = 1, frame = 0, now = ticks()): void {
    if (piece === EMPTY || (isCrate(piece) && !isCrateAnchor(piece))) return;
    if (isAnts(piece)) return drawAnts(piece, x, y, alpha, frame);
    if (isCrate(piece)) return drawCrate(piece, x, y, alpha, now);
    screen.blit(img('pieces'), x, y, { area: [piece * CELL, 0, CELL, CELL], ...(alpha < 1 && { alpha: alpha * 255 }) });
  }

  function drawCells(cells: readonly number[]): void {
    cells.forEach((piece, i) => {
      if (piece === EMPTY) return;
      const [x, y] = pieceTopLeft(piece, [i % WIDTH, Math.floor(i / WIDTH)]);
      drawPiece(piece, x, y);
    });
  }

  /** The step playing now, moving past finished ones; null once the move has played out. */
  function currentStep(now: number): [Step, number] | null {
    while (playing.length) {
      const elapsed = now - stepStart;
      if (elapsed < playing[0].duration) return [playing[0], elapsed];
      stepStart += playing[0].duration;
      playing.shift();
      if (playing.length) startStep();
      else refitCursor();
    }
    return null;
  }

  function spritePosition(s: Sprite, local: number, t: number): Point {
    const [fx, fy] = pieceTopLeft(s.piece, s.from);
    const [tx, ty] = pieceTopLeft(s.piece, s.to);
    if (s.path === 'arc') {
      // A quarter ellipse: across first, then down (or up).
      const a = (t * Math.PI) / 2;
      return [fx + (tx - fx) * Math.sin(a), fy + (ty - fy) * (1 - Math.cos(a))];
    }
    let y = fy + (ty - fy) * t;
    if (s.path === 'wobble' && t < 1) y += TIMING.wobblePx * Math.sin(TIMING.wobbleRate * local + (s.phase ?? 0));
    return [fx + (tx - fx) * t, y];
  }

  function drawSprite(s: Sprite, elapsed: number, now: number): void {
    const local = elapsed - s.delay;
    if (s.clear) {
      if (local >= s.duration) return;
      const alpha = local < 0 ? 1 : 1 - 0.8 * (local / Math.max(1, s.duration));
      const [x, y] = pieceTopLeft(s.piece, s.from);
      return drawPiece(s.piece, x, y, alpha, 0, now);
    }
    const t = local < 0 ? 0 : Math.min(1, local / Math.max(1, s.duration));
    const [x, y] = spritePosition(s, local, t);
    const frame = s.walk && t < 1 ? Math.floor(Math.max(0, local) / 100) % 4 : 0;
    drawPiece(s.piece, x, y, 1, frame, now);
  }

  /** The monkey: 17 frames 135px square; drops in and leaves at 1 px/ms, dances at 10 fps. */
  function drawMonkey(step: Step, elapsed: number): void {
    const sheet = img('monkey');
    for (const m of step.monkey) {
      const local = elapsed - m.delay;
      if (local < 0 || local >= m.duration) continue;
      const [bx, by] = [m.box[0] * CELL, m.box[1] * CELL];
      let y = by;
      let frame = 0;
      if (m.kind === 'drop') y = -3 * CELL + (by + 3 * CELL) * (local / m.duration);
      else if (m.kind === 'leave') {
        y = by - (by + 3 * CELL) * (local / m.duration);
        frame = 16;
      } else frame = Math.min(16, Math.floor(local / 100));
      const ctx = screen.ctx;
      ctx.save();
      if (m.facing === 1) {
        ctx.translate(LEFT + bx + 135, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(sheet, frame * 135, 0, 135, 135, 0, TOP + y, 135, 135);
      } else ctx.drawImage(sheet, frame * 135, 0, 135, 135, LEFT + bx, TOP + y, 135, 135);
      ctx.restore();
    }
  }

  /** Cleared fruit pops (piece0-4.png, 5 frames of 90px at about 13 fps) over its cell. */
  function drawPop(effect: Extract<Effect, { kind: 'pop' }>, age: number): boolean {
    const frame = Math.floor(age / (1000 / 13));
    if (frame >= TIMING.popFrames) return false;
    const [x, y] = effect.at;
    screen.blit(img(`piece${effect.piece}`), LEFT + x * CELL - 22, TOP + y * CELL - 23, { area: [frame * 90, 0, 90, 90] });
    return true;
  }

  /** Floating messages, centred over the board, rising and fading. */
  function drawText(effect: Extract<Effect, { kind: 'text' }>, age: number): boolean {
    if (age >= FLOAT_MS) return false;
    const size = Math.max(20, Math.min(32, effect.size));
    const ctx = screen.ctx;
    ctx.save();
    ctx.globalAlpha = age < FLOAT_MS / 2 ? 1 : 1 - (age - FLOAT_MS / 2) / (FLOAT_MS / 2);
    ctx.font = `${size}px "${FONT}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = cursed() ? '#2a0d3a' : '#2b1a05';
    ctx.fillStyle = cursed() ? '#e8d4ff' : '#fff2b0';
    const y = TOP + VIEW_H / 2 - (FLOAT_PX * age) / FLOAT_MS;
    ctx.strokeText(effect.text, LEFT + VIEW_W / 2, y);
    ctx.fillText(effect.text, LEFT + VIEW_W / 2, y);
    ctx.restore();
    return true;
  }

  function drawTimed(now: number, layer: 'pop' | 'text'): void {
    timed = timed.filter((t) => {
      const age = now - t.start;
      if (age < 0) return true;
      if (t.effect.kind !== layer) return true;
      return t.effect.kind === 'pop' ? drawPop(t.effect, age) : drawText(t.effect, age);
    });
  }

  function drawFlight(now: number): void {
    const f = flight!;
    const elapsed = Math.max(0, now - f.start);
    let done = true;
    for (const p of f.pieces) {
      const [cx, cy] = pieceTopLeft(p.piece, p.at);
      const t = Math.min(1, elapsed / Math.max(1, p.duration));
      if (t < 1) done = false;
      const [sx, sy, ex, ey] = f.out ? [cx, cy, p.from[0], p.from[1]] : [p.from[0], p.from[1], cx, cy];
      const a = (t * Math.PI) / 2;
      const x = sx + (ex - sx) * Math.sin(a);
      const y = sy + (ey - sy) * (1 - Math.cos(a));
      if (f.out && t >= 1) continue;
      drawPiece(p.piece, x, y, 1, 0, now);
    }
    if (done) {
      if (f.out) game.board.cells.fill(EMPTY);
      flight = null;
    }
  }

  /** How full the meter should be, 0-100%: each crate is one banana. */
  const meterTarget = () => Math.min(100, (crates * 100) / BANANAS);
  /** Every crate this board will bring has been collected. */
  const boardDone = () => crates >= BANANAS && meterShown >= 100;

  /** Moves the drawn meter toward its target at 500ms a banana. */
  function stepMeter(now: number): void {
    const target = meterTarget();
    const elapsed = now - meterAt;
    meterAt = now;
    if (target < meterShown) meterShown = 0;
    meterShown = Math.min(target, meterShown + (elapsed * 100) / (BANANAS * BANANA_MS));
  }

  /** bananas.png: empty, full, outline. The fill spreads over the bananas from the bottom up (puzzle/client/d, h). */
  function drawBananas(): void {
    const sheet = img('bananas');
    const total = meterShown * BANANAS;
    for (let i = 0; i < BANANAS; i++) {
      const y = METER_Y + (9 - i - 1) * BANANA_STEP;
      screen.blit(sheet, METER_X, y, { area: [0, 0, BANANA, BANANA] });
      const pct = Math.max(0, Math.min(100, total - i * 100));
      const h = Math.floor((pct * BANANA) / 100);
      if (h > 0) screen.blit(sheet, METER_X, y + BANANA - h, { area: [BANANA, BANANA - h, BANANA, h] });
    }
  }

  function drawBoard(now: number): void {
    const ctx = screen.ctx;
    ctx.save();
    // Pieces coming in from above or past the sides only show inside the board.
    ctx.beginPath();
    ctx.rect(LEFT, TOP, VIEW_W, VIEW_H);
    ctx.clip();
    ctx.translate(LEFT, TOP);
    let step: [Step, number] | null = null;
    if (flight) {
      if (!flight.out || now < flight.start) drawCells(flight.out ? game.cells : []);
      drawFlight(now);
    } else {
      step = currentStep(now);
      if (step) {
        drawCells(step[0].board);
        // Pieces waiting to be replaced go underneath, so the monkey's new pieces show over them as they fly.
        for (const s of step[0].sprites) if (s.clear) drawSprite(s, step[1], now);
        for (const s of step[0].sprites) if (!s.clear) drawSprite(s, step[1], now);
      } else drawCells(game.cells);
    }
    ctx.translate(-LEFT, -TOP);
    drawTimed(now, 'pop');
    if (step) drawMonkey(step[0], step[1]);
    ctx.restore();
    // The cursor shows while the board is in play; over a tool it shrinks to that cell.
    if (boardActive && !flight) {
      const small = toolAt(cursor[0], cursor[1]);
      screen.blit(img(small ? 'small_cursor' : 'cursor'), LEFT + cursor[0] * CELL - CURSOR_PAD, TOP + cursor[1] * CELL - CURSOR_PAD);
    }
    drawTimed(now, 'text');
  }

  function bigText(lines: string[]): void {
    const ctx = screen.ctx;
    ctx.save();
    ctx.font = `48px "${FONT}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#1a1020';
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => {
      const y = TOP + VIEW_H / 2 + (i - (lines.length - 1) / 2) * 56;
      ctx.strokeText(line, LEFT + VIEW_W / 2, y);
      ctx.fillText(line, LEFT + VIEW_W / 2, y);
    });
    ctx.restore();
  }

  function frame(events: InputEvent[]): void {
    const now = ticks();
    screen.blit(img(cursed() ? 'background_cursed' : 'background'), 0, 0);
    const title = img(cursed() ? 'title_cursed' : 'title');
    screen.blit(title, Math.round((450 - title.width) / 2), Math.round((TOP - title.height) / 2));

    if (boardActive && overBoard(input.mouse)) cursorFromMouse(input.mouse);
    for (const event of events) {
      // The client acts as the button goes down; left is anticlockwise, right clockwise.
      if (event.type === 'mousedown' && (event.button === 1 || event.button === 3) && boardActive && overBoard(event.pos)) {
        cursorFromMouse(event.pos);
        act(cursor, event.button === 1);
      } else if (event.type === 'keydown') key(event.key);
    }

    if (boardActive) {
      timePassed = Math.max(0, now - startTime);
      if (playing.length || flight) {
        // Wait for the move to finish playing before calling anything over.
      } else if (settings.mode === 'puzzle' && game.crateCount() === 0) {
        finishPuzzle();
        outro();
      } else if (settings.mode === 'ci' && timePassed >= CI_DURATION) finishScored();
      else if (settings.mode === 'normal' && boardDone()) finishScored();
      // A Gauntlet board whose crates are all in makes way for the next one.
      else if ((settings.mode === 'ci' || settings.mode === 'infinite') && boardDone()) newBoard();
    }
    if (boardActive || ended || flight) drawBoard(now);
    else drawTimed(now, 'text');
    if (!boardActive && !ended && !flight) bigText(['Paused']);
    if (ended && settings.mode === 'puzzle' && !flight) bigText(['Puzzle', 'Cleared']);
    stepMeter(now);
    if (settings.mode !== 'puzzle') drawBananas();
  }

  return { frame, dispose: () => sounds.dispose() };
}) satisfies PuzzleFactory;

/** board_pool_reserve.py's first reserve, which the desktop version used when filling puzzles. */
const RESERVE = ['xxxuuxw', 'wywvvuy', 'uxyyxwv', 'vuxvxxw', 'wwuuyxy', 'wvyyvuu', 'uxuxvwx', 'yxyywxu', 'xuwuxyx', 'wvwwxuu'];
