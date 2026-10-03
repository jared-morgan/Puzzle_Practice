// Distilling, rebuilt from the Puzzle Pirates client (crafting/brew, build 20260909165753): the rules
// are in logic.ts, and this file is BrewBoardView, BrewPanel and BrewIndicator with their helper
// classes (client/a-j): the pieces with their lit corners, swaps, the furnace filling with heat,
// columns rising into the jug or dropping into the furnace, burnt whites rolling back along the pipe,
// the vial filling up, and the floating messages, with the client's art, sounds and timings.
// The canvas is the 450x600 puzzle panel; settings and scores are in the side panel.
//
// The client works out each column's points and sends them to the server, so the panel shows those,
// but the duty rating (Poor ... Incredible) is decided on the server, so there's no rating yet.
import { Images } from '../../core/assets';
import { SoundBank } from '../../core/audio';
import { loadFont } from '../../core/fonts';
import type { InputEvent, Point } from '../../core/input';
import type { PuzzleFactory } from '../../core/puzzle';
import {
  BrewGame,
  BURNT,
  type ColumnResult,
  type FurnaceEvent,
  HEIGHT,
  LIGHT,
  MEDIUM,
  HEAVY,
  SPICE,
  vialLiquid,
  WIDTH as COLUMNS,
} from './logic';
import delarobbUrl from './delarobb.ttf?url';

const imageUrls = import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' });
const soundUrls = import.meta.glob<string>('./sounds/*.mp3', { eager: true, query: '?url', import: 'default' });
type Sound =
  | 'swap_up'
  | 'swap_down'
  | 'burn_warning'
  | 'burn'
  | 'burnt'
  | 'smooth'
  | 'blecch'
  | 'blecch2'
  | 'crystal_clear'
  | 'crystal_clear2'
  | 'spicy'
  | 'finished';

/** The board view sits at (25, 135) in the panel, 425x465 (BrewPanel.b). */
const VIEW_X = 25;
const VIEW_Y = 135;
const VIEW_W = 425;
const VIEW_H = 465;
/** Pieces are 40px; the top row is 23px down, and short columns sit half a piece lower (BrewBoardView.a, b). */
const CELL = 40;
const TOP = 23;
/** The furnace art in view coordinates (BrewBoardView.d, e, f, g). */
const FURNACE_X = 316;
const FURNACE_Y = 399;
const FURNACE_W = 109;
const FURNACE_H = 66;
/** Where a column leaves: up off the top, or down into the furnace, at the right column's x. */
const EXIT_X = 9 * CELL;
const EXIT_UP = -CELL;
const EXIT_DOWN = 416;
/** Leaving pieces move at 0.4 px/ms; swaps take 150 ms and the board's slide 900 ms. */
const EXIT_SPEED = 0.4;
const SWAP_MS = 150;
const SLIDE_MS = 900;
/** The vial (BrewIndicator) at (235, 55), 42x75. */
const VIAL_X = 235;
const VIAL_Y = 55;
const VIAL_W = 42;
const VIAL_H = 75;
/** Message fonts (roister/client/a): size 1 for most, 0 for spice and burnt. */
const FONT_SIZES = [24, 30];
const FONT = 'Delarobb';
/** Floating messages drift 30px over 1.5 s, fading in the second half (nenya FloatingTextAnimation). */
const FLOAT_MS = 1500;
const FLOAT_PX = 30;

/** Cursor directions (BrewBoardView.b): 0 down-left, 2 up-left, 3 up, 4 up-right, 6 down-right, 7 down. */
const SW = 0;
const NW = 2;
const N = 3;
const NE = 4;
const SE = 6;
const S = 7;
/** Keys from the client's key map for Distilling (puzzle/client/w, case 14), with the number pad both ways. */
const KEY_MOVES: Record<string, number> = {
  arrowleft: SW,
  '1': SW,
  '4': SW,
  end: SW,
  arrowright: NE,
  '9': NE,
  '6': NE,
  pageup: NE,
  arrowdown: S,
  '2': S,
  arrowup: N,
  '8': N,
  '3': SE,
  pagedown: SE,
  '7': NW,
  home: NW,
};
const SWAP_KEYS = new Set(['space', '5', 'clear']);
const BURN_KEY = 'x';

const MESSAGES = {
  clear: 'Crystal clear!',
  smooth: 'Smooooooth',
  blecch: 'Blecch!',
  burnt: 'Burnt!',
  spicy: 'Spicy!',
  wasted_spice: 'Wasted Spice',
  jug_filled: 'Finished!',
};

