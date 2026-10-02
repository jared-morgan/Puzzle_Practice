import { describe, expect, it } from 'vitest';
import { PyRandom } from './pyrandom';

// Expected values were produced by CPython 3.11 with the same calls.
describe('PyRandom matches CPython', () => {
  it('reproduces a seeded sequence', () => {
    const r = new PyRandom('12345678901234567890');
    expect([r.random(), r.random(), r.random()]).toEqual([0.8967849279005352, 0.7135791664360509, 0.0014732709980934677]);
    const picks = Array.from({ length: 5 }, () => r.choiceWeighted([0, 1, 2, 3, 4], [10, 10, 0, 1, 10]));
    expect(picks).toEqual([0, 1, 4, 4, 4]);
    expect(Array.from({ length: 6 }, () => r.choice([true, false]))).toEqual([true, false, true, false, true, false]);
    expect(r.choice([1, 2, 3, 4, 5])).toBe(3);
    expect(r.getrandbits(67)).toBe(64873297546205800181n);
    expect(r.randint(10n ** 19n, 10n ** 20n - 1n)).toBe(31289452504423553806n);
  });

  it('seeds from an empty string', () => {
    expect(new PyRandom('').random()).toBe(0.9602256525641875);
  });

  it('seeds from integers', () => {
    const r = new PyRandom(123456789012345);
    expect([r.random(), r.random()]).toEqual([0.6744750084019356, 0.2923275784421222]);
    expect(new PyRandom(2n ** 70n + 5n).random()).toBe(0.46679953776226335);
    expect(new PyRandom(0).random()).toBe(0.8444218515250481);
  });

  it('shuffles, picks unweighted choices and randints like CPython', () => {
    expect(new PyRandom(999999999999999).shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([5, 8, 4, 7, 9, 2, 0, 1, 6, 3]);
    const r = new PyRandom(42);
    expect(Array.from({ length: 6 }, () => r.choicesUniform(['a', 'b', 'c', 'd']))).toEqual(['c', 'a', 'b', 'a', 'c', 'c']);
    const s = new PyRandom(7);
    expect(Array.from({ length: 5 }, () => s.randintN(36, 420))).toEqual([201, 113, 238, 369, 60]);
  });
});
