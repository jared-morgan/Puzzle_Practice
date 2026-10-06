import { JavaRandom } from './random';
import { patternColor } from './patterns';

export const W = 6, H = 13;
export interface Piece { color: number; breaker: boolean; age: number; gem: number; tile?: number; }
export type Pair = [Piece, Piece];
export interface Gem { x: number; y: number; width: number; height: number; color: number; id: number; }
export interface Strike { width: number; height: number; }
export interface Attack { strikes: Strike[]; sprinkles: number; chain: number; }
export const attackSize = (attack: Attack) => attack.sprinkles + attack.strikes.reduce((total, sword) => total + sword.width * sword.height, 0);
export const piece = (color: number, breaker = false, age = 0): Piece => ({ color, breaker, age, gem: 0 });
export class PieceStream {
  readonly random: JavaRandom;
  constructor(seed: string | bigint) { this.random = new JavaRandom(seed); }
  pair(): Pair {
    const next = () => { const color = this.random.int(4); return piece(color, this.random.int(8) === 0); };
    return [next(), next()];
  }
}

/** Cloned server's attack conversion, including splitting oversized swords into whole shapes. */
export function gemStrikes(width: number, height: number, chain = 1): Strike[] {
  if (height >= width) height *= chain; else width *= chain;
  if (width === 2 && height === 2) { width = 1; height = 4; }
  else if (width === 3 && height === 3) { width = 2; height = 4; }
  else if (height >= width && width > 3) { height += width - 3; width = 3; }
  else if (width > height && height > 3) { width += height - 3; height = 3; }
  const split = (length: number, limit: number) => {
    const count = Math.ceil(length / limit), base = Math.floor(length / count), extra = length % count;
    return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
  };
  if (height >= width) return split(Math.max(3, height), 12).map(height => ({ width: Math.min(3, width), height }));
  return split(width, 6).map(length => length > height ? { width: length, height: Math.min(3, height) }
    : { width: Math.min(3, length), height: Math.max(3, height) });
}

