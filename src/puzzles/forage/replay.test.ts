import { describe, expect, it } from 'vitest';
import { isReplay, replayBytes, type Replay } from './replay';

const sample = (): Replay => ({
  v: 2, at: 1000, end: 120000, result: 'Score 42', puzzleId: '0', pickedRandomly: false,
  settings: {
    mode: 'chaos', forageLevel: 6, normalRatios: [0.6, 0.3, 0.1],
    bb: true, fj: true, cc: true, eq: true, machete: true, shovel: true, monkey: true, ants: true, scramble: true,
    roundSeconds: 120,
  },
  seeds: [12, 34], boards: ['5678'], mouse: [100, 10, 20, 200, 30, 40],
  events: [{ t: 500, k: 'act', x: 2, y: 3, ccw: true }],
});

describe('replay files', () => {
  it('reads old and current replay versions and measures exact file bytes', () => {
    const r = sample();
    expect(isReplay(r)).toBe(true);
    expect(isReplay({ ...r, v: 1 })).toBe(true);
    r.result = 'Score 42 · replay';
    expect(replayBytes(r)).toBe(new Blob([JSON.stringify(r)]).size);
  });
  it('rejects malformed files before playback or seeking', () => {
    expect(isReplay(null)).toBe(false);
    expect(isReplay({ ...sample(), settings: null })).toBe(false);
    expect(isReplay({ ...sample(), mouse: [1, 2] })).toBe(false);
    expect(isReplay({ ...sample(), events: [{ t: 10, k: 'act', x: 20, y: 3, ccw: true }] })).toBe(false);
    expect(isReplay({ ...sample(), events: [{ t: 900, k: 'newboard' }, { t: 100, k: 'newboard' }] })).toBe(false);
    expect(isReplay({ ...sample(), boards: ['not a seed'] })).toBe(false);
  });
});
