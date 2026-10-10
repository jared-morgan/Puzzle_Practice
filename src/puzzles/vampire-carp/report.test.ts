import { describe, expect, it } from 'vitest';
import { piecesDrawn } from './report';

describe('piece draw luck in a Carpentry report', () => {
  it('leaves an exactly two-piece deviation neutral, and includes unseen pieces', () => {
    const parts = piecesDrawn({ p: 24, f: 12, y: 14, i: 2, l: 8, n: 8, t: 7, u: 4, v: 4, w: 4, x: 3, z: 4, b: 1 });
    expect(parts.every((part) => !part.tone)).toBe(true);
    expect(piecesDrawn({ p: 95 }).find((part) => part.text === 'F: 0')?.tone).toBe('negative');
  });

  it('uses the unrounded expectation, even when the displayed difference looks like two', () => {
    // Total 96: expected F = 14.147..., P = 22.231... .
    const parts = piecesDrawn({ f: 12, p: 25, y: 59 });
    expect(parts.find((part) => part.text === 'F: 12')?.tone).toBe('negative');
    expect(parts.find((part) => part.text === 'P: 25')?.tone).toBe('positive');
    expect(parts.find((part) => part.text === 'I: 0')?.tone).toBe('negative');
  });
});