export class SwordBoard {
  cells: Array<Array<Piece | null>> = Array.from({ length: H }, () => Array<Piece | null>(W).fill(null));
  private nextGem = 1;
  get(x: number, y: number): Piece | null { return this.cells[y]?.[x] ?? null; }
  topOut(): boolean { return !!this.get(3, 0); }
  height(x: number): number { for (let y = 0; y < H; y++) if (this.get(x, y)) return H - y; return 0; }
  stack(x: number, value: Piece): boolean {
    const y = H - this.height(x) - 1;
    if (y < 0) return false; this.cells[y][x] = value; return true;
  }
  gems(): Gem[] {
    const groups = new Map<number, Gem>();
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = this.get(x, y); if (!p?.gem) continue;
      const g = groups.get(p.gem);
      if (g) { g.width = Math.max(g.width, x - g.x + 1); g.height = Math.max(g.height, y - g.y + 1); }
      else groups.set(p.gem, { x, y, width: 1, height: 1, color: p.color, id: p.gem });
    }
    return [...groups.values()];
  }
  /** Fused rectangles move as rigid units; singles fall independently. */
  gravity(): void {
    for (let iteration = 0; iteration < H; iteration++) {
      let moved = false;
      const groups = this.gems(), seen = new Set<number>();
      for (let y = H - 2; y >= 0; y--) for (let x = 0; x < W; x++) {
        const p = this.get(x, y); if (!p) continue;
        if (p.gem) {
          if (seen.has(p.gem)) continue; seen.add(p.gem);
          const g = groups.find(g => g.id === p.gem)!;
          if (g.y + g.height >= H || Array.from({ length: g.width }, (_, i) => this.get(g.x + i, g.y + g.height)).some(Boolean)) continue;
          for (let yy = g.y + g.height - 1; yy >= g.y; yy--) for (let xx = g.x; xx < g.x + g.width; xx++) {
            this.cells[yy + 1][xx] = this.cells[yy][xx]; this.cells[yy][xx] = null;
          }
          moved = true;
        } else if (!this.get(x, y + 1)) { this.cells[y + 1][x] = p; this.cells[y][x] = null; moved = true; }
      }
      if (!moved) break;
    }
  }
  /** Draft rectangle joining: grow existing gems only when the whole gem fits the new rectangle. */
  fuse(): void {
    for (;;) {
      const gems = this.gems(); let best: Gem | null = null;
      for (let y = H - 2; y >= 0; y--) for (let x = 0; x < W - 1; x++) {
        const p = this.get(x, y); if (!p || p.breaker || p.age) continue;
        for (let height = 2; height <= H - y; height++) for (let width = 2; width <= W - x; width++) {
          if (best && width * height <= best.width * best.height) continue;
          let valid = true; const ids = new Set<number>();
          for (let yy = y; yy < y + height && valid; yy++) for (let xx = x; xx < x + width; xx++) {
            const q = this.get(xx, yy); if (!q || q.color !== p.color || q.breaker || q.age) { valid = false; break; }
            if (q.gem) ids.add(q.gem);
          }
          if (!valid || [...ids].some(id => { const g = gems.find(g => g.id === id)!;
            return g.x < x || g.y < y || g.x + g.width > x + width || g.y + g.height > y + height;
          })) continue;
          if (ids.size === 1 && gems.some(g => ids.has(g.id) && g.width * g.height === width * height)) continue;
          best = { x, y, width, height, color: p.color, id: this.nextGem };
        }
      }
      if (!best) break;
      this.nextGem++;
      for (let y = best.y; y < best.y + best.height; y++) for (let x = best.x; x < best.x + best.width; x++) this.get(x, y)!.gem = best.id;
    }
  }
  age(): void { for (const row of this.cells) for (const p of row) if (p?.age) { p.age--; if (!p.age) delete p.tile; } }
  resolve(): { attacks: Attack[]; cleared: number; maxChain: number } {
    const attacks: Attack[] = []; let cleared = 0;
    this.gravity(); this.fuse();
    for (let chain = 1; chain <= W * H; chain++) {
      const remove = new Set<number>();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = this.get(x, y); if (!p?.breaker || p.age || remove.has(y * W + x)) continue;
        const pending: number[] = [y * W + x], group = new Set<number>();
        while (pending.length) {
          const i = pending.pop()!; if (group.has(i)) continue;
          const xx = i % W, yy = Math.floor(i / W), q = this.get(xx, yy);
          if (!q || q.age || q.color !== p.color) continue;
          group.add(i);
          for (const [nx, ny] of [[xx - 1, yy], [xx + 1, yy], [xx, yy - 1], [xx, yy + 1]]) if (nx >= 0 && nx < W && ny >= 0 && ny < H) pending.push(ny * W + nx);
        }
        if (group.size > 1) for (const i of group) remove.add(i);
      }
      if (!remove.size) break;
      const gems = this.gems().filter(g => remove.has(g.y * W + g.x));
      const fused = gems.reduce((total, g) => total + g.width * g.height, 0);
      attacks.push({ strikes: gems.flatMap(g => gemStrikes(g.width, g.height, chain)), sprinkles: Math.floor((remove.size - fused) / 2) * chain, chain });
      cleared += remove.size;
      for (const i of remove) this.cells[Math.floor(i / W)][i % W] = null;
      this.gravity(); this.fuse();
    }
    return { attacks, cleared, maxChain: attacks.length };
  }
  /** First draft incoming placement; client-pattern mapping and gray aging are preserved. */
  receive(attack: Attack, pattern: number[][], id: number): void {
    let strikeId = id;
    for (const original of attack.strikes) {
      let { width, height } = original;
      if (width > height && width > W) [width, height] = [height, width];
      width = Math.min(width, W); height = Math.min(height, H);
      const choices = W - width + 1, first = strikeId % choices;
      // Client's strike-id ordering prefers different columns, rather than always attacking column four.
      const candidates = Array.from({ length: choices }, (_, i) => (first + i * (strikeId % 2 ? 1 : -1) + choices) % choices);
      const x = candidates.reduce((best, x) => {
        const top = Math.max(...Array.from({ length: width }, (_, i) => this.height(x + i)));
        const bestTop = Math.max(...Array.from({ length: width }, (_, i) => this.height(best + i)));
        return top < bestTop ? x : best;
      }, candidates[0]);
      const bottom = H - Math.max(...Array.from({ length: width }, (_, i) => this.height(x + i))) - 1;
      for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
        const y = bottom - dy; if (y < 0) continue;
        const left = strikeId % 2 === 0;
        const color = width > height ? patternColor(pattern, left ? height - dy - 1 : W - height + dy, left ? dx : width - dx - 1, true)
          : patternColor(pattern, x + dx, dy, true);
        const p = piece(color, false, 3);
        const base = [0, 4, 12][Math.min(width, 3) - 1];
        p.tile = width <= height ? base + dx + (dy === height - 1 ? 0 : dy === height - 2 ? 1 : dy === 0 ? 3 : 2) * width
          : (left ? height === 2 ? 24 : 28 : height === 2 ? 34 : 38) + (dy === height - 1 ? 0 : dy === 0 ? height - 1 : 1) * 2 + (left ? dx === width - 1 ? 1 : 0 : dx === 0 ? 0 : 1);
        if (y < H) this.cells[y][x + dx] = p;
      }
      strikeId++;
    }
    const layers = Array<number>(W).fill(0), heights = Array.from({ length: W }, (_, x) => this.height(x));
    const order = id % 2 ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
    for (let i = 0, cursor = 0, failures = 0; i < attack.sprinkles && failures < W; cursor++) {
      const x = order[cursor % W];
      // Port of the client's centre-column protection: skip column four when the stack is within three rows of the top.
      if (x === 3 && heights[x] >= H - 3 && heights.some((h, xx) => xx !== 3 && h < H)) { failures++; continue; }
      if (!this.stack(x, piece(patternColor(pattern, x, layers[x], false), false, 2))) { failures++; continue; }
      heights[x]++; layers[x]++; i++; failures = 0;
    }
    this.gravity();
  }
}