interface Path {
  points: Point[];
  /** Time each point is reached. */
  times: number[];
  /** Called as each point after the first is reached, with its index. */
  onNode?: (i: number) => void;
  onEnd?: () => void;
  reached: number;
}

interface Piece {
  type: number;
  col: number;
  row: number;
  /** Corners lit for the directions it can swap (client/j.g). */
  mask: number;
  x: number;
  y: number;
  selected: boolean;
  path: Path | null;
}

interface Message {
  text: string;
  px: number;
  colour: string;
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  down: boolean;
}

interface Tally {
  clear: number;
  bestStreak: number;
  smooth: number;
  blecch: number;
  plain: number;
  burnt: number;
  spicy: number;
  wastedSpice: number;
  burntWhites: number;
  swaps: number;
}

const emptyTally = (): Tally => ({ clear: 0, bestStreak: 0, smooth: 0, blecch: 0, plain: 0, burnt: 0, spicy: 0, wastedSpice: 0, burntWhites: 0, swaps: 0 });

export default (async ({ screen, input, panel, store, ticks }) => {
  const [images] = await Promise.all([Images.load(imageUrls), loadFont(FONT, delarobbUrl)]);
  const img = (name: string) => images.get(name);
  const sounds = new SoundBank<Sound>(soundUrls);
  const ctx = screen.ctx;

  const PIECE_SHEETS: Record<number, string> = { [LIGHT]: 'piece_white', [MEDIUM]: 'piece_mid', [HEAVY]: 'piece_dark', [BURNT]: 'piece_white_burnt' };
  /** Each piece type with each mask of lit corners, built from the two frames by quarters (BrewBoardView.b(byte, byte)). */
  const pieceCache = new Map<number, HTMLCanvasElement>();
  function pieceImage(type: number, mask: number): CanvasImageSource {
    if (type === SPICE) return img('piece_spice');
    const key = (type << 4) | mask;
    let canvas = pieceCache.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = CELL;
      const c = canvas.getContext('2d')!;
      const sheet = img(PIECE_SHEETS[type]);
      const h = CELL / 2;
      // Quarter d lights when the piece can swap in direction d: top-right, top-left, bottom-left, bottom-right.
      const qx = [h, 0, 0, h];
      const qy = [0, 0, h, h];
      for (let q = 0; q < 4; q++) {
        const frame = mask & (1 << q) ? 1 : 0;
        c.drawImage(sheet, frame * CELL + qx[q], qy[q], h, h, qx[q], qy[q], h, h);
      }
      pieceCache.set(key, canvas);
    }
    return canvas;
  }

  let rightClickBurns = store.get<boolean>('rightClickBurns', false);
  let seedText = '';
  let lastSeed = '';
  const bests = store.get<{ points?: number; streak?: number }>('bests', {});

  let game: BrewGame | null = null;
  let active = false;
  let running = false;
  let pieces: Piece[][] = [];
  let leaving: Piece[] = [];
  let selected: Piece | null = null;
  let cursor = { col: 0, row: 0 };
  let dragMode = false;
  let dragSwapped = false;
  let mouseHeld = false;
  let lastMouse: Point = [-1, -1];
  /** Things the board waits on before taking input (BrewBoardView._waitCount). */
  let waitCount = 0;
  let swapCount = 0;
  let messages: Message[] = [];
  let timers: { at: number; run: () => void }[] = [];
  let tally = emptyTally();
  let lastResult: ColumnResult | null = null;

  const later = (ms: number, run: () => void) => timers.push({ at: ticks() + ms, run });

  /** A piece's spot in view coordinates (BrewBoardView.c). */
  function spot(col: number, row: number): Point {
    const tall = game!.board.isTallColumn(col);
    return [col * CELL, TOP + row * CELL + (tall ? 0 : CELL / 2)];
  }

  function linePath(from: Point, to: Point, duration: number, onEnd?: () => void): Path {
    const now = ticks();
    return { points: [from, to], times: [now, now + duration], onEnd, reached: 0 };
  }

  /** A path through points at a steady speed (media/util/o with a velocity). */
  function speedPath(points: Point[], speed: number, onNode?: (i: number) => void, onEnd?: () => void): Path {
    const times = [ticks()];
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
      times.push(times[i - 1] + d / speed);
    }
    return { points, times, onNode, onEnd, reached: 0 };
  }

  function stepPiece(p: Piece, now: number): void {
    const path = p.path;
    if (!path) return;
    while (path.reached < path.points.length - 1 && now >= path.times[path.reached + 1]) {
      path.reached++;
      if (path.reached < path.points.length - 1) path.onNode?.(path.reached);
    }
    if (path.reached >= path.points.length - 1) {
      [p.x, p.y] = path.points[path.points.length - 1];
      p.path = null;
      path.onEnd?.();
      return;
    }
    const i = path.reached;
    const t = (now - path.times[i]) / (path.times[i + 1] - path.times[i] || 1);
    p.x = Math.trunc(path.points[i][0] + (path.points[i + 1][0] - path.points[i][0]) * t);
    p.y = Math.trunc(path.points[i][1] + (path.points[i + 1][1] - path.points[i][1]) * t);
  }

  function makePiece(col: number, row: number, offscreen: boolean): Piece {
    const [x, y] = spot(col, row);
    return { type: game!.board.getPiece(col, row), col, row, mask: game!.board.swapMask(col, row), x: offscreen ? x - CELL : x, y, selected: false, path: null };
  }

  function makeColumn(col: number, offscreen: boolean): Piece[] {
    return game!.board.columns[col].map((_, row) => makePiece(col, row, offscreen));
  }

  const refreshMask = (p: Piece) => (p.mask = game!.board.swapMask(p.col, p.row));

  function waitFor(): () => void {
    waitCount++;
    return () => waitCount--;
  }

  // ---- Floating messages ----

  function measure(text: string, px: number): number {
    ctx.save();
    ctx.font = `${px}px "${FONT}"`;
    const w = ctx.measureText(text).width * 1.1;
    ctx.restore();
    return Math.ceil(w) + 4;
  }

  /** A message centred on the board, moved clear of others still showing (BrewBoardView.a(String, ...)). */
  function say(text: string, opts: { orange?: boolean; down?: boolean; wait?: boolean } = {}): Message {
    const px = FONT_SIZES[opts.orange || opts.down ? 0 : 1];
    const w = measure(text, px);
    const h = Math.round(px * 1.2);
    let y = (VIEW_H - h) / 2;
    const now = ticks();
    for (const m of messages) {
      const my = messageY(m, now);
      if (y < my + m.h && my < y + h) y = my + m.h;
    }
    const message: Message = { text, px, colour: opts.orange ? '#ffc800' : '#fff', x: (VIEW_W - w) / 2, y, w, h, start: now, down: !!opts.down };
    messages.push(message);
    if (opts.wait) later(FLOAT_MS, waitFor());
    return message;
  }

  /** The Crystal Clear streak number, at the message's top-right corner (BrewBoardView.a(String, Animation)). */
  function sayBeside(text: string, beside: Message): void {
    const px = FONT_SIZES[0];
    messages.push({ text, px, colour: '#fff', x: beside.x + beside.w, y: beside.y - 6, w: measure(text, px), h: Math.round(px * 1.2), start: ticks(), down: false });
  }

  function messageY(m: Message, now: number): number {
    const t = Math.min(1, (now - m.start) / FLOAT_MS);
    return m.y + (m.down ? 1 : -1) * Math.trunc(FLOAT_PX * t);
  }

  function drawMessages(now: number): void {
    messages = messages.filter((m) => now < m.start + FLOAT_MS);
    for (const m of messages) {
      const t = (now - m.start) / FLOAT_MS;
      ctx.save();
      ctx.globalAlpha = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) * 2);
      ctx.translate(VIEW_X + m.x + m.w / 2, VIEW_Y + messageY(m, now) + m.px);
      ctx.scale(1.1, 1);
      ctx.font = `${m.px}px "${FONT}"`;
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(m.text, 0, 0);
      ctx.fillStyle = m.colour;
      ctx.fillText(m.text, 0, 0);
      ctx.restore();
    }
  }

  const playLater = (name: Sound, ms: number) => later(ms, () => sounds.play(name));
  const pick = <T,>(a: T, b: T) => (Math.random() < 0.5 ? a : b);

  // ---- The game ----

  function start(): void {
    const seed = seedText.trim() ? BigInt.asIntN(64, BigInt(seedText.trim())) : BigInt.asIntN(64, BigInt(Math.floor(Math.random() * 2 ** 48)));
    lastSeed = String(seed);
    game = new BrewGame(seed, ticks());
    pieces = [];
    for (let col = 0; col < COLUMNS; col++) pieces.push(makeColumn(col, false));
    leaving = [];
    selected = null;
    cursor = { col: 0, row: 0 };
    dragMode = dragSwapped = false;
    waitCount = swapCount = 0;
    messages = [];
    timers = [];
    tally = emptyTally();
    lastResult = null;
    active = true;
    running = true;
  }

  function stop(): void {
    running = false;
    active = false;
    game = null;
    pieces = [];
    leaving = [];
    selected = null;
    messages = [];
    timers = [];
  }

  /** The player's turn is live: the session's on and nothing is sliding (PuzzleController.S, view.s). */
  const playing = () => running && !!game && !game.finished;
  const settled = () => waitCount === 0;

  function setSelected(p: Piece | null): void {
    if (selected) selected.selected = false;
    selected = p;
    if (p) p.selected = true;
  }

  /** Select a piece, or swap the selected one with the piece under the cursor (BrewBoardView.t). */
  function selOrSwap(): void {
    if (!playing() || !settled()) return;
    const piece = pieces[cursor.col]?.[cursor.row];
    if (!piece) return;
    if (!selected) {
      if (!dragMode && piece.mask) setSelected(piece);
    } else if (selected === piece) {
      if (!dragMode) setSelected(null);
    } else if (game!.board.swap(piece.col, piece.row, selected.col, selected.row)) {
      animateSwap(piece, selected);
      tally.swaps++;
      if (dragMode) dragSwapped = true;
      else setSelected(null);
    } else if (!dragMode && piece.mask) setSelected(piece);
  }

  /** Two pieces trade places over 150 ms (BrewBoardView.a(j, j)). */
  function animateSwap(a: Piece, b: Piece): void {
    const pa = spot(a.col, a.row);
    const pb = spot(b.col, b.row);
    sounds.play(pa[1] > pb[1] ? 'swap_down' : 'swap_up');
    const done = dragMode ? null : waitFor();
    a.path = linePath([a.x, a.y], pb, SWAP_MS, () => {
      done?.();
      swapEnded(a);
    });
    b.path = linePath([b.x, b.y], pa, SWAP_MS, () => swapEnded(b));
    beginSwap(a);
    beginSwap(b);
    const [ac, ar] = [a.col, a.row];
    pieces[ac][ar] = b;
    pieces[b.col][b.row] = a;
    a.col = b.col;
    a.row = b.row;
    b.col = ac;
    b.row = ar;
  }

  /** A piece starts moving: its corners go dark, and so do its neighbours' corners facing it. */
  function beginSwap(p: Piece): void {
    game!.setSettled(false);
    swapCount++;
    p.mask = 0;
    for (let dir = 0; dir < 4; dir++) {
      const n = game!.board.neighbour(p.col, p.row, dir);
      if (n) pieces[n[0]][n[1]].mask &= ~(1 << ((dir + 2) % 4));
    }
  }

  /** A swap lands: relight it and its resting neighbours, and let a due burn go once all swaps are done (client/f). */
  function swapEnded(p: Piece): void {
    refreshMask(p);
    for (let dir = 0; dir < 4; dir++) {
      const n = game!.board.neighbour(p.col, p.row, dir);
      if (n && !pieces[n[0]][n[1]].path) refreshMask(pieces[n[0]][n[1]]);
    }
    swapCount--;
    if (swapCount === 0) handle(game!.setSettled(true));
  }

  function handle(events: FurnaceEvent[]): void {
    for (const event of events) {
      if (event.type === 'warning') sounds.play('burn_warning');
      else burn(event.result, event.finished);
    }
  }

  /** The right column leaves and the board slides right (BrewBoardView.d, e), then the messages (BrewController.a(boolean, int[])). */
  function burn(result: ColumnResult, finished: boolean): void {
    lastResult = result;
    // The column leaves: up into the jug, or down into the furnace, where whites burn and roll back left.
    for (const p of pieces[COLUMNS - 1]) {
      p.mask = 0;
      if (p === selected) setSelected(null);
      const burning = !result.distilled && p.type === LIGHT;
      const exitY = result.distilled ? EXIT_UP : EXIT_DOWN;
      const points: Point[] = [[p.x, p.y], [EXIT_X, exitY]];
      if (burning) points.push([-CELL, exitY]);
      p.path = speedPath(
        points,
        EXIT_SPEED,
        () => {
          if (!burning) return;
          sounds.play('burnt');
          p.type = BURNT;
        },
        () => (leaving = leaving.filter((q) => q !== p)),
      );
      leaving.push(p);
    }
    pieces.pop();
    pieces.unshift(makeColumn(0, true));
    for (let col = 0; col < COLUMNS; col++) {
      for (const p of pieces[col]) {
        p.col = col;
        p.path = linePath([p.x, p.y], spot(col, p.row), SLIDE_MS);
        if (col === 1 || col === COLUMNS - 1) refreshMask(p);
      }
    }
    const slid = waitFor();
    const first = pieces[0][0];
    const prevEnd = first.path!.onEnd;
    first.path!.onEnd = () => {
      prevEnd?.();
      slid();
    };
    cursor.row++;
    moveCursor(N);

    // Sounds and messages.
    sounds.play('burn');
    let delay = 1350;
    if (result.verdict === 'clear') {
      playLater(pick('crystal_clear', 'crystal_clear2'), delay);
      delay += 1070;
      const m = say(MESSAGES.clear);
      if (result.bonus) sayBeside(String(1 + result.bonus / 4), m);
    } else if (result.verdict === 'smooth') {
      playLater('smooth', delay);
      delay += 1750;
      say(MESSAGES.smooth);
    } else if (result.verdict === 'blecch') {
      playLater(pick('blecch', 'blecch2'), delay);
      delay += 600;
      say(MESSAGES.blecch);
    } else if (result.verdict === 'burnt') say(MESSAGES.burnt, { down: true });
    if (result.spice === 'spicy') {
      playLater('spicy', delay);
      say(MESSAGES.spicy, { orange: true });
    } else if (result.spice === 'wasted_spice') say(MESSAGES.wasted_spice, { orange: true, down: true });

    count(result);
    if (finished) finish();
  }

  function count(r: ColumnResult): void {
    if (!r.distilled) tally.burnt++;
    else if (r.verdict === 'clear') {
      tally.clear++;
      tally.bestStreak = Math.max(tally.bestStreak, r.streak || 1);
    } else if (r.verdict === 'smooth') tally.smooth++;
    else if (r.verdict === 'blecch') tally.blecch++;
    else tally.plain++;
    if (r.spice === 'spicy') tally.spicy++;
    if (r.spice === 'wasted_spice') tally.wastedSpice++;
    if (!r.distilled) tally.burntWhites += r.lights;
  }

  /** The jug is full (BrewController.s): "Finished!" holds the board, then it clears. */
  function finish(): void {
    say(MESSAGES.jug_filled, { wait: true });
    sounds.play('finished');
    running = false;
    const points = game!.points;
    if (bests.points === undefined || points > bests.points) bests.points = points;
    if (tally.bestStreak > (bests.streak ?? 0)) bests.streak = tally.bestStreak;
    store.set('bests', bests);
    later(FLOAT_MS, () => (active = false));
  }

  function burnNow(): void {
    // BrewController "endCol": only while nothing is sliding.
    if (!playing() || !settled()) return;
    handle(game!.burnNow(ticks()));
  }

  /** Moves the cursor one hex (BrewBoardView.b). */
  function moveCursor(dir: number): void {
    if (!game) return;
    const tall = game.board.isTallColumn(cursor.col);
    let dx = 0;
    let dy = 0;
    switch (dir) {
      case SW:
        dx = -1;
        dy = tall && cursor.col !== 0 ? 0 : 1;
        break;
      case NW:
        dx = -1;
        dy = !tall && cursor.col !== 0 ? 0 : -1;
        break;
      case N:
        dy = -1;
        break;
      case NE:
        dx = 1;
        dy = !tall && cursor.col !== COLUMNS - 1 ? 0 : -1;
        break;
      case SE:
        dx = 1;
        dy = tall && cursor.col !== COLUMNS - 1 ? 0 : 1;
        break;
      case S:
        dy = 1;
        break;
      default:
        return;
    }
    const col = Math.max(0, Math.min(COLUMNS - 1, cursor.col + dx));
    const maxRow = HEIGHT - (game.board.isTallColumn(col) ? 1 : 2);
    cursor = { col, row: Math.max(0, Math.min(maxRow, cursor.row + dy)) };
  }

  /** The cursor follows the mouse; while dragging, only near a piece's centre (BrewBoardView.a(Point)). */
  function hover(pos: Point): void {
    if (!game) return;
    const vx = pos[0] - VIEW_X;
    const vy = pos[1] - VIEW_Y;
    const col = Math.max(0, Math.min(COLUMNS - 1, Math.trunc(vx / CELL)));
    const tall = game.board.isTallColumn(col);
    const row = Math.min(HEIGHT - (tall ? 1 : 2), Math.trunc(Math.max(0, vy - TOP - (tall ? 0 : CELL / 2)) / CELL));
    if (dragMode) {
      const [sx, sy] = spot(col, row);
      if (Math.hypot(vx - (sx + CELL / 2), vy - (sy + CELL / 2)) > CELL / 2 - 1) return;
    }
    cursor = { col, row };
  }

  const inView = (pos: Point) => pos[0] >= VIEW_X && pos[0] < VIEW_X + VIEW_W && pos[1] >= VIEW_Y && pos[1] < VIEW_Y + VIEW_H;
  const isBurnButton = (button: number) => button === 3 && rightClickBurns;

  // ---- Drawing ----

  function drawFurnace(): void {
    const level = game ? game.furnaceLevel() : 59;
    const x = VIEW_X + FURNACE_X;
    const y = VIEW_Y + FURNACE_Y;
    ctx.drawImage(img('furnace'), 0, 0, FURNACE_W, level, x, y, FURNACE_W, level);
    ctx.drawImage(img('furnace_hot'), 0, level, FURNACE_W, FURNACE_H - level, x, y + level, FURNACE_W, FURNACE_H - level);
  }

  function drawVial(): void {
    screen.blit(img('vial_back_dark'), VIAL_X, VIAL_Y);
    if (game && game.distilled > 0) {
      const liquid = vialLiquid(game.distilled, game.jugLights, game.jugHeavies);
      const top = VIAL_H - Math.round(liquid.level * VIAL_H);
      ctx.save();
      ctx.globalAlpha = liquid.alpha;
      ctx.fillStyle = hsb(liquid.hue, liquid.sat, liquid.bri);
      ctx.fillRect(VIAL_X, VIAL_Y + top, VIAL_W, VIAL_H - top);
      ctx.restore();
      ctx.fillStyle = '#fff';
      if (top === 0) ctx.fillRect(VIAL_X, VIAL_Y, VIAL_W, 1);
      else ctx.fillRect(VIAL_X, VIAL_Y + top - 1, VIAL_W, 2);
    }
    screen.blit(img('glass'), VIAL_X, VIAL_Y);
  }

  function drawPieces(): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(VIEW_X, VIEW_Y, VIEW_W, VIEW_H);
    ctx.clip();
    for (const p of [...pieces.flat(), ...leaving]) {
      if (p.selected) ctx.drawImage(img('selected_glow'), VIEW_X + p.x, VIEW_Y + p.y);
      ctx.drawImage(pieceImage(p.type, p.mask), VIEW_X + p.x, VIEW_Y + p.y);
    }
    ctx.restore();
  }

  function frame(events: InputEvent[]): void {
    const now = ticks();
    for (const event of events) {
      if (event.type === 'mousedown' && event.button <= 3) {
        if (!inView(event.pos)) continue;
        hover(event.pos);
        if (isBurnButton(event.button)) burnNow();
        else {
          selOrSwap();
          dragMode = true;
          mouseHeld = true;
        }
      } else if (event.type === 'mouseup' && event.button <= 3) {
        if (isBurnButton(event.button)) continue;
        if (dragSwapped && selected) setSelected(null);
        dragMode = dragSwapped = mouseHeld = false;
      } else if (event.type === 'keydown') {
        const move = KEY_MOVES[event.key];
        if (move !== undefined) moveCursor(move);
        else if (SWAP_KEYS.has(event.key)) selOrSwap();
        else if (event.key === BURN_KEY) burnNow();
      }
    }
    if (input.mouse[0] !== lastMouse[0] || input.mouse[1] !== lastMouse[1]) {
      if (inView(input.mouse)) {
        hover(input.mouse);
        if (mouseHeld) selOrSwap();
      }
      lastMouse = input.mouse;
    }

    for (const timer of timers.filter((t) => now >= t.at)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.run();
    }
    for (const p of [...pieces.flat(), ...leaving]) stepPiece(p, now);
    if (running && game) handle(game.update(now));

    screen.fill('#000');
    screen.blit(img('background'), 0, 0);
    drawVial();
    // Pieces go behind the furnace, so burning columns drop into it (they draw on the board's back layer).
    if (active) drawPieces();
    drawFurnace();
    if (active) {
      const [cx, cy] = game ? spot(cursor.col, cursor.row) : [0, 0];
      ctx.drawImage(img('cursor'), VIEW_X + cx, VIEW_Y + cy);
    }
    drawMessages(now);

    if (!active) {
      ctx.save();
      ctx.font = `30px "${FONT}"`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.fillStyle = '#fff';
      const text = game ? 'Press Start to distil again' : 'Press Start to distil';
      ctx.strokeText(text, VIEW_X + VIEW_W / 2, 360);
      ctx.fillText(text, VIEW_X + VIEW_W / 2, 360);
      ctx.restore();
    }
  }

  // ---- Panel ----

  panel.group().button('Start', () => (running ? stop() : start()), { variant: 'primary', label: () => (running ? 'Stop' : 'Start') });

  const options = panel.group('Options');
  options.toggle('Right-click burns the column', () => rightClickBurns, (on) => {
    rightClickBurns = on;
    store.set('rightClickBurns', on);
  }, { title: "The client's \"furnace right-click\" option. X always burns the column now." });
  options.text('Seed', () => seedText, (v) => (seedText = v.replace(/[^0-9-]/g, '')), {
    placeholder: 'random',
    inputMode: 'numeric',
    disabled: () => running,
    title: 'The same seed deals the same board, as the game would for that seed.',
  });
  options.note(() => (lastSeed ? `Last seed: ${lastSeed}` : ''));

  panel.group('Jug').stats(['', 'Now', 'Best'], () => {
    const g = game;
    return [
      ['In the jug', g ? `${g.distilled} / 100` : '-', ''],
      ['Furnace', g && running ? `${Math.max(0, Math.min(49, g.furnace))} / 49` : '-', ''],
      ['Columns', g ? String(g.columns.length) : '-', ''],
      ['Points', g ? String(g.points) : '-', bests.points !== undefined ? String(bests.points) : '-'],
      ['Rating', 'not yet', ''],
    ];
  }).note(() => "Points are the client's own count for each column (white 1, spice 3, brown 0, black -1, burnt white -3, plus the Crystal Clear streak bonus). The rating comes from the server, so it isn't worked out yet.");

  panel.group('Columns').stats(['', 'This brew'], () => [
    ['Crystal clear', String(tally.clear)],
    ['Longest clear streak', String(tally.bestStreak)],
    ['Smooth', String(tally.smooth)],
    ['Plain', String(tally.plain)],
    ['Blecch', String(tally.blecch)],
    ['Burnt', String(tally.burnt)],
    ['Spicy', String(tally.spicy)],
    ['Wasted spice', String(tally.wastedSpice)],
    ['Whites burned', String(tally.burntWhites)],
    ['Burnt whites owed', game ? String(Math.floor(game.board.discardedLights / 2)) : '-'],
    ['Swaps', String(tally.swaps)],
  ]);
  panel.group('Last column').stats(['', ''], () => {
    const r = lastResult;
    if (!r) return [['-', '']];
    return [
      ['Went', r.distilled ? 'into the jug' : 'into the furnace'],
      ['White / brown / black / spice', `${r.lights} / ${r.mediums} / ${r.heavies} / ${r.spices}`],
      ['Points', r.bonus ? `${r.score} + ${r.bonus} bonus` : String(r.score)],
    ];
  });

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__brew = {
      get game() {
        return game;
      },
      get pieces() {
        return pieces;
      },
      start,
      burnNow,
      setCursor: (col: number, row: number) => (cursor = { col, row }),
      selOrSwap,
    };
  }

  return { frame, dispose: () => sounds.dispose() };
}) satisfies PuzzleFactory;

/** java.awt.Color.getHSBColor as a CSS colour. */
function hsb(h: number, s: number, b: number): string {
  const hh = (h - Math.floor(h)) * 6;
  const f = hh - Math.floor(hh);
  const p = b * (1 - s);
  const q = b * (1 - s * f);
  const t = b * (1 - s * (1 - f));
  const [r, g, bl] = [
    [b, t, p],
    [q, b, p],
    [p, b, t],
    [p, q, b],
    [t, p, b],
    [b, p, q],
  ][Math.floor(hh)];
  return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(bl * 255)})`;
}
