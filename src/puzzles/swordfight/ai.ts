import { type Attack, type Pair, piece, type Piece, PieceStream, SwordBoard, gemStrikes, W, H } from './logic';
import { JavaRandom } from './random';

export interface AiSettings { speed: number; clearChance: number; comboChance: number; breakAverage: number; }
export const FILL_ORDER = [0, 5, 1, 4, 2, 3], CLEAR_ORDER = [3, 2, 4, 1, 5, 0];
export const aiInterval = (speed: number) => 6000 - Math.floor(5250 * speed / 100);
function randomAttack(cleared: number, chain: number, average: number, random: JavaRandom): Attack {
  const share = Math.max(0, Math.min(1, 0.25 + 0.5 * average / 100 + random.normal() * 0.15));
  let budget = Math.floor(cleared * share + 0.5), used = 0;
  const strikes: Attack['strikes'] = [];
  while (budget >= 4) {
    const options: Array<{ width: number; height: number; weight: number }> = [];
    for (let height = 2; height <= 8; height++) for (let width = 2; width <= W; width++) {
      const area = width * height; if (area > budget) continue;
      options.push({ width, height, weight: 1 / area ** 0.9 * (width === 2 ? 1.4 : 1) * (width === height ? 1.2 : 1) });
    }
    if (!options.length) break;
    let roll = random.double() * options.reduce((sum, shape) => sum + shape.weight, 0);
    const shape = options.find(shape => (roll -= shape.weight) < 0) ?? options.at(-1)!;
    budget -= shape.width * shape.height; used += shape.width * shape.height;
    strikes.push(...gemStrikes(shape.width, shape.height, chain));
  }
  return { strikes, sprinkles: Math.floor((cleared - used) / 2) * chain, chain };
}

/** Browser port of LocalWorldProvider's probability-based TrainingBot, not a human-board solver. */
export class TrainingBot {
  readonly board = new SwordBoard();
  readonly random: JavaRandom;
  readonly pieces: PieceStream;
  incoming: number[] = [];
  piecesSinceAttack = 3;
  comboColor = -1;
  constructor(seed: string, seat: number, readonly settings: AiSettings) {
    this.pieces = new PieceStream(seed);
    this.random = new JavaRandom(BigInt(seed) ^ 0x4e504149n ^ BigInt(seat) * 0x2545f4914f6cdd1dn);
  }
  private count(color: number): number { return this.board.cells.flat().filter(p => p && !p.breaker && p.color === color).length; }
  private expected(color: number): number { return Math.floor(this.count(color) * this.settings.breakAverage / 100 + 0.5); }
  private saved(color: number): boolean { return this.board.cells.flat().some(p => p?.breaker && p.color === color); }
  private danger(): boolean { return this.board.cells.slice(0, 4).some(row => row.some(Boolean)); }
  private removeBreakers(color: number): number {
    let count = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (this.board.get(x, y)?.breaker && this.board.get(x, y)?.color === color) { this.board.cells[y][x] = null; count++; }
    return count;
  }
  private clear(color: number, forced = false): number {
    if (!forced && this.random.int(100) >= this.settings.clearChance) return 0;
    const matching = this.count(color); if (!matching) return 0;
    const percent = Math.max(0, Math.min(100, Math.floor(this.settings.breakAverage + this.random.normal() * 15 + 0.5)));
    const target = Math.floor(matching * percent / 100 + 0.5); let removed = 0;
    while (removed < target) {
      let took = false;
      for (const x of CLEAR_ORDER) {
        if (removed >= target) break;
        for (let y = 0; y < H; y++) { const p = this.board.get(x, y);
          if (p && !p.breaker && p.color === color) { this.board.cells[y][x] = null; removed++; took = true; break; }
        }
      }
      if (!took) break;
    }
    return removed;
  }
  private own(pieces: Piece[]): void {
    for (const p of pieces) {
      const x = FILL_ORDER.reduce((best, x) => this.board.height(x) < this.board.height(best) ? x : best, FILL_ORDER[0]);
      this.board.stack(x, p);
    }
  }
  private landIncoming(): void {
    this.piecesSinceAttack = Math.min(3, this.piecesSinceAttack + 1);
    if (this.piecesSinceAttack < 3 || !this.incoming.length) return;
    this.piecesSinceAttack = 0;
    const amount = this.incoming.shift()!, share = Array<number>(W).fill(Math.floor(amount / W));
    for (let i = 0; i < amount % W; i++) share[FILL_ORDER[i]]++;
    let placed = 0, overflow = 0;
    const stack = (x: number) => { const ok = this.board.stack(x, piece(placed % 4)); if (ok) placed++; return ok; };
    for (const x of FILL_ORDER) for (let i = 0; i < share[x]; i++) if (!stack(x)) overflow++;
    while (overflow > 0) {
      let fitted = false;
      for (const x of FILL_ORDER) if (overflow && stack(x)) { overflow--; fitted = true; }
      if (!fitted) break;
    }
  }
  step(pair: Pair = this.pieces.pair()): Attack[] {
    if (this.board.topOut()) return [];
    const solids: Piece[] = [], breaks: number[] = [];
    for (const p of pair) {
      const color = p.color;
      if (!p.breaker) { solids.push(p); continue; }
      const savedCount = this.board.cells.flat().filter(p => p?.breaker).length;
      if (!this.danger() && !this.saved(color) && savedCount < 2 && this.expected(color) < 6 && this.random.int(100) < 85) {
        solids.push(p); continue;
      }
      const cleared = this.clear(color) + this.removeBreakers(color);
      if (cleared) breaks.push(cleared);
      if (this.comboColor >= 0) {
        const preserved = this.comboColor; this.comboColor = -1;
        if (preserved !== color) { const n = this.clear(preserved); if (n) breaks.push(n); }
      } else if (cleared && this.settings.comboChance > 0 && this.random.int(100) < this.settings.comboChance) this.comboColor = color;
    }
    this.board.gravity(); this.own(solids);
    for (let color = 0; color < 4; color++) {
      if (!this.saved(color) || !this.danger() && !(solids.some(p => !p.breaker && p.color === color) && this.expected(color) >= 6)) continue;
      const cleared = this.removeBreakers(color) + this.clear(color, true); if (cleared) breaks.push(cleared);
      this.board.gravity();
    }
    const attacks = this.board.topOut() ? [] : breaks.map((count, i) => randomAttack(count, i + 1, this.settings.breakAverage, this.random));
    this.landIncoming();
    return attacks;
  }
}
