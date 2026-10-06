import { TrainingBot, aiInterval, type AiSettings } from './ai';
import { type Attack, attackSize, type Pair, type Piece, PieceStream, SwordBoard, W, H } from './logic';
import { type Sword, swordPattern } from './patterns';
import { JavaRandom } from './random';

export interface Settings extends AiSettings {
  enemies: number; sword: number; color1: number; color2: number; randomColors: boolean; mode: 'Fight' | 'Practice';
}
export const DEFAULTS: Settings = { speed: 0, clearChance: 35, comboChance: 0, breakAverage: 50,
  enemies: 1, sword: 127, color1: 0, color2: 0, randomColors: false, mode: 'Fight' };
export function validSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const s = value as Settings;
  return [s.speed, s.clearChance, s.comboChance, s.breakAverage].every(n => Number.isInteger(n) && n >= 0 && n <= 100) &&
    Number.isInteger(s.enemies) && s.enemies >= 1 && s.enemies <= 10 &&
    [127, 6, 2, 9, 18, 17, 11, 12, 0].includes(s.sword) &&
    [s.color1, s.color2].every(n => Number.isInteger(n) && n >= 0 && n < 8) && typeof s.randomColors === 'boolean' &&
    ['Fight', 'Practice'].includes(s.mode);
}
export interface Falling { pair: Pair; x: number; y: number; rotation: number; }
const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
export class Match {
  readonly player = new SwordBoard();
  readonly pieces: PieceStream;
  readonly bots: TrainingBot[];
  readonly swords: Sword[];
  readonly patterns: number[][][];
  incoming: Array<{ attack: Attack; seat: number; id: number }> = [];
  falling: Falling | null = null;
  next: Pair;
  nextAi: number[];
  nextFall = 400;
  elapsed = 0;
  target = 0;
  pairs = 0;
  cleared = 0;
  sent = 0;
  received = 0;
  maxChain = 0;
  lastChain = 0;
  result: 'Won' | 'Lost' | 'Dismissed' | null = null;
  private attackId = 0;
  constructor(readonly settings: Settings, readonly seed: string) {
    if (!validSettings(settings) || !/^-?\d{1,20}$/.test(seed)) throw new Error('Invalid Swordfight setup');
    this.pieces = new PieceStream(seed);
    const colors = new JavaRandom(BigInt(seed) ^ 0x434f4c4f5253n);
    const count = settings.mode === 'Practice' ? 0 : settings.enemies;
    this.bots = Array.from({ length: count }, (_, i) => new TrainingBot(seed, i + 1, settings));
    this.swords = Array.from({ length: count + 1 }, (_, i) => ({ type: settings.sword,
      color1: i && settings.randomColors ? colors.int(8) : settings.color1,
      color2: i && settings.randomColors ? colors.int(8) : settings.color2 }));
    this.patterns = this.swords.map(swordPattern);
    this.nextAi = this.bots.map(() => aiInterval(settings.speed));
    this.next = this.pieces.pair(); this.spawn();
  }
  private spawn(): void {
    if (this.player.topOut()) { this.result = 'Lost'; this.falling = null; return; }
    this.falling = { pair: this.next, x: 3, y: 0, rotation: 0 }; this.next = this.pieces.pair();
    this.nextFall = this.elapsed + this.fallInterval();
  }
  private fallInterval(): number { return Math.max(160, 400 - Math.floor(this.pairs / 10) * 13); }
  positions(falling = this.falling): Array<{ x: number; y: number; piece: Piece }> {
    if (!falling) return [];
    const [dx, dy] = offsets[falling.rotation];
    return [{ x: falling.x, y: falling.y, piece: falling.pair[0] }, { x: falling.x + dx, y: falling.y + dy, piece: falling.pair[1] }];
  }
  private fits(f: Falling): boolean { return this.positions(f).every(p => p.x >= 0 && p.x < W && p.y < H && (p.y < 0 || !this.player.get(p.x, p.y))); }
  move(dx: number): void {
    if (!this.falling || this.result) return;
    const next = { ...this.falling, x: this.falling.x + dx }; if (this.fits(next)) this.falling = next;
  }
  rotate(clockwise: boolean): void {
    if (!this.falling || this.result) return;
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1]]) {
      const next = { ...this.falling, rotation: (this.falling.rotation + (clockwise ? 1 : 3)) % 4,
        x: this.falling.x + dx, y: this.falling.y + dy };
      if (this.fits(next)) { this.falling = next; return; }
    }
  }
  drop(): void {
    if (!this.falling || this.result) return;
    while (this.fits({ ...this.falling, y: this.falling.y + 1 })) this.falling.y++;
    this.lock();
  }
  landing(): Falling | null {
    if (!this.falling) return null;
    const ghost = { ...this.falling }; while (this.fits({ ...ghost, y: ghost.y + 1 })) ghost.y++;
    return ghost;
  }
  chooseTarget(seat: number): void { if (this.bots[seat] && !this.bots[seat].board.topOut()) this.target = seat; }
  cycleTarget(direction: number): void {
    for (let i = 1; i <= this.bots.length; i++) {
      const seat = (this.target + direction * i + this.bots.length * i) % this.bots.length;
      if (!this.bots[seat].board.topOut()) { this.target = seat; return; }
    }
  }
  private lock(): void {
    const positions = this.positions();
    if (positions.some(p => p.y < 0)) { this.result = 'Lost'; this.falling = null; return; }
    this.player.age();
    for (const p of positions) this.player.cells[p.y][p.x] = p.piece;
    this.pairs++;
    const clear = this.player.resolve(); this.cleared += clear.cleared; this.maxChain = Math.max(this.maxChain, clear.maxChain); this.lastChain = clear.maxChain;
    for (const attack of clear.attacks) { const amount = attackSize(attack); this.sent += amount; this.bots[this.target]?.incoming.push(amount); }
    const incoming = this.incoming.shift();
    if (incoming) { this.received += attackSize(incoming.attack); this.player.receive(incoming.attack, this.patterns[incoming.seat + 1], incoming.id); }
    this.spawn();
  }
  advance(to: number): void {
    if (this.result) return;
    if (this.bots.length && this.bots.every(bot => bot.board.topOut())) {
      this.result = 'Won'; this.falling = null; return;
    }
    to = Math.max(this.elapsed, to);
    while (!this.result) {
      const nextAi = Math.min(...this.nextAi.map((at, seat) => this.bots[seat].board.topOut() ? Infinity : at));
      const next = Math.min(nextAi, this.nextFall); if (next > to) break;
      this.elapsed = next;
      if (nextAi <= this.nextFall) {
        const seat = this.nextAi.findIndex((at, i) => at === next && !this.bots[i].board.topOut());
        if (seat < 0) throw new Error('Invalid opponent schedule');
        this.nextAi[seat] += aiInterval(this.settings.speed);
        for (const attack of this.bots[seat].step()) if (attackSize(attack)) this.incoming.push({ attack, seat, id: this.attackId++ });
        if (this.bots[this.target]?.board.topOut()) this.cycleTarget(1);
        if (this.bots.every(bot => bot.board.topOut())) { this.result = 'Won'; this.falling = null; }
      } else {
        if (this.falling && this.fits({ ...this.falling, y: this.falling.y + 1 })) { this.falling.y++; this.nextFall += this.fallInterval(); }
        else this.lock();
      }
    }
    if (!this.result) this.elapsed = to;
  }
  dismiss(): void { if (!this.result) { this.result = 'Dismissed'; this.falling = null; } }
}
