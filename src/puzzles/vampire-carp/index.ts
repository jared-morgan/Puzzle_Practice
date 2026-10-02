// Vampire Carp (Vampire_Carp.pyw and gui_functions.py), rebuilt on the shared core.
//
// The frame runs in the same phases as the desktop loop, and every random draw happens in the
// same order with the same seeds, so a seed from Seeded mode deals the same holes and pieces in
// both versions. State that the original kept in parallel lists per hole lives on Hole objects.
import { SoundBank } from '../../core/audio';
import { Images } from '../../core/assets';
import { copyText, pasteText } from '../../core/clipboard';
import { pygameFont } from '../../core/fonts';
import { within, type InputEvent, type Point } from '../../core/input';
import type { PuzzleFactory } from '../../core/puzzle';
import { floatStr, pyRound } from '../../core/py';
import { PyRandom } from '../../core/pyrandom';
import { THREE_PIECE_HOLES, TWO_PIECE_HOLES, TWO_PIECE_HOLES_WITH_X } from './holes';
import {
  applyPiece,
  applyPutty,
  checkPlacement,
  copyGrid,
  createHole,
  createSmallHole,
  emptyGrid,
  type Grid,
  holeComplete,
  holesWith,
  type NewHole,
  type Piece,
  PIECE_WEIGHTS_NO_PUTTY,
  PIECES_NO_PUTTY,
  puttyFill,
  snap,
  tearHole,
} from './shapes';

const imageUrls = import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' });
const soundUrls = import.meta.glob<string>('./sounds/*.mp3', { eager: true, query: '?url', import: 'default' });

const WHITE = '#ffffff';
const BLUE = 'rgb(85, 162, 250)';
const GREY = 'rgb(150, 150, 150)';
const PURPLE = 'rgb(153, 51, 204)';
const font = pygameFont(32);
const fontLarge = pygameFont(48);
const statsFont = pygameFont(26);
const statsFontSmall = pygameFont(14);

const PIECES = ['f', 'i', 'l', 'n', 'p', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'b'];
const PIECE_WEIGHTS = [14, 2, 8, 8, 22, 7, 4, 4, 4, 3, 14, 4, 1];
const ASYM_PIECES = ['y', 'n', 'l', 'i'];
const MAX_HOLES = 17;
const SESSION_SHORT = 120000;
const SESSION_LONG = 999999999999999999;
const MAX_SEED = 999999999999999;

/** play_sound numbers from sounds.py. */
const SOUNDS: Record<number, string> = {
  1: 'audio_fanfare',
  2: 'audio_hole_craftsmanship',
  3: 'audio_hole_masterpiece',
  4: 'audio_hole_pigs_breakfast',
  5: 'audio_piece_place_perfect',
  6: 'audio_putty_use',
  8: 'audio_piece_rattle_warning_slow',
  9: 'audio_piece_rattle_warning_fast',
  10: 'audio_hole_blinky_warning_slow',
  11: 'audio_hole_blinky_warning_medium',
  12: 'audio_hole_blinky_warning_fast',
  13: 'audio_piece_fly_off',
  14: 'audio_hole_grows',
  15: 'warning',
  16: 'audio_piece_place_overlap',
  17: 'audio_pb_sound',
  18: 'audio_options_change',
};

/** Cheat panel: the piece under each cell of cheats_ui.png. */
const CHEAT_PIECES: { x: [number, number]; y: [number, number]; letter: string }[] = [
  { x: [450, 499], y: [448, 498], letter: 'p' },
  { x: [500, 549], y: [448, 498], letter: 'f' },
  { x: [550, 599], y: [448, 498], letter: 'y' },
  { x: [600, 649], y: [448, 498], letter: 't' },
  { x: [650, 699], y: [448, 498], letter: 'b' },
  { x: [450, 499], y: [499, 547], letter: 'w' },
  { x: [500, 549], y: [499, 547], letter: 'u' },
  { x: [550, 599], y: [499, 547], letter: 'n' },
  { x: [600, 649], y: [499, 547], letter: 'v' },
  { x: [450, 499], y: [548, 600], letter: 'l' },
  { x: [500, 549], y: [548, 600], letter: 'z' },
  { x: [550, 599], y: [548, 600], letter: 'x' },
  { x: [600, 648], y: [548, 600], letter: 'i' },
];

/**
 * Where each hole comes from when the board scrolls by [dx, dy]: the hole that was at that
 * position ('h') or a newly made one ('t'), and the index the original used for each.
 */
const SCROLL_SOURCES: Record<string, ['h' | 't', number][]> = {
  '198,0': [['t', 1], ['h', 0], ['t', 3], ['h', 2]],
  '198,342': [['t', 3], ['t', 1], ['t', 2], ['h', 0]],
  '198,-342': [['t', 0], ['h', 2], ['t', 1], ['t', 3]],
  '-198,0': [['h', 1], ['t', 0], ['h', 3], ['t', 2]],
  '-198,342': [['t', 0], ['t', 2], ['h', 1], ['t', 3]],
  '-198,-342': [['h', 3], ['t', 1], ['t', 2], ['t', 0]],
  '0,342': [['t', 2], ['t', 3], ['h', 0], ['h', 1]],
  '0,-342': [['h', 2], ['h', 3], ['t', 0], ['t', 1]],
};

interface Config {
  volume: number;
  cheats: boolean;
  ghost: boolean;
  speed: boolean;
  speedHoles: number;
  speedSize: number;
  unlimited: boolean;
  /** Index into PIECES_NO_PUTTY, or 12 for any piece. */
  speedLetter: number;
}

const DEFAULT_CONFIG: Config = {
  volume: 1,
  cheats: false,
  ghost: false,
  speed: false,
  speedHoles: 1,
  speedSize: 3,
  unlimited: false,
  speedLetter: 3,
};

/** Default keys from keybinds.yaml: flip, rotate anticlockwise, rotate clockwise, toolbox 1–3, place. */
const KEYS = ['space', 'x', 'c', '1', '2', '3', 'z'];

interface PlacedPiece extends Piece {
  x: number;
  y: number;
}

class Hole {
  grid: Grid = emptyGrid();
  /** The shape as dealt (or after tearing); what's drawn as black cells. */
  original: Grid = emptyGrid();
  prob: Grid = emptyGrid();
  edges: Grid = emptyGrid();
  pieces: PlacedPiece[] = [];
  putty: [number, number][][] = [];
  /** Pieces placed into this hole, counting ones that later flew out (holes_pieces_total). */
  total = 0;
  /** Placements elsewhere since this hole was last touched; at 8 a piece flies out or the hole tears. */
  focus = 0;
  focusPast = 0;
  teared = 0;
  completed = false;
  generated = false;
  ready = false;
  startedAt = 0;
  needed: string[] = [];
  code = '';

  /** Starts over with a freshly dealt hole. */
  deal(hole: NewHole): void {
    this.grid = hole.grid;
    this.original = copyGrid(hole.grid);
    this.prob = hole.prob;
    this.edges = hole.edges;
    this.clearPieces();
  }

  clearPieces(): void {
    this.pieces = [];
    this.putty = [];
    this.total = 0;
    this.focus = 0;
    this.teared = 0;
    this.startedAt = 0;
  }
}

interface FlyingPiece {
  piece: Piece;
  pos: [number, number];
  end: [number, number];
  step: [number, number];
}

interface SessionTable {
  sessions: number;
  total_score: number;
  total_holes: number;
  total_pieces: number;
  max_score: number;
  most_vp: number;
  most_holes: number;
  most_pieces: number;
  average_holes: number;
  score_per_hole: number;
  average_score: number;
  average_pieces: number;
}

