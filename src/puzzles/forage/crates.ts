// Where crates come from. In the real game the server decides, and the server isn't in the client,
// so each mode stands in for it:
//
// - Normal foraging: the client's own rules (ForageBoard.findCratePosition, forage/a/d) place the
//   crate, with a spawn chance that drops as the board fills with crates. The server's part is only
//   to ask for one (the "bonus_mode" message) and say what size; here a request goes in whenever the
//   board has room for another crate and no request is waiting, sized by the chest ratios, until the
//   board has asked for one crate per banana.
// - Gauntlet (cursed isle) foraging, for CI and Infinite: the desktop Forage Simulator's chest
//   spawning (board_calc.try_spawn_chest and the CI loop in app.pyw), draw for draw with its random.
import type { PyRandom } from '../../core/pyrandom';
import { COLOURS, CRATE_SIZES, isAnts, isCrate, isCrateAnchor, isTool, MAX_CRATE_AREA, MAX_CRATES, crateSize, WIDTH } from './board';
import type { CrateSource, Forage } from './engine';

/** Crate art (crate1x1.png etc.): fruit 0-4 for small and medium crates; 3x2 gems 0 or gold 1. */
const FRUIT_TILES = COLOURS;
/** The cursed isle's bone box, fetish jar and cursed chest. */
export const CURSED_TILES = [6, 6, 3];

/** Normal foraging: the client spawns crates the server asks for. */
export class ServerRequests implements CrateSource {
  /** Crates asked for so far. */
  requested = 0;
  private nextKey = 0;

  constructor(
    private readonly rng: PyRandom,
    /** Relative chances of a 1x1, 2x2 and 3x2. */
    private readonly weights: readonly [number, number, number],
    /** How many crates the board brings in all. */
    private readonly budget: number,
  ) {}

  beforeMove(game: Forage): void {
    const b = game.board;
    if (b.bonusMode !== 0 || b.crates >= MAX_CRATES || b.crateArea >= MAX_CRATE_AREA || this.requested >= this.budget) return;
    const sizes = [0, 1, 2].filter((s) => this.weights[s] > 0);
    if (!sizes.length) return;
    const size = this.rng.choiceWeighted(
      sizes,
      sizes.map((s) => this.weights[s]),
    );
    // The contents go in one of three slots; use one no crate on the board is using.
    const used = new Set(b.cells.filter(isCrateAnchor).map((p) => (p & 0xc0000) >> 18));
    let key = this.nextKey;
    for (let i = 0; i < 3 && used.has(key); i++) key = (key + 1) % 3;
    this.nextKey = (key + 1) % 3;
    game.crateArt[key] = size === 2 ? this.rng.randintN(0, 1) : this.rng.randintN(0, FRUIT_TILES - 1);
    b.bonusMode = 64 | size | (key << 2);
    this.requested++;
  }
}

/**
 * The simulator's Gauntlet chests. The next chest and its column are picked ahead. After each move:
 * once two moves have passed since the last chest and there are fewer than 3 on the board, a cursed
 * chest waits until no jar or chest is left, a jar until there's no cursed chest and fewer than 2 jars,
 * and a bone box goes whenever. It needs every cell of its spot in the top rows to be fruit; from the
 * third move on it tries every column in a random order instead (keeping the last one it tried).
 */
export class GauntletChests implements CrateSource {
  private next!: number;
  private column!: number;
  private movesSinceLast = -1;
  /** Chests still to come on this board: one per banana. */
  budget: number;

  constructor(
    private readonly rng: PyRandom,
    /** Relative chances of a bone box, fetish jar and cursed chest (0 for those turned off). */
    private readonly weights: readonly [number, number, number],
    budget: number,
  ) {
    this.budget = budget;
    this.pick();
  }

  get enabled(): boolean {
    return this.weights.some((w) => w > 0);
  }

  /** Python's random.choices over the enabled chests, then a column for it. */
  private pick(): void {
    const kinds = [1, 2, 3].filter((k) => this.weights[k - 1] > 0);
    if (!kinds.length) return;
    this.next = this.rng.choiceWeighted(
      kinds,
      kinds.map((k) => this.weights[k - 1]),
    );
    this.column = this.rng.choice(Array.from({ length: WIDTH + 1 - this.next }, (_, i) => i));
  }

  /** cells_check: any cell of the spot that isn't fruit blocks it. */
  private blocked(game: Forage, column: number): boolean {
    const { width, height } = CRATE_SIZES[this.next - 1];
    for (let y = 0; y < height; y++) {
      for (let x = column; x < column + width; x++) {
        const p = game.board.getPiece(x, y);
        if (p < 0 || p >= COLOURS || isTool(p) || isAnts(p) || isCrate(p)) return true;
      }
    }
    return false;
  }

  afterMove(game: Forage): boolean {
    if (!this.enabled || this.budget <= 0) return false;
    const onBoard = [0, 0, 0];
    for (const p of game.board.cells) if (isCrateAnchor(p)) onBoard[crateSize(p)]++;
    const total = onBoard[0] + onBoard[1] + onBoard[2];
    this.movesSinceLast++;
    let placed = false;
    if (this.movesSinceLast >= 2 && total < 3) {
      const fits =
        (this.next === 3 && onBoard[1] === 0 && onBoard[2] < 1) || (this.next === 2 && onBoard[2] === 0 && onBoard[1] < 2) || this.next === 1;
      if (fits) placed = this.trySpawn(game);
    }
    // Python checks the count from before the spawn.
    if (total === 3) this.movesSinceLast = -1;
    return placed;
  }

  private trySpawn(game: Forage): boolean {
    let blocked = this.blocked(game, this.column);
    if (blocked && this.movesSinceLast >= 3) {
      for (const x of this.rng.shuffle(Array.from({ length: WIDTH + 1 - this.next }, (_, i) => i))) {
        this.column = x;
        blocked = this.blocked(game, x);
      }
    }
    if (blocked) return false;
    // Each size keeps its own contents slot, so the three kinds of chest show their own art.
    game.crateArt[this.next - 1] = CURSED_TILES[this.next - 1];
    game.dropCrate(this.next - 1, this.column, this.next - 1);
    this.budget--;
    this.pick();
    this.movesSinceLast = 0;
    return true;
  }
}
