// The Forage simulator (app.pyw and gui_functions.py), rebuilt on the shared core, playing by
// the real game's rules and timings (engine.ts). The canvas is the board; the desktop version's
// settings column is the HTML panel beside it. Options it showed but never implemented
// (Animations, Skip, Custom ID) are left out; its unused Ants checkbox now turns ants on and off.
import { Images } from '../../core/assets';
import { SoundBank } from '../../core/audio';
import { pygameFont } from '../../core/fonts';
import { within, type InputEvent, type Point } from '../../core/input';
import type { Option } from '../../core/panel';
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

const soundUrls = import.meta.glob<string>('./sounds/*.mp3', { eager: true, query: '?url', import: 'default' });
const imageUrls = import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' });

const BLACK = 'rgb(31, 31, 31)';
const WHITE = '#ffffff';
const fontLarge = pygameFont(96);

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
/** Where the ant's count sits in its cell, by facing: left, up, right, down. */
const ANT_NUMBER_AT: Record<number, [number, number]> = { 0: [28, 13], 1: [15, 28], 2: [1, 14], 3: [13, 0] };
/**
 * The duty meter beside the board (ForagePanel.java:22, 66-69; puzzle/client/d): 9 slots stacked
 * from the bottom, 19px apart. It shows forage level + 1 bananas; collecting that many crates
 * earns the next one. bananas.png holds full, partly filled and empty tiles of 21x21.
 */
const MAX_BANANAS = 9;
const BANANA_X = 20;
const BANANA_BOTTOM = 335 + 173 - 21;
const TOOL_IMAGES: Record<string, string> = { m: 'machete', p: 'monkey', o: 'earthquake', n: 'shovel' };
const CRATE_IMAGES = ['', 'bb', 'fj', 'cc'];
/** Puzzles the random pick chooses between (the desktop version drew from 1–14). */
const RANDOM_POOL = Object.keys(PUZZLES)
  .map(Number)
  .filter((id) => id <= 14);

/**
 * CI and Infinite are cursed isle (Gauntlet) foraging; Normal is timed like CI but scores and
 * spawns crates like normal foraging.
 */
const MODES: Option<Mode>[] = [
  { value: 'puzzle', label: 'Puzzle' },
  { value: 'ci', label: 'CI (Gauntlet, 2 min)' },
  { value: 'infinite', label: 'Infinite (Gauntlet)' },
  { value: 'normal', label: 'Normal (2 min)' },
];
/** Timed modes, which keep a best score. */
const TIMED = new Set<Mode>(['ci', 'normal']);

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