export default (async ({ screen, input, store, ticks }) => {
  const images = await Images.load(imageUrls);
  const img = (name: string) => images.get(name);
  const sounds = new SoundBank(soundUrls);
  const play = (n: number) => SOUNDS[n] && sounds.play(SOUNDS[n]);
  /** The original's module-level `random`, reseeded exactly where it reseeded. */
  const rng = new PyRandom();

  const config: Config = { ...DEFAULT_CONFIG, ...store.get<Partial<Config>>('config', {}) };
  const saveConfig = () => store.set('config', config);
  const bestScores = store.get<Record<string, number>>('bestScores', {});
  sounds.setVolume(config.volume / 6);

  // ---- Game state (names follow the original where that helps cross-reference) ----
  const holes = [new Hole(), new Hole(), new Hole(), new Hole()];
  let tempHoles: NewHole[] = [blankHole(), blankHole(), blankHole(), blankHole()];
  let toolbox: string[] = ['', '', ''];
  let toolboxRotation = [0, 0, 0];
  let toolboxFlip = [0, 0, 0];
  let cursor: Piece = { letter: '', rotation: 0, flip: 0 };
  let toolboxBlank = 0;
  let puttyInToolbox = false;
  /** [hole, x, y] of a piece picked back up for a second chance, or hole -1. */
  let cursorLocked: [number, number, number] = [-1, 1, 1];
  let lastHole = -1;
  let holesOrder = [0, 1, 2, 3];
  /** [flip, rotate anticlockwise, rotate clockwise, slot 1, slot 2, slot 3]: 1 from the mouse, 2 from the keyboard. */
  const actions = [0, 0, 0, 0, 0, 0];
  let soundRefresh = 0;
  const soundHierarchy = [0, 0, 0, 0];
  let boardActive = false;
  let boardReset = false;
  let startProcedure = false;
  let timePassed = 0;
  let warningPlayed = false;
  let scoreFull = [0, 0, 0];
  let scoreTotal = 0;
  let startTime = 0;
  /** [held, when, held long enough that releasing places the piece]. */
  let mouseHeld: [boolean, number, boolean] = [false, 0, false];
  let legalMove = false;
  let perfectMove = 0;
  let speedHoleCompleted = false;
  const jiggleTimer = [0, 0];
  const jiggleOffset = [
    [0, 0],
    [0, 0],
  ];
  let holeFlash = [1, 1, 1, 4, 0];
  let pauseTime = 0;
  let cheatsUsed = false;
  let sightUsed = false;
  let completionText = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const COMPLETION_LOCATIONS = [
    [25, 125],
    [200, 125],
    [25, 470],
    [200, 470],
  ];
  let flying: (FlyingPiece | null)[] = [null, null, null];
  let flyTimer = 0;
  let backgrounds = [
    [18, 34],
    [774, 628],
    [18, 628],
    [774, 34],
  ];
  let backgroundsBackup = backgrounds.map((p) => [...p]);
  /** vector, start time, active, duration, current offset */
  let scroll = { vec: [0, 0], start: 0, active: false, duration: 1000, offset: [0, 0] };
  let scrollCorner = [1, 1, 1, 1];
  let startScroll = false;
  let endScroll: [boolean, number] = [false, 0];
  let holesCreated = 0;
  let holesFilled = 0;
  let holesFilledTotal = 0;
  let timeAnimating = 0;
  let scoreCounting = true;
  let holesSeed = rng.randintN(0, MAX_SEED);
  let piecesSeed = rng.randintN(0, MAX_SEED);
  let rotationSeed = rng.randintN(0, MAX_SEED);
  let seedsAtStart = [holesSeed, piecesSeed, rotationSeed];
  let seeded = false;
  let piecesUntilRefresh = 0;
  let codesInUse = ['', '', '', ''];
  let requiredLetter = '';
  let numToolbox: number[] = [];
  let endProcedureComplete = false;
  let endProcedureKey = '';
  let sessionScoresComputed = false;
  const sessionScores: Record<string, SessionTable> = {};
  let finalAverageFocus = 0;

  // Stats for the end-of-session table.
  let piecesFound: Record<string, number> = {};
  let keyboardVsMouse: [string, number, number] = ['H', 0, 0];
  let piecesPlaced = 0;
  let flipCount = 0;
  let spinCount = 0;
  let holeTimers = [0, 999999999];
  let piecesReplaced = 0;
  let scrollsCount = [0, 0];
  let averageFocus: number[] = [0];
  let pDrought = [0, 0];

  let bestScoresKey = '';
  let bestScore = 0;
  let loadBestScore = true;
  const sessionTime = () => (config.unlimited ? SESSION_LONG : SESSION_SHORT);

  function blankHole(): NewHole {
    return { grid: emptyGrid(), prob: emptyGrid(), edges: emptyGrid() };
  }

  function smallHoleTable(): ReturnType<typeof holesWith> {
    if (config.speedSize === 2) return requiredLetter === 'x' ? [...TWO_PIECE_HOLES_WITH_X] : holesWith(TWO_PIECE_HOLES, requiredLetter);
    return holesWith(THREE_PIECE_HOLES, requiredLetter);
  }

  function makeSmallHole(z: number): void {
    const [small, next] = createSmallHole(rng, config.speedSize, codesInUse, smallHoleTable(), holesSeed);
    holesSeed = next;
    const hole = holes[z];
    hole.grid = small.grid;
    hole.original = copyGrid(small.grid);
    hole.prob = small.prob;
    hole.edges = small.edges;
    hole.needed = small.needed;
    codesInUse[z] = small.code;
  }

  function countFound(letter: string): void {
    piecesFound[letter] = (piecesFound[letter] ?? 0) + 1;
    if (letter === 'p') {
      if (pDrought[1] > pDrought[0]) pDrought[0] = pDrought[1];
      pDrought[1] = 0;
    } else {
      pDrought[1]++;
    }
  }

  /** Seeded draw of a new toolbox piece into `slot` (normal mode). */
  function dealSeededPiece(slot: number): void {
    rng.seed(piecesSeed);
    piecesSeed++;
    if (puttyInToolbox) {
      toolbox[slot] = rng.choiceWeighted(PIECES_NO_PUTTY, PIECE_WEIGHTS_NO_PUTTY);
    } else {
      toolbox[slot] = rng.choiceWeighted(PIECES, PIECE_WEIGHTS);
      if (toolbox[slot] === 'b') puttyInToolbox = true;
    }
    countFound(toolbox[slot]);
  }

  function randomOrientation(slot: number): void {
    toolboxRotation[slot] = ASYM_PIECES.includes(toolbox[slot]) ? rng.choicesUniform([0, 180]) : rng.choicesUniform([0, 90, 180, 270]);
    toolboxFlip[slot] = rng.choicesUniform([0, 1]);
  }

  /** Called after a piece leaves the toolbox and lands: refills the gap in normal mode. */
  function refillAfterPlacement(): void {
    if (toolboxBlank < 0 || config.speed) return;
    dealSeededPiece(toolboxBlank);
    rng.seed(rotationSeed);
    rotationSeed++;
    randomOrientation(toolboxBlank);
    toolboxBlank = -1;
  }

  function recordFocusAverage(): void {
    let sum = 0;
    let count = 0;
    for (const hole of holes) {
      if (!hole.completed) {
        sum += hole.total;
        count++;
      }
    }
    averageFocus.push(sum / count);
  }

  /** Every other live hole loses a little attention when a piece lands in hole z. */
  function shiftFocus(z: number): void {
    holes.forEach((hole, a) => {
      if (a === z) {
        hole.focusPast = hole.focus;
        hole.focus = 0;
      } else if (!hole.completed && hole.generated) {
        hole.focusPast = hole.focus;
        hole.focus++;
      }
    });
  }

  const slotOf = (i: number) => ((i % 3) + 3) % 3;

  // ---- Clicks on the side panel ----

  function panelClick(pos: Point): void {
    if (config.cheats) {
      const cheat = CHEAT_PIECES.find((c) => within(pos, c.x[0], c.x[1], c.y[0], c.y[1]));
      if (cheat) {
        if (cheat.letter === 'b') puttyInToolbox = true;
        else if (cursor.letter === 'b') puttyInToolbox = false;
        cursor = { letter: cheat.letter, rotation: 0, flip: 0 };
        cheatsUsed = true;
      }
    }
    if (within(pos, 740, 800, 540, 600)) {
      config.volume = config.volume === 3 ? 0 : config.volume + 1;
      sounds.setVolume(config.volume / 6);
    } else if (within(pos, 540, 554, 8, 22)) {
      config.cheats = !config.cheats;
      cheatsUsed = true;
    } else if (within(pos, 565, 579, 98, 112)) {
      config.unlimited = !config.unlimited;
      cheatsUsed = true;
    } else if (within(pos, 530, 544, 38, 52)) {
      loadBestScore = true;
      config.ghost = !config.ghost;
      sightUsed = true;
      if (config.ghost) config.speed = false;
    } else if (within(pos, 530, 544, 68, 82)) {
      loadBestScore = true;
      boardActive = false;
      config.speed = !config.speed;
      if (config.speed) config.ghost = false;
    } else if (within(pos, 625, 645, 65, 85)) {
      loadBestScore = true;
      boardActive = false;
      config.speedHoles = config.speedHoles === 4 ? 1 : config.speedHoles + 1;
    } else if (within(pos, 702, 722, 65, 85)) {
      loadBestScore = true;
      boardActive = false;
      if (config.speedSize < 3) config.speedSize++;
      else {
        config.speedSize = 1;
        config.speedLetter = 12;
      }
    } else if (within(pos, 730, 744, 68, 82)) {
      if (config.speedSize > 1) {
        loadBestScore = true;
        boardActive = false;
        config.speedLetter = config.speedLetter < 12 ? config.speedLetter + 1 : 0;
      }
    } else if (within(pos, 455, 522, 220, 240)) {
      scoreCounting = !scoreCounting;
      boardActive = false;
    } else if (within(pos, 545, 559, 128, 142)) {
      boardActive = false;
      seeded = !seeded;
    } else if (seeded) {
      if (within(pos, 572, 586, 125, 142)) {
        boardActive = false;
        copyText(seedString(), 'Copy this seed:');
        play(18);
      } else if (within(pos, 595, 609, 125, 142)) {
        boardActive = false;
        play(18);
        void pasteText('Paste a seed:').then((text) => {
          if (text && /^\d{45}$/.test(text)) {
            holesSeed = Number(text.slice(0, 15));
            piecesSeed = Number(text.slice(15, 30));
            rotationSeed = Number(text.slice(30));
          }
          seedsAtStart = [holesSeed, piecesSeed, rotationSeed];
        });
      } else if (within(pos, 618, 632, 125, 142)) {
        boardActive = false;
        holesSeed = rng.randintN(0, MAX_SEED);
        piecesSeed = rng.randintN(0, MAX_SEED);
        rotationSeed = rng.randintN(0, MAX_SEED);
        seedsAtStart = [holesSeed, piecesSeed, rotationSeed];
        copyText(seedString(), 'Copy this seed:');
        play(18);
      }
    }
    saveConfig();

    if (within(pos, 460, 574, 250, 280)) {
      if (!boardActive) startProcedure = true;
      boardActive = !boardActive;
    }
    if (within(pos, 460, 574, 290, 320) && boardActive) boardReset = true;
    if (within(pos, 460, 574, 330, 360)) {
      if (boardActive) pauseTime = timePassed;
      else if (pauseTime > 0) startTime = ticks();
      if (timePassed > 0 && timePassed < sessionTime() && pauseTime > 0) boardActive = !boardActive;
    }
  }

  /**
   * The seed as three 15-digit numbers. The desktop version didn't zero-pad, so seeds with
   * a short part couldn't be pasted back; padded seeds paste into both versions.
   */
  function seedString(): string {
    return seedsAtStart.map((s) => String(s).padStart(15, '0')).join('');
  }

  // ---- Clicks on the board ----

  function holeBounds(z: number): [number, number, number, number] {
    return [z === 0 || z === 2 ? 18 : 235, z === 0 || z === 2 ? 234 : 432, z === 0 || z === 1 ? 33 : 411, z === 0 || z === 1 ? 231 : 591];
  }

  function boardClick(pos: Point, kind: 'D' | 'U' | 'K'): void {
    if (cursorLocked[0] === -1) {
      for (let slot = 0; slot < 3; slot++) {
        if (within(pos, 90 + 91 * slot, 180 + 91 * slot, 288, 379)) {
          actions[3 + slot] = 1;
          keyboardVsMouse[1]++;
          if (kind === 'D') mouseHeld = [true, ticks(), false];
          break;
        }
      }
    }
    if (scroll.active) return;
    for (let z = 0; z < 4; z++) {
      const [x1, x2, y1, y2] = holeBounds(z);
      if (!within(pos, x1, x2, y1, y2) || !legalMove) continue;
      const hole = holes[z];
      if (cursor.letter !== '' && !hole.completed) {
        if (cursorLocked[0] === -1 || cursorLocked[0] === z) placePiece(z, pos);
      } else if (lastHole === z && hole.pieces.length > 0) {
        // Second chance: pick the piece just placed back up, locked to this hole.
        if (kind === 'D') mouseHeld = [true, ticks(), false];
        piecesUntilRefresh++;
        const last = hole.pieces.pop()!;
        cursorLocked = [z, last.x, last.y];
        cursor = { letter: last.letter, rotation: last.rotation, flip: last.flip };
        hole.edges = applyPiece(hole.grid, cursor, last.x, last.y, z, false);
        hole.total--;
      }
    }
  }

  function placePiece(z: number, pos: Point): void {
    const hole = holes[z];
    let [x, y] = snap(pos);
    piecesUntilRefresh--;
    if (cursorLocked[0] === -1) {
      if (hole.total === 0) hole.startedAt = timePassed;
      piecesPlaced++;
    } else {
      piecesReplaced++;
    }
    if (cursor.letter === 'b') {
      const [works, fills] = puttyFill(hole.grid, x, y, z);
      if (!works) return;
      holeFlash = [1, 1, 1, 4, timePassed];
      puttyInToolbox = false;
      hole.total++;
      if (cursorLocked[0] === -1) recordFocusAverage();
      soundRefresh = 1;
      play(6);
      lastHole = -1;
      shiftFocus(z);
      refillAfterPlacement();
      hole.pieces.push({ ...cursor, x, y });
      applyPutty(hole.grid, fills, true);
      hole.putty.push(fills);
      cursor = { letter: '', rotation: 0, flip: 0 };
      return;
    }
    holeFlash = [1, 1, 1, 4, timePassed];
    hole.total++;
    if (cursorLocked[0] === -1) {
      recordFocusAverage();
      soundRefresh = 1;
    }
    play(perfectMove === 5 ? 5 : 16);
    if (cursorLocked[0] === -1) {
      mouseHeld = [false, 0, false];
      lastHole = z;
      shiftFocus(z);
      refillAfterPlacement();
    } else {
      // A second-chance piece can only move one cell from where it was.
      x = Math.max(cursorLocked[1] - 18, Math.min(cursorLocked[1] + 18, x));
      y = Math.max(cursorLocked[2] - 18, Math.min(cursorLocked[2] + 18, y));
      lastHole = -1;
      cursorLocked[0] = -1;
      mouseHeld = [false, 0, false];
    }
    hole.pieces.push({ ...cursor, x, y });
    hole.edges = applyPiece(hole.grid, cursor, x, y, z, true);
    cursor = { letter: '', rotation: 0, flip: 0 };
  }

  /** Handles every click, unlike the original, which kept only the last one in a frame. */
  function handleEvents(events: InputEvent[]): void {
    for (const event of events) {
      if (event.type === 'mousedown') {
        handleClick(event.button, event.pos, event.button === 1 ? 'D' : 'R');
      } else if (event.type === 'keydown' && boardActive) {
        for (let x = 0; x < 6; x++) {
          if (event.key !== KEYS[x]) continue;
          if (x >= 3 && cursorLocked[0] === -1) {
            actions[x] = 2;
            keyboardVsMouse[2]++;
          } else if (x <= 2) {
            actions[x] = 1;
          }
        }
        if (event.key === KEYS[6]) {
          mouseHeld = [false, 0, false];
          handleClick(1, input.mouse, 'K');
        }
      } else if (event.type === 'mouseup' && mouseHeld[2] && event.button === 1) {
        // Drag and drop: releasing after holding a piece for 100ms places it.
        mouseHeld = [false, 0, false];
        handleClick(1, event.pos, 'U');
      }
    }
  }

  function handleClick(button: number, pos: Point, kind: 'D' | 'R' | 'K' | 'U'): void {
    if (button === 1) {
      if (kind === 'D') panelClick(pos);
      if (boardActive) boardClick(pos, kind as 'D' | 'U' | 'K');
    }
    if (boardActive && kind === 'R') {
      if (button === 3) actions[0] = 1;
      else if (button === 4) actions[1] = 1;
      else if (button === 5 || button === 2) actions[2] = 1;
    }
  }

  function applyActions(): void {
    if (mouseHeld[0] && !mouseHeld[2] && ticks() > mouseHeld[1] + 100) mouseHeld[2] = true;
    if (actions[0] === 1) {
      cursor.flip = cursor.flip === 0 ? 1 : 0;
      cursor.rotation = 360 - cursor.rotation;
      actions[0] = 0;
      flipCount++;
    }
    if (actions[1] === 1) {
      if (cursor.rotation === 360) cursor.rotation = 0;
      cursor.rotation += 90;
      actions[1] = 0;
      spinCount++;
    }
    if (actions[2] === 1) {
      if (cursor.rotation === 0) cursor.rotation = 360;
      cursor.rotation -= 90;
      actions[2] = 0;
      spinCount++;
    }
    for (let slot = 0; slot < 3; slot++) {
      const action = actions[3 + slot];
      if (action === 0) continue;
      const take = () => {
        cursor = { letter: toolbox[slot], rotation: toolboxRotation[slot], flip: toolboxFlip[slot] };
        toolbox[slot] = '';
        toolboxBlank = slot;
        lastHole = -1;
      };
      if (cursor.letter === '') {
        take();
      } else {
        // Put the piece in hand back where it came from; the keyboard then takes the chosen slot.
        const back = slotOf(toolboxBlank);
        toolbox[back] = cursor.letter;
        toolboxRotation[back] = cursor.rotation;
        toolboxFlip[back] = cursor.flip;
        cursor = { letter: '', rotation: 0, flip: 0 };
        if (action === 2) take();
      }
      actions[3 + slot] = 0;
    }
  }

  // ---- Starting a session or a new board ----

  function startOrReset(): void {
    if (startProcedure) {
      holesFilledTotal = 0;
      sessionScoresComputed = false;
      cheatsUsed = false;
      if (!seeded) {
        holesSeed = rng.randintN(0, MAX_SEED);
        piecesSeed = rng.randintN(0, MAX_SEED);
        rotationSeed = rng.randintN(0, MAX_SEED);
      } else {
        [holesSeed, piecesSeed, rotationSeed] = seedsAtStart;
        cheatsUsed = true;
      }
      seedsAtStart = [holesSeed, piecesSeed, rotationSeed];
      piecesFound = {};
      keyboardVsMouse = ['H', 0, 0];
      piecesReplaced = 0;
      piecesPlaced = 0;
      flipCount = 0;
      spinCount = 0;
      timeAnimating = 0;
      scrollsCount = [0, 0];
      averageFocus = [0];
      pDrought = [0, 0];
      holeTimers = [0, 999999999];
      sightUsed = false;
      startTime = ticks();
      timePassed = 0;
      scoreFull = [0, 0, 0];
      scoreTotal = 0;
      pauseTime = 0;
      endProcedureComplete = false;
      if (config.unlimited) cheatsUsed = true;
    }
    holesOrder = [0, 1, 2, 3];
    flying = [null, null, null];
    completionText = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    jiggleTimer[0] = jiggleTimer[1] = 0;
    holeFlash = [-1, -1, -1, 4, 0];
    mouseHeld = [false, 0, false];
    puttyInToolbox = false;
    for (const hole of holes) {
      hole.grid = emptyGrid();
      hole.original = emptyGrid();
      hole.edges = emptyGrid();
      hole.clearPieces();
      hole.focusPast = 0;
      hole.generated = false;
      hole.ready = true;
      hole.needed = [];
    }
    warningPlayed = false;
    cursor = { letter: '', rotation: 0, flip: 0 };
    toolboxBlank = -1;
    cursorLocked = [-1, 1, 1];
    lastHole = -1;
    scrollCorner = [1, 1, 1, 1];
    backgrounds = [
      [18, 34],
      [774, 628],
      [18, 628],
      [774, 34],
    ];
    backgroundsBackup = backgrounds.map((p) => [...p]);
    holesCreated = 0;
    holesFilled = 0;
    rng.seed(holesSeed);
    holesSeed++;
    rng.shuffle(holesOrder);
    toolbox = ['', '', ''];
    piecesUntilRefresh = 0;
    codesInUse = ['', '', '', ''];
    requiredLetter = config.speedLetter < 12 ? PIECES_NO_PUTTY[config.speedLetter] : '';

    for (const z of holesOrder) {
      if (holesCreated >= MAX_HOLES) continue;
      if (config.speed) {
        if (config.speedHoles > holesCreated) {
          makeSmallHole(z);
          holesCreated++;
          holes[z].generated = true;
          holes[z].ready = false;
        }
      } else {
        const [hole, next] = createHole(rng, holesSeed);
        holesSeed = next;
        tempHoles[z] = hole;
        holes[z].prob = hole.prob;
        holes[z].edges = hole.edges;
        holes[z].original = copyGrid(hole.grid);
        holesCreated++;
        holes[z].generated = true;
        holes[z].ready = false;
      }
    }
    for (const hole of holes) hole.completed = false;
    play(1);

    if (config.speed) {
      if (config.speedSize === 1) {
        const needed = rng.shuffle(holes.flatMap((h) => h.needed));
        const dealt = Math.min(3, config.speedHoles);
        for (let z = 0; z < dealt; z++) toolbox[z] = needed[z];
        for (let z = dealt; z < 3; z++) {
          toolbox[z] = rng.choiceWeighted(PIECES_NO_PUTTY, PIECE_WEIGHTS_NO_PUTTY);
          countFound(toolbox[z]);
        }
      } else {
        piecesUntilRefresh = config.speedSize;
        dealSpeedCombination();
      }
    } else {
      for (let z = 0; z < 3; z++) dealSeededPiece(z);
    }
    numToolbox = [0, 1, 2].filter((x) => toolbox[x] !== '');
    for (const x of numToolbox) {
      rng.seed(rotationSeed);
      rotationSeed++;
      randomOrientation(x);
    }

    if (!config.speed) {
      startScroll = true;
      timeAnimating += 1000;
      scroll = { vec: [396, 0], start: timePassed, active: true, duration: 1000, offset: [0, 0] };
    } else {
      startScroll = false;
      scroll = { vec: [0, 0], start: 0, active: true, duration: 1000, offset: [0, 0] };
    }
    endScroll = [false, 0];
    startProcedure = false;
    boardReset = false;
  }

  /** Speed carp with 2–3 piece holes: the toolbox holds one way to fill one of the holes. */
  function dealSpeedCombination(): void {
    const pools = holes.map((h, i) => (h.needed.length ? i : -1)).filter((i) => i >= 0);
    const pool = rng.choicesUniform(pools);
    const combination = rng.choicesUniform(holes[pool].needed);
    combination.split('').forEach((letter, y) => (toolbox[y] = letter));
    rng.shuffle(toolbox);
  }

  // ---- Completed holes ----

  function checkCompletions(): void {
    holes.forEach((hole, z) => {
      if (hole.completed || !hole.generated) return;
      hole.completed = holeComplete(hole.grid);
      if (!hole.completed) return;
      const took = timePassed - hole.startedAt;
      if (took > holeTimers[0]) holeTimers[0] = took;
      if (took < holeTimers[1]) holeTimers[1] = took;
      lastHole = -1;
      const perfect = config.speed ? config.speedSize : 5;
      const grade = hole.total === perfect ? 2 : hole.total === perfect + 1 ? 1 : 0;
      scoreFull[grade]++;
      holesFilled++;
      holesFilledTotal++;
      if (!config.speed) {
        play([4, 2, 3][grade]);
        completionText[0][z] = 3 - grade;
        completionText[1][z] = timePassed;
        return;
      }
      clearSpeedHole(z);
      if (config.speedSize > 1) speedHoleCompleted = true;
    });
  }

  /** Speed carp: empties hole z and deals a new hole into a free spot. */
  function clearSpeedHole(z: number): void {
    const hole = holes[z];
    hole.original = emptyGrid();
    hole.grid = emptyGrid();
    hole.edges = emptyGrid();
    hole.clearPieces();
    hole.generated = false;
    lastHole = -1;
    hole.ready = false;
    hole.needed = [];
    const free = [0, 1, 2, 3].filter((i) => !holes[i].generated);
    if (4 - free.length < config.speedHoles) {
      rng.shuffle(free);
      const target = free[0];
      makeSmallHole(target);
      holes[target].generated = true;
      holes[target].completed = false;
      holes[target].ready = false;
    }
  }

  function speedRefresh(): void {
    if (!(config.speedSize > 1 && config.speed)) return;
    if (piecesUntilRefresh !== 0 && !speedHoleCompleted) return;
    if (!speedHoleCompleted) {
      // Out of pieces without finishing: one more random piece.
      piecesUntilRefresh++;
      const slot = rng.choicesUniform([0, 1, 2]);
      toolbox[slot] = rng.choiceWeighted(PIECES_NO_PUTTY, PIECE_WEIGHTS_NO_PUTTY);
      countFound(toolbox[slot]);
      for (const x of numToolbox) randomOrientation(x);
      return;
    }
    speedHoleCompleted = false;
    // Holes left half-filled count as failures and are replaced.
    holes.forEach((hole, z) => {
      if (hole.completed || !hole.generated || hole.total <= 0) return;
      scoreFull[0]++;
      hole.completed = false;
      codesInUse[z] = '';
      clearSpeedHole(z);
    });
    toolbox = ['', '', ''];
    piecesUntilRefresh = config.speedSize;
    dealSpeedCombination();
    for (const x of numToolbox) randomOrientation(x);
  }

  /** Normal carp: when a full row or column of holes is done, the board scrolls to bring in new ones. */
  function planScroll(): void {
    if (config.speed || endScroll[0]) return;
    const [c0, c1, c2, c3] = holes.map((h) => h.completed);
    const roomForDiagonal = holesCreated < MAX_HOLES - 2;
    if (c0) {
      if (c1) {
        holes[0].ready = holes[1].ready = true;
        scroll.vec[1] -= 342;
        if (c2) {
          holes[2].ready = true;
          if (roomForDiagonal) {
            scroll.vec[0] -= 198;
            scrollCorner[0] = 2;
          }
        }
        if (c3) {
          holes[3].ready = true;
          if (roomForDiagonal) {
            scroll.vec[0] += 198;
            scrollCorner[1] = 2;
          }
        }
      } else if (c2) {
        holes[0].ready = holes[2].ready = true;
        scroll.vec[0] -= 198;
        if (c3) {
          holes[3].ready = true;
          if (roomForDiagonal) {
            scroll.vec[1] += 342;
            scrollCorner[2] = 2;
          }
        }
      }
    } else if (c3) {
      if (c1) {
        holes[3].ready = holes[1].ready = true;
        scroll.vec[0] += 198;
        if (c2) {
          holes[2].ready = true;
          if (roomForDiagonal) {
            scrollCorner[3] = 2;
            scroll.vec[1] += 342;
          }
        }
      } else if (c2) {
        holes[3].ready = holes[2].ready = true;
        scroll.vec[1] += 342;
      }
    }
  }

  function startScrollIfReady(): void {
    if (holesCreated === 16 && scroll.vec[0] !== 0 && scroll.vec[1] !== 0) {
      scrollCorner = [1, 1, 1, 1];
      scroll.vec[1] = 0;
    }
    if (holes.some((h) => h.ready) && holesCreated < MAX_HOLES) {
      scroll.start = timePassed + 1500;
      scroll.active = true;
      if (scroll.vec[0] !== 0 && scroll.vec[1] !== 0) {
        scroll.duration = 1414;
        timeAnimating += 2914;
        scrollsCount[1]++;
      } else {
        scroll.duration = 1000;
        timeAnimating += 2500;
        scrollsCount[0]++;
      }
      backgroundsBackup = backgrounds.map((p) => [...p]);
    }
    if (config.speed) return;
    holes.forEach((hole, z) => {
      if (!hole.ready) return;
      if (holesCreated < MAX_HOLES) {
        const [made, next] = createHole(rng, holesSeed);
        holesSeed = next;
        tempHoles[z] = made;
        holesCreated++;
      } else {
        hole.ready = false;
        hole.completed = false;
        hole.generated = false;
      }
    });
  }

  function finishScroll(): void {
    for (let a = 0; a < 4; a++) {
      backgrounds[a][0] = backgroundsBackup[a][0] + scroll.vec[0];
      backgrounds[a][1] = backgroundsBackup[a][1] + scroll.vec[1];
      if (backgrounds[a][0] > 772) backgrounds[a][0] -= 1512;
      else if (backgrounds[a][0] < -740) backgrounds[a][0] += 1512;
      if (backgrounds[a][1] > 628) backgrounds[a][1] -= 1188;
      else if (backgrounds[a][1] < -560) backgrounds[a][1] += 1188;
    }
    const sources = SCROLL_SOURCES[scroll.vec.join(',')];
    if (sources) {
      const old = holes.map((h) => ({ ...h }));
      const generated = holes.map((h) => h.generated);
      sources.forEach(([kind, index], z) => {
        const hole = holes[z];
        if (kind === 'h') {
          Object.assign(hole, old[index]);
        } else {
          hole.deal(tempHoles[index]);
        }
        // The original took the "generated" flag from the source index either way.
        hole.generated = generated[index];
      });
    }
    tempHoles = [blankHole(), blankHole(), blankHole(), blankHole()];
    // Pieces are stored in screen coordinates, so they move with the scroll.
    for (const hole of holes) {
      for (const piece of hole.pieces) {
        piece.x += scroll.vec[0];
        piece.y += scroll.vec[1];
      }
    }
    for (const hole of holes) {
      if (hole.ready) {
        hole.ready = false;
        hole.completed = false;
      }
    }
    scroll.active = false;
    scroll.vec = [0, 0];
    scroll.offset = [0, 0];
    scrollCorner = [1, 1, 1, 1];
  }

  function moveBackgrounds(): void {
    for (let a = 0; a < 4; a++) {
      backgrounds[a][0] = pyRound(backgroundsBackup[a][0] + scroll.offset[0], 2);
      backgrounds[a][1] = pyRound(backgroundsBackup[a][1] + scroll.offset[1], 2);
      if (backgrounds[a][0] > 773) backgrounds[a][0] -= 1512;
      else if (backgrounds[a][0] < -739) backgrounds[a][0] += 1512;
      if (backgrounds[a][1] > 628) backgrounds[a][1] -= 1188;
      else if (backgrounds[a][1] < -560) backgrounds[a][1] += 1188;
    }
  }

  function animateScroll(): void {
    const elapsed = timePassed - scroll.start;
    if (scroll.active && elapsed <= scroll.duration) {
      if (elapsed > 0) {
        scroll.offset = [(scroll.vec[0] * elapsed) / scroll.duration, (scroll.vec[1] * elapsed) / scroll.duration];
        moveBackgrounds();
      }
    } else if (scroll.active && startScroll) {
      for (let z = 0; z < 4; z++) holes[z].grid = tempHoles[z].grid;
      scroll.active = false;
      scroll.vec = [0, 0];
      scroll.offset = [0, 0];
      startScroll = false;
      tempHoles = [blankHole(), blankHole(), blankHole(), blankHole()];
    } else if (scroll.active && endScroll[0]) {
      if (elapsed >= scroll.duration + 500) {
        scroll.active = false;
        scroll.vec = [0, 0];
        scroll.offset = [0, 0];
        boardReset = true;
      }
    } else if (scroll.active && !startScroll) {
      finishScroll();
    }
  }

  // ---- Neglect: rattles, flying pieces, tearing holes ----

  function warnings(): void {
    if (config.speed) return;
    for (let x = 5; x < 8; x++) {
      holes.forEach((hole, z) => {
        if (hole.focus !== x) return;
        if (hole.pieces.length > 0) {
          if (x + 2 > soundHierarchy[2]) soundHierarchy[2] = x + 2;
        } else if (hole.teared < 4) {
          if (holeFlash[x - 5] === 1) drawRedBorder(z, hole.edges);
          // The original compared against x + 2 but stored x + 5, so the lowest warning wins.
          if (x + 2 > soundHierarchy[3]) soundHierarchy[3] = x + 5;
        }
      });
    }
  }

  function neglect(): void {
    if (config.speed) return;
    holes.forEach((hole, z) => {
      if (hole.focus !== 8) return;
      if (hole.pieces.length > 0) {
        const last = hole.pieces.pop()!;
        if (last.letter === 'b') {
          applyPutty(hole.grid, hole.putty.pop()!, false);
        } else {
          hole.edges = applyPiece(hole.grid, last, last.x, last.y, z, false);
          const slot = flying.findIndex((f) => f === null);
          if (slot >= 0) {
            rng.seed(null);
            const end: [number, number] = [0, 0];
            if (rng.randintN(0, 1) === 0) {
              end[0] = rng.randintN(36, 420);
              end[1] = rng.choice([36, 635]);
            } else {
              end[1] = rng.randintN(36, 635);
              end[0] = rng.choice([36, 420]);
            }
            const c = 22 / Math.sqrt(Math.abs(end[0] - last.x) ** 2 + Math.abs(end[1] - last.y) ** 2);
            flying[slot] = {
              piece: { letter: last.letter, rotation: last.rotation, flip: last.flip },
              pos: [last.x, last.y],
              end,
              step: [c * (end[0] - last.x), c * (end[1] - last.y)],
            };
          }
        }
        hole.focus = 0;
        soundHierarchy[0] = 13;
      } else if (hole.teared < 4) {
        hole.edges = tearHole(hole.grid, hole.prob, rng);
        hole.original = copyGrid(hole.grid);
        hole.focus = 0;
        hole.teared++;
        soundHierarchy[1] = 14;
      }
    });
  }

  function updateFlying(): void {
    if (timePassed - flyTimer <= 10) return;
    for (let a = 0; a < 3; a++) {
      const f = flying[a];
      if (!f) continue;
      for (const i of [0, 1]) {
        if (f.pos[i] === f.end[i]) continue;
        const next = f.pos[i] + f.step[i];
        if (f.step[i] > 0) f.pos[i] = next <= f.end[i] ? next : f.end[i];
        else if (f.step[i] < 0) f.pos[i] = next >= f.end[i] ? next : f.end[i];
      }
      if (f.pos[0] === f.end[0] && f.pos[1] === f.end[1]) flying[a] = null;
    }
    flyTimer += 10;
  }

  // ---- Speed carp toolbox top-up (the original's "hack fix") ----

  function topUpToolbox(): void {
    if (!boardActive || cursor.letter !== '') return;
    if (!config.speed) {
      for (let x = 0; x < 3; x++) {
        if (toolbox[x] !== '') continue;
        dealSeededPiece(x);
        randomOrientation(x);
      }
      return;
    }
    if (config.speedSize !== 1) return;
    for (let x = 0; x < 3; x++) {
      if (toolbox[x] !== '') continue;
      if (config.speedHoles === 1) {
        const order = rng.shuffle([0, 1, 2]);
        const needed = rng.shuffle(holes.flatMap((h) => h.needed));
        toolbox[order[0]] = needed[0];
        for (const ef of order.slice(1)) {
          rng.seed(piecesSeed);
          piecesSeed++;
          toolbox[ef] = rng.choiceWeighted(PIECES_NO_PUTTY, PIECE_WEIGHTS_NO_PUTTY);
          countFound(toolbox[ef]);
        }
        for (let fg = 0; fg < 3; fg++) randomOrientation(fg);
      } else {
        const needed = rng.shuffle(holes.flatMap((h) => h.needed));
        const inToolbox = [...toolbox];
        const blank = slotOf(toolboxBlank);
        let picked = false;
        for (let i = 0; !picked; i++) {
          if (!inToolbox.includes(needed[i][0])) {
            toolbox[blank] = needed[i][0];
            picked = true;
          }
          if (!picked && i === needed.length - 1) {
            rng.seed(piecesSeed);
            piecesSeed++;
            toolbox[blank] = rng.choiceWeighted(PIECES_NO_PUTTY, PIECE_WEIGHTS_NO_PUTTY);
            countFound(toolbox[blank]);
            picked = true;
          }
        }
        randomOrientation(x);
      }
    }
  }

  // ---- End of session ----

  function scoresKey(): string {
    return (
      (config.ghost ? 'a' : 'b') +
      (config.speed ? 'a' : 'b') +
      (config.speed ? `${config.speedHoles}${config.speedSize}${config.speedLetter}` : '000')
    );
  }

  function endSession(): void {
    boardActive = false;
    if (!endProcedureComplete) {
      if (startScroll) timeAnimating -= 1000 - (timePassed - scroll.start);
      else if (endScroll[0]) {
        if (scroll.active) timeAnimating -= 1000 - (timePassed - scroll.start);
        else timeAnimating -= 1000 + 1500 - (timePassed - endScroll[1]);
      } else if (scroll.active) {
        timeAnimating -= scroll.start + scroll.duration - timePassed;
        scroll.active = false;
      }
      const samples = averageFocus.slice(1);
      finalAverageFocus = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
      if (!cheatsUsed && scoreCounting && !(config.ghost && sightUsed)) {
        if (scoreTotal > bestScore) {
          bestScore = scoreTotal;
          if (!config.ghost) play(17);
          bestScores[bestScoresKey] = bestScore;
          store.set('bestScores', bestScores);
        }
      }
      endProcedureComplete = true;
      endProcedureKey = bestScoresKey;
    } else if (scoreTotal > 0) {
      if (!sessionScoresComputed) {
        recordSession();
        sessionScoresComputed = true;
      }
      if (endProcedureKey === bestScoresKey) drawStatsTable();
    }
  }

  function recordSession(): void {
    const s = sessionScores[bestScoresKey];
    if (!s) {
      sessionScores[bestScoresKey] = {
        sessions: 1,
        total_score: scoreTotal,
        total_holes: holesFilledTotal,
        total_pieces: piecesPlaced,
        max_score: scoreTotal,
        most_vp: scoreFull[2],
        most_holes: holesFilledTotal,
        most_pieces: piecesPlaced,
        average_holes: holesFilledTotal,
        score_per_hole: scoreTotal / holesFilledTotal,
        average_score: scoreTotal,
        average_pieces: piecesPlaced,
      };
      return;
    }
    s.sessions++;
    s.total_score += scoreTotal;
    s.total_holes += holesFilledTotal;
    s.total_pieces += piecesPlaced;
    s.max_score = Math.max(s.max_score, scoreTotal);
    s.most_vp = Math.max(s.most_vp, scoreFull[2]);
    s.most_holes = Math.max(s.most_holes, holesFilledTotal);
    s.most_pieces = Math.max(s.most_pieces, piecesPlaced);
    s.average_holes = s.total_holes / s.sessions;
    s.score_per_hole = s.total_score / s.total_holes;
    s.average_score = s.total_score / s.sessions;
    s.average_pieces = s.total_pieces / s.sessions;
  }

  // ---- Drawing ----

  function drawPiece(letter: string, x: number, y: number, rotation: number, flip: number, state: number, offset: readonly number[]): void {
    if (!letter) return;
    x = x - 36 + offset[0];
    y = y - 36 + offset[1];
    if (letter === 'b') {
      if (state === 3) screen.blit(img('carp_b_3'), x, y);
      else if (state === 2) screen.blit(img('carp_b_2'), x + 10, y - 18);
      return;
    }
    screen.blit(img(`carp_${letter}_${state}`), x, y, { flipX: flip === 1, rotate: rotation });
  }

  function drawHoles(grids: Grid[], offsets: number[][]): void {
    grids.forEach((grid, z) => {
      const [hx, hy] = [z === 0 || z === 2 ? 53 : 251, z === 0 || z === 1 ? 105 : 447];
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 9; x++) {
          if (grid[y][x] === 1) screen.blit(img('carp_black'), hx + offsets[z][0] + x * 18, hy + offsets[z][1] + y * 18);
        }
      }
    });
  }

  function drawRedBorder(z: number, edges: Grid): void {
    const x = z === 1 || z === 3 ? 251 : 53;
    const y = z === 2 || z === 3 ? 447 : 105;
    const [ox, oy] = scroll.offset;
    for (let a = 0; a < 4; a++) {
      for (let b = 0; b < 9; b++) {
        const e = edges[a][b];
        const px = x + 18 * b + ox;
        const py = y + 18 * a + oy;
        if (e % 10 >= 1) screen.blit(img('red_border_v'), px, py);
        if (Math.floor((e % 100) / 10) >= 1) screen.blit(img('red_border_v'), px + 18, py);
        if (Math.floor((e % 1000) / 100) >= 1) screen.blit(img('red_border_h'), px, py);
        if (Math.floor(e / 1000) >= 1) screen.blit(img('red_border_h'), px, py + 18);
      }
    }
  }

  function drawHoleContents(): void {
    if (!startScroll) drawHoles(holes.map((h) => h.original), [scroll.offset, scroll.offset, scroll.offset, scroll.offset]);
    if (scroll.active) {
      const [ox, oy] = scroll.offset;
      const [vx, vy] = scroll.vec;
      let offsets: number[][];
      if (vx !== 0 && vy !== 0) offsets = scrollCorner.map((k) => [ox - k * vx, oy - k * vy]);
      else if (startScroll) offsets = Array.from({ length: 4 }, () => [ox - 2 * vx + 396, oy - 2 * vy]);
      else offsets = Array.from({ length: 4 }, () => [ox - 2 * vx, oy - 2 * vy]);
      drawHoles(
        tempHoles.map((t) => t.grid),
        offsets,
      );
    }
    if (config.ghost) return;
    const lastState = cursorLocked[0] !== -1 ? 1 : 5;
    holes.forEach((hole, z) => {
      const count = hole.pieces.length;
      if (count === 0) return;
      for (const fills of hole.putty) {
        for (const [y, x] of fills) {
          screen.blit(img('carp_blood'), (z === 0 || z === 2 ? 54 : 252) + scroll.offset[0] + 18 * x, (z === 0 || z === 1 ? 105 : 447) + scroll.offset[1] + 18 * y);
        }
      }
      for (const p of hole.pieces.slice(0, -1)) drawPiece(p.letter, p.x, p.y, p.rotation, p.flip, 1, scroll.offset);
      const last = hole.pieces[count - 1];
      if (lastHole === z) {
        drawPiece(last.letter, last.x, last.y, last.rotation, last.flip, lastState, scroll.offset);
      } else {
        const jiggle = hole.focus >= 6 && hole.focus <= 7 ? jiggleOffset[hole.focus - 6] : [0, 0];
        drawPiece(last.letter, last.x + jiggle[0], last.y + jiggle[1], last.rotation, last.flip, 1, scroll.offset);
      }
    });
  }

  function drawCursorPiece(): void {
    if (cursor.letter === '') return;
    const mouse = input.mouse;
    let [mx, my] = snap(mouse);
    let state = 4;
    if (cursorLocked[0] === -1) {
      if (within(mouse, 90, 362, 288, 379)) state = 2;
      legalMove = false;
      if (!startScroll) {
        holes.forEach((hole, z) => {
          const [x1, x2, y1, y2] = holeBounds(z);
          if (hole.generated && within(mouse, x1, x2, y1, y2) && cursor.letter !== 'b') {
            [legalMove, perfectMove] = checkPlacement(hole.grid, hole.edges, cursor, mx, my, z);
          }
        });
      }
      state = legalMove ? 2 : 4;
    } else {
      mx = Math.max(cursorLocked[1] - 18, Math.min(cursorLocked[1] + 18, mx));
      my = Math.max(cursorLocked[2] - 18, Math.min(cursorLocked[2] + 18, my));
      const z = cursorLocked[0];
      const [x1, x2, y1, y2] = holeBounds(z);
      if (within([mx, my], x1, x2, y1, y2)) {
        if (cursor.letter !== 'b') [legalMove, perfectMove] = checkPlacement(holes[z].grid, holes[z].edges, cursor, mx, my, z);
        state = legalMove ? 2 : 4;
      }
    }
    if (cursor.letter === 'b') {
      legalMove = true;
      state = 2;
    }
    drawPiece(cursor.letter, mx, my, cursor.rotation, cursor.flip, state, [0, 0]);
  }

  function drawStars(): void {
    const filled = holesFilled % 17;
    for (let z = 0; z < 9; z++) {
      if (Math.floor(filled / 2) > z) screen.blit(img('full_star'), 30, 372 - z * 20);
      else if (filled % 2 === 1 && filled / 2 > z) screen.blit(img('half_star'), 30, 372 - z * 20);
    }
    for (let z = 0; z < 9; z++) if (MAX_HOLES / 2 > z) screen.blit(img('empty_star'), 30, 372 - z * 20);
  }

  /** str(round(x, n)) in Python. */
  const roundStr = (x: number, n: number) => floatStr(pyRound(x, n));

  function drawStatsTable(): void {
    const t = (value: string, x: number, y: number, colour = WHITE) => screen.text(value, x, y, statsFont, colour);
    if (config.speed) {
      screen.blit(img('background_stats2'), 0, 0);
    } else {
      screen.blit(img('background_stats'), 0, 0);
      const rates: Record<string, number> = { f: 14, i: 2, l: 8, n: 8, p: 22, t: 7, u: 4, v: 4, w: 4, x: 3, y: 14, z: 4, b: 1 };
      const columns: [string, number][] = [
        ['p', 0],
        ['f', 4],
        ['y', 8],
        ['n', 10],
        ['l', 13],
        ['t', 16],
        ['u', 20],
        ['v', 23],
        ['w', 27],
        ['z', 30],
        ['x', 33],
        ['i', 36],
        ['b', 39],
      ];
      for (const [letter, col] of columns) {
        const found = piecesFound[letter] ?? 0;
        t(String(found), 58 + col * 9, 94);
        t(String(Math.trunc(found - (rates[letter] * (piecesPlaced + 3)) / 95)), 58 + col * 9, 112, PURPLE);
      }
    }
    const picks = keyboardVsMouse[1] + keyboardVsMouse[2];
    keyboardVsMouse[0] = picks && keyboardVsMouse[2] / picks > 0.8 ? 'K' : picks && keyboardVsMouse[1] / picks > 0.8 ? 'M' : 'H';
    const left: [string, number][] = [
      [`Score: ${scoreTotal}   -   ${scoreFull[0]}, ${scoreFull[1]}, ${scoreFull[2]}`, 0],
      [`Score / Hole: ${roundStr(scoreTotal / holesFilledTotal, 2)}`, 0.5],
      [`Holes Filled: ${holesFilledTotal}`, 1],
      [`Animating (s): ${roundStr(timeAnimating / 1000, 2)}`, 2],
      [`Scrolls: ${scrollsCount[0]}h - ${scrollsCount[1]}d`, 2.5],
      [`KBM: ${keyboardVsMouse[0]} - ${keyboardVsMouse[2]} - ${keyboardVsMouse[1]}`, 3],
      [`Pieces Placed: ${piecesPlaced}`, 4],
      [`Pieces Replaced: ${piecesReplaced}`, 4.5],
      [`Flips: ${flipCount}`, 5],
      [`Spins: ${spinCount}`, 5.5],
      [`Focus: ${roundStr(finalAverageFocus, 1)}`, 6.5],
      [`> P Drought: ${pDrought[0]}`, 7],
      [`Slowest Hole (s) : ${roundStr(holeTimers[0] / 1000, 1)}`, 7.5],
      [`Quickest Hole (s) : ${roundStr(holeTimers[1] / 1000, 1)}`, 8],
    ];
    for (const [value, row] of left) t(value, 50, 221 + row * 36);
    screen.text(`Seed: ${seedString()}`, 50, 221 + 10 * 36, statsFontSmall);
    const s = sessionScores[bestScoresKey];
    const right: [string, number][] = [
      [`Sessions: ${s.sessions}`, 0],
      [`Average Score: ${roundStr(s.average_score, 2)}`, 0.5],
      [`Average Holes: ${roundStr(s.average_holes, 2)}`, 2],
      [`Score Per Hole: ${roundStr(s.score_per_hole, 2)}`, 2.5],
      [`Average Pieces: ${roundStr(s.average_pieces, 1)}`, 3],
      [`Best Score: ${s.max_score}`, 4],
      [`Most VP: ${s.most_vp}`, 4.5],
      [`Most Holes: ${s.most_holes}`, 5],
      [`Most Pieces: ${s.most_pieces}`, 5.5],
    ];
    for (const [value, row] of right) t(value, 240, 221 + row * 36);
  }

  function drawCompletionTexts(): void {
    for (let z = 0; z < 4; z++) {
      const kind = completionText[0][z];
      if (kind === 0) continue;
      const since = timePassed - completionText[1][z];
      if (since > 1500) {
        completionText[0][z] = 0;
        continue;
      }
      const alpha = since > 1000 ? 255 * (1 - (since - 1000) / 500) : 255;
      const [x, y] = COMPLETION_LOCATIONS[z];
      if (kind === 1) screen.text('Vampire Proof!', x, y, fontLarge, WHITE, alpha);
      if (kind === 2) screen.text('Creaky Coffin', x, y, fontLarge, WHITE, alpha);
      if (kind === 3) screen.text('Slipshod', x + 50, y, fontLarge, WHITE, alpha);
    }
  }

  function drawPanel(): void {
    const text = (value: string, x: number, y: number, colour = WHITE) => screen.text(value, x, y, font, colour);
    text('Time', 460, 190);
    text('Score', 460, 220, scoreCounting ? WHITE : GREY);
    text('PB', 680, 220);
    text(timePassed < sessionTime() ? String(Math.trunc(timePassed / 1000)) : '120', 535, 190);
    text(String(scoreTotal), 535, 220);
    text(`[${scoreFull[0]}, ${scoreFull[1]}, ${scoreFull[2]}]`, 575, 220);
    text(String(bestScore), 720, 220);
    for (const y of [250, 290, 330]) screen.blit(img('box_one'), 460, y);
    if (boardActive) {
      drawStars();
      text('Stop', 495, 255);
      text('Dismiss', 475, 295);
      text('Pause', 485, 335);
    } else {
      text('Start', 490, 255);
      if (timePassed > 0 && timePassed < sessionTime() && pauseTime > 0) text('Play', 495, 335);
    }
    if (config.cheats) screen.blit(img('cheats_ui'), 450, 448);
    text('Cheats', 460, 5);
    text('Ghost', 460, 35);
    text('Speed', 460, 65);
    text('Unlimited', 460, 95);
    text('Seeded', 460, 125);
    if (seeded) {
      text('C', 572, 125);
      text('P', 595, 125);
      text('G', 618, 125);
    }
    if (config.speed) {
      text('Holes     Size', 560, 65);
      text(String(config.speedHoles), 628, 65, BLUE);
      text(String(config.speedSize), 705, 65, BLUE);
      text(config.speedLetter < 12 ? PIECES_NO_PUTTY[config.speedLetter] : '-', 730, 65, BLUE);
    }
    const box = (on: boolean, x: number, y: number) => screen.blit(img(on ? 'checkbox_yes' : 'checkbox_no'), x, y);
    box(config.cheats, 540, 8);
    box(config.ghost, 530, 38);
    box(config.speed, 530, 68);
    box(config.unlimited, 565, 98);
    box(seeded, 545, 128);
    screen.blit(img(`volume_${config.volume}`), 740, 540);
  }

  // ---- The frame, in the original's order ----

  function frame(events: InputEvent[]): void {
    for (const [x, y] of backgrounds) screen.blit(img('background_wood'), Math.floor(x), Math.floor(y));

    handleEvents(events);
    if (boardActive) applyActions();

    if (boardActive) {
      if (startProcedure || boardReset) startOrReset();
      drawHoleContents();
      if (!scroll.active) {
        checkCompletions();
        if (holesFilled === MAX_HOLES && !config.speed) {
          if (!endScroll[0]) {
            endScroll = [true, timePassed];
            timeAnimating += 2500;
            scroll = { vec: [0, 0], start: 0, active: false, duration: 1000, offset: [0, 0] };
          }
          if (timePassed - endScroll[1] > 1500 && scroll.vec[1] === 0) {
            scroll = { vec: [0, 684], start: timePassed, active: true, duration: 1000, offset: [0, 0] };
          }
        }
        speedRefresh();
        planScroll();
        startScrollIfReady();
      }
      warnings();
    }

    screen.blit(img('background_toolbox'), 0, 0);
    screen.blit(img('background_grey'), 450, 0);
    if (boardActive) {
      for (let x = 0; x < 3; x++) drawPiece(toolbox[x], 126 + x * 91, 324, toolboxRotation[x], toolboxFlip[x], 3, [0, 0]);
      drawCursorPiece();
      neglect();
      animateScroll();
      if (soundRefresh === 1) {
        const next = soundHierarchy.find((s) => s > 0);
        if (next) {
          play(next);
          soundRefresh = 0;
        }
      }
      soundHierarchy.fill(0);
    }

    scoreTotal = -scoreFull[0] + scoreFull[1] + scoreFull[2] * 2;
    topUpToolbox();
    if (loadBestScore) {
      bestScoresKey = scoresKey();
      bestScore = bestScores[bestScoresKey] ?? 0;
      loadBestScore = false;
    }
    if (boardActive) timePassed = ticks() - startTime + pauseTime;
    if (timePassed > sessionTime()) endSession();
    if (timePassed > sessionTime() - 15000 && !warningPlayed) {
      play(15);
      warningPlayed = true;
    }

    if (timePassed - jiggleTimer[0] > 25) {
      jiggleTimer[0] = timePassed;
      rng.seed(null);
      jiggleOffset[1] = [rng.randintN(-2, 2), rng.randintN(-2, 2)];
      if (jiggleTimer[1] === 0) {
        jiggleOffset[0] = [rng.randintN(-2, 2), rng.randintN(-2, 2)];
        jiggleTimer[1] = 3;
      }
      jiggleTimer[1]--;
    }
    if (timePassed - holeFlash[4] > 250) {
      holeFlash[4] = timePassed;
      holeFlash[2] *= -1;
      if (holeFlash[3] === 2) holeFlash[1] *= -1;
      if (holeFlash[3] === 0) {
        holeFlash[1] *= -1;
        holeFlash[0] *= -1;
        holeFlash[3] = 4;
      }
      holeFlash[3]--;
    }
    updateFlying();
    for (const f of flying) {
      if (f) drawPiece(f.piece.letter, Math.ceil(f.pos[0]), Math.ceil(f.pos[1]), f.piece.rotation, f.piece.flip, 1, [0, 0]);
    }
    if (boardActive) drawCompletionTexts();
    drawPanel();
  }

  return { frame, dispose: () => sounds.dispose() };
}) satisfies PuzzleFactory;
