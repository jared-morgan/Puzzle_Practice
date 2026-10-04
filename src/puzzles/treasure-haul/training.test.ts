import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { createDrill, type ClearPack } from './training';
import { isChestOrigin, EMERALD } from './logic';

describe('Clear Chests packs', () => {
  it('efficient drills make same-colour threes below the chest and across its other column', () => {
    for (let seed = 0; seed < 100; seed++) {
      const rng = new PyRandom(seed);
      const { board, chest, opening } = createDrill(() => rng.random(), 'efficient');
      board.gemRates = [0, 0];
      expect(opening).toBeDefined();
      expect(board.findRuns()).toHaveLength(0);
      expect(board.swap(...opening!).kind).toBe('swap');
      const matches = board.findRuns();
      const horizontal = matches.find((r) => r.dir === 0)!;
      const vertical = matches.find((r) => r.dir === 1)!;
      expect(horizontal.length).toBe(3);
      expect(vertical.length).toBe(3);
      expect([chest.x, chest.x + 1]).toContain(vertical.x);
      expect(vertical.y).toBeLessThan(chest.y - 1);
      const otherColumn = vertical.x === chest.x ? chest.x + 1 : chest.x;
      expect(otherColumn).toBeGreaterThanOrEqual(horizontal.x);
      expect(otherColumn).toBeLessThan(horizontal.x + horizontal.length);
      expect(board.get(horizontal.x, horizontal.y)).toBe(board.get(vertical.x, vertical.y));
    }
  });

  it('every pack is stable, with middle placement or a solvable edge opening', () => {
    for (const pack of ['standard', 'efficient', 'emeralds', 'edges'] as ClearPack[]) {
      for (let seed = 0; seed < 30; seed++) {
        const rng = new PyRandom(seed);
        const drill = createDrill(() => rng.random(), pack);
        const { board, chest, opening } = drill;
        expect(board.findRuns()).toHaveLength(0);
        expect(board.cells.filter(isChestOrigin)).toHaveLength(1);
        expect(chest.y).toBeGreaterThanOrEqual(3);
        expect(chest.y).toBeLessThanOrEqual(5);
        if (pack === 'emeralds') {
          expect(board.get(0, 7)).toBe(EMERALD);
          expect(board.get(7, 6)).toBe(EMERALD);
        }
        if (pack === 'edges') {
          expect([0, 6]).toContain(chest.x);
          board.gemRates = [0, 0];
          board.swap(...(opening ?? [chest.x, 7]));
          let hauled = 0;
          for (let i = 0; i < 300; i++) {
            const result = board.step();
            if (!result) break;
            if (result.kind === 'haul') hauled += result.chests.length;
          }
          expect(hauled).toBe(1);
        }
      }
    }
  });
});
