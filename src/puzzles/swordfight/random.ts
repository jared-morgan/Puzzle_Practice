/** java.util.Random, as used by the cloned ocean's falling pieces and TrainingBot. */
export class JavaRandom {
  private state: bigint;
  private gaussian: number | null = null;
  constructor(seed: string | bigint) { this.state = (BigInt(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n); }
  private bits(count: number): number {
    this.state = (this.state * 0x5deece66dn + 11n) & ((1n << 48n) - 1n);
    return Number(this.state >> BigInt(48 - count));
  }
  int(bound: number): number {
    if (!Number.isSafeInteger(bound) || bound <= 0 || bound > 0x7fffffff) throw new Error('Invalid random bound');
    if ((bound & -bound) === bound) return Math.floor(bound * this.bits(31) / 2147483648);
    for (;;) { const bits = this.bits(31), value = bits % bound; if (bits - value + bound - 1 < 2147483648) return value; }
  }
  double(): number { return (this.bits(26) * 134217728 + this.bits(27)) / 9007199254740992; }
  normal(): number {
    if (this.gaussian !== null) { const value = this.gaussian; this.gaussian = null; return value; }
    for (;;) {
      const a = 2 * this.double() - 1, b = 2 * this.double() - 1, s = a * a + b * b;
      if (s >= 1 || s === 0) continue;
      const scale = Math.sqrt(-2 * Math.log(s) / s); this.gaussian = b * scale; return a * scale;
    }
  }
}