export default (async ({ screen, input, panel, store, ticks }) => {
  const images = await Images.load(imageUrls);
  const img = (name: string) => images.get(name);
  const rng = new PyRandom();
  const sounds = new SoundBank<'ants'>(soundUrls);
  /** The step whose sound has played, so each plays once. */
  let sounded: Step | null = null;

  const settings: Settings = { ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>('settings', {}) };
  const saveSettings = () => store.set('settings', settings);
  const puzzleRecords = store.get<Record<string, PuzzleRecord>>('puzzleRecords', {});
  const ciBest = store.get<Record<string, number>>('ciBest', {});
  // Normal's score is points per move.
  const normalBest = store.get<Record<string, number>>('normalBestPerMove', {});
  const bests = () => (settings.mode === 'normal' ? normalBest : ciBest);

  let game = new Forage(rng, rules());
  let boardActive = false;
  let ended = false;
  let movesUsed = 0;
  let score = 0;
  /** The banana meter: bananas earned this run, and crates toward the next one. */
  let bananas = 0;
  let cratesTowardNext = 0;
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

  /** The puzzle to play; 0 picks one at random each time. */
  let puzzleId = '0';
  let pickedRandomly = false;

  const ciKey = () =>
    (['bb', 'fj', 'cc', 'eq', 'machete', 'shovel', 'monkey'] as const).map((k) => (settings[k] ? 'b' : 'a')).join('') +
    settings.forageLevel +
    // Older bests were all without ants, so those keep their keys.
    (settings.ants ? 'ants' : '');

  function rules(): Rules {
    const weights = CHEST_WEIGHTINGS[settings.forageLevel];
    return {
      specials: { n: settings.shovel, m: settings.machete, p: settings.monkey, o: settings.eq, ants: settings.ants },
      crates: settings.mode === 'puzzle' ? null : [settings.bb ? weights[0] : 0, settings.fj ? weights[1] : 0, settings.cc ? weights[2] : 0],
      // CI and Infinite are cursed isle (Gauntlet) foraging: bone boxes, fetish jars and cursed chests.
      mode: settings.mode === 'normal' ? 'forage' : 'gauntlet',
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
      bananas = Math.min(MAX_BANANAS, settings.forageLevel + 1);
      cratesTowardNext = 0;
      bestScore = TIMED.has(settings.mode) ? (bests()[ciKey()] ?? 0) : null;
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

  /** Normal foraging rates a run by points per move; the other modes show total points. */
  function shownScore(): number {
    return settings.mode === 'normal' ? (movesUsed ? score / movesUsed : 0) : score;
  }
  const scoreText = (n: number) => (settings.mode === 'normal' ? n.toFixed(2) : String(n));

  function finishCi(): void {
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
      if (settings.mode !== 'puzzle') {
        score += result.points;
        // Each crate, whatever its size, fills 1/(level + 1) of the next banana (client/o.java:586-591).
        cratesTowardNext += result.collected[0] + result.collected[1] + result.collected[2];
        while (bananas < MAX_BANANAS && cratesTowardNext >= bananas) {
          cratesTowardNext -= bananas;
          bananas++;
        }
      }
      pendingBanner = result.crateSteps >= 3 ? 'Triple!' : result.crateSteps === 2 ? 'Double!' : '';
    }
    playing = game.steps;
    game.steps = [];
    stepStart = ticks();
  }

  function toggleRunning(): void {
    if (boardActive) boardActive = false;
    else {
      boardActive = true;
      start();
    }
  }

  function key(name: string): void {
    // X and C turn anticlockwise and clockwise under the cursor, as in the game.
    if (boardActive && (name === 'x' || name === 'c')) act(input.mouse, name === 'x');
  }

  // ---- Panel ----

  const isPuzzle = () => settings.mode === 'puzzle';
  const locked = () => boardActive;
  const setting = <K extends keyof Settings>(key: K) => ({
    get: () => settings[key],
    set: (value: Settings[K]) => {
      settings[key] = value;
      saveSettings();
    },
  });
  const bind = <K extends 'scramble' | 'bb' | 'fj' | 'cc' | 'eq' | 'machete' | 'shovel' | 'monkey' | 'ants'>(group: ReturnType<typeof panel.group>, label: string, key: K, hidden?: () => boolean) => {
    const { get, set } = setting(key);
    group.toggle(label, get, set, { disabled: locked, hidden });
  };

  const setup = panel.group('Game');
  setup.select('Mode', MODES, setting('mode').get, setting('mode').set, { disabled: locked });
  setup.number('Puzzle', () => Number(puzzleId), (n) => {
    puzzleId = n in PUZZLES ? String(n) : '0';
    pickedRandomly = false;
  }, { min: 0, disabled: locked, hidden: () => !isPuzzle(), title: '0 picks a puzzle at random' });
  setup.number('Forage level', setting('forageLevel').get, setting('forageLevel').set, {
    min: 0,
    max: 15,
    disabled: locked,
    hidden: isPuzzle,
    title: 'Sets which crate sizes are likely, and how many bananas you start with',
  });
  bind(setup, 'Scramble', 'scramble', () => !isPuzzle());

  const crates = panel.group('Crates');
  bind(crates, 'Bone box', 'bb');
  bind(crates, 'Fetish jar', 'fj');
  bind(crates, 'Cursed chest', 'cc');

  const specials = panel.group('Specials');
  bind(specials, 'Earthquake', 'eq');
  bind(specials, 'Machete', 'machete');
  bind(specials, 'Shovel', 'shovel');
  bind(specials, 'Monkey', 'monkey');
  bind(specials, 'Ants', 'ants');

  panel
    .group()
    .button('Start', toggleRunning, { variant: 'primary', label: () => (boardActive ? 'Stop' : 'Start') })
    .button('New board', () => newRandomBoard(), { disabled: isPuzzle, title: 'Deal a fresh board without restarting the clock' });

  const seconds = (ms: number) => (ms < 9999000 ? floatStr(ms / 1000).slice(0, 5) : 'Lots!');
  panel.group('Score').stats(['', 'Now', 'Best'], () => {
    const puzzleBest = isPuzzle() && !settings.scramble && record;
    return [
      ['Time', seconds(timePassed), puzzleBest ? seconds(record!.time) : ''],
      ['Moves', movesUsed > 9999 ? 'Lots!' : String(movesUsed), puzzleBest ? String(record!.moves) : ''],
      [settings.mode === 'normal' ? 'Points / move' : 'Score', scoreText(shownScore()), TIMED.has(settings.mode) && bestScore !== null ? scoreText(bestScore) : ''],
    ];
  });

  // ---- Drawing ----

  /**
   * Ants from the game's media: ant.png holds 4 walking frames facing left, turned a quarter
   * clockwise per direction, with the count from ant_numbers.png placed by facing
   * (ForageBoardView.java:51, 138-148, 469-471). Still ants show frame 0; walking ones cycle at 10fps.
   */
  function drawAnt(cell: Extract<Cell, { kind: 'ant' }>, x: number, y: number, alpha: number, frame = 0): void {
    const ctx = screen.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.trunc(x) + CELL / 2, Math.trunc(y) + CELL / 2);
    ctx.rotate((cell.dir * Math.PI) / 2);
    ctx.drawImage(img('ant'), frame * CELL, 0, CELL, CELL, -CELL / 2, -CELL / 2, CELL, CELL);
    ctx.restore();
    const [nx, ny] = ANT_NUMBER_AT[cell.dir];
    screen.blit(img('ant_numbers'), x + nx, y + ny, { area: [(cell.count - 1) * 17, 0, 17, 17], alpha: alpha * 255 });
  }

  function drawCell(cell: Cell, x: number, y: number, alpha = 1, frame = 0): void {
    if (cell.kind === 'ant') return drawAnt(cell, x, y, alpha, frame);
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
      if (playing[0] !== sounded) {
        sounded = playing[0];
        if (sounded.sound) sounds.play(sounded.sound);
      }
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
    if (s.motion === 'wobble' && t < 1) y += TIMING.wobblePx * Math.sin(TIMING.wobbleRate * local + (s.phase ?? 0));
    if (s.motion === 'arc') y -= Math.sin(Math.PI * t) * (20 + 0.3 * CELL * Math.abs(s.to[1] - s.from[1]));
    if (s.motion === 'bob') {
      y -= Math.abs(Math.sin((local / 100) * Math.PI)) * 8;
      x += Math.sin((local / 200) * Math.PI) * 4;
    }
    const walking = s.cell.kind === 'ant' && (s.from[0] !== s.to[0] || s.from[1] !== s.to[1]) && t < 1;
    drawCell(s.cell, x, y, alpha, walking ? Math.floor(local / 100) % 4 : 0);
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

  function drawBananas(): void {
    const sheet = img('bananas');
    const progress = bananas < MAX_BANANAS ? cratesTowardNext / bananas : 0;
    for (let i = 0; i < MAX_BANANAS; i++) {
      const y = BANANA_BOTTOM - 19 * i;
      const tile = i < bananas ? 0 : i === bananas && progress > 0 ? 1 : 2;
      screen.blit(sheet, BANANA_X, y, { area: [tile * 21, 0, 21, 21] });
      if (tile === 1) {
        // The next banana fills from the bottom as crates come in.
        const h = Math.round(21 * progress);
        screen.blit(sheet, BANANA_X, y + 21 - h, { area: [0, 21 - h, 21, h] });
      }
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

  function frame(events: InputEvent[]): void {
    screen.fill(BLACK);
    screen.blit(img('background'), 0, 0);
    screen.blit(img('title_cursed'), 113, 0);

    for (const event of events) {
      // The desktop version acts on button release.
      if (event.type === 'mouseup' && (event.button === 1 || event.button === 3) && boardActive) act(event.pos, event.button === 1);
      else if (event.type === 'keydown') key(event.key);
    }

    if (boardActive) {
      timePassed = ticks() - startTime;
      drawBoard();
      if (playing.length) {
        // Wait for the move to finish playing before calling the puzzle cleared.
      } else if (settings.mode === 'puzzle' && game.crateCount() === 0) finishPuzzle();
      else if (TIMED.has(settings.mode) && timePassed >= CI_DURATION) finishCi();
    } else if (!ended) {
      screen.text('Paused', 105, 245, fontLarge);
    }
    if (ended && settings.mode === 'puzzle') {
      screen.text('Puzzle', 105, 210, fontLarge);
      screen.text('Cleared', 105, 265, fontLarge);
    }
    if (settings.mode !== 'puzzle' && bananas > 0) drawBananas();
  }

  return { frame, dispose: () => sounds.dispose() };
}) satisfies PuzzleFactory;

/** board_pool_reserve.py's first reserve, which the desktop version used when filling puzzles. */
const RESERVE = ['xxxuuxw', 'wywvvuy', 'uxyyxwv', 'vuxvxxw', 'wwuuyxy', 'wvyyvuu', 'uxuxvwx', 'yxyywxu', 'xuwuxyx', 'wvwwxuu'];
