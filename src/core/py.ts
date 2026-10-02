// Small helpers that give Python semantics where JavaScript differs.

/** Python's `%` (result takes the sign of the divisor). */
export function mod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** Python's `//`. */
export function floordiv(a: number, b: number): number {
  return Math.floor(a / b);
}

/** Python list indexing, including negative indices. */
export function at<T>(list: readonly T[], index: number): T {
  return list[index < 0 ? list.length + index : index];
}

/** Python `==` on (nested) lists of primitives. */
export function eq(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, i) => eq(value, b[i]));
  }
  return a === b;
}

/** Python `x in list` for (nested) lists of primitives. */
export function contains(list: readonly unknown[], item: unknown): boolean {
  return list.some((value) => eq(value, item));
}

/** copy.deepcopy for plain data. */
export function deepcopy<T>(value: T): T {
  return structuredClone(value);
}

/** Python's round(x, ndigits). Uses round-half-even like CPython for exact halves. */
export function pyRound(x: number, ndigits = 0): number {
  const factor = 10 ** ndigits;
  const scaled = x * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let rounded: number;
  if (diff > 0.5) rounded = floor + 1;
  else if (diff < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  return rounded / factor;
}

/** str() of a Python float. */
export function floatStr(x: number): string {
  return Number.isInteger(x) ? x.toFixed(1) : String(x);
}

export function range(start: number, stop?: number, step = 1): number[] {
  if (stop === undefined) {
    stop = start;
    start = 0;
  }
  const out: number[] = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
  else for (let i = start; i > stop; i += step) out.push(i);
  return out;
}
