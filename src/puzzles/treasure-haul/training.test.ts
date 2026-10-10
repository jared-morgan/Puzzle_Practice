import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { createDrill, emeraldRowsInColumn, type ClearPack } from './training';
import { HaulBoard, isChestOrigin, EMERALD, RUBY, W, H } from './logic';

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
        const { board, chest, solution } = drill;
        expect(board.findRuns()).toHaveLength(0);
        expect(board.cells.filter(isChestOrigin)).toHaveLength(1);
        expect(chest.y).toBeGreaterThanOrEqual(pack === 'emeralds' ? 5 : 3);
        expect(chest.y).toBeLessThanOrEqual(pack === 'emeralds' ? 6 : 5);
        if (pack === 'emeralds') {
          for (const x of [0, 7]) expect([board.get(x, 0), board.get(x, 1)]).toContain(EMERALD);
          expect([0, 2, 3, 4, 6]).toContain(chest.x);
        }
        if (pack === 'edges') {
          expect([0, 6]).toContain(chest.x);
          board.gemRates = [0, 0];
          let hauled = 0;
          for (const move of solution!) {
            board.swap(...move);
            for (let i = 0; i < 300; i++) {
              const result = board.step();
              if (!result) break;
              if (result.kind === 'haul') hauled += result.chests.length;
            }
          }
          expect(hauled).toBe(1);
        }
      }
    }
  });

  it('varies the coins under higher chests and requires an emerald for lone outer coins on either edge', () => {
    const positions = new Set<number>();
    const underneath = new Set<string>();
    let edgeCount = 0;
    for (let seed = 0; seed < 500; seed++) {
      const rng = new PyRandom(seed);
      const { board, chest, opening } = createDrill(() => rng.random(), 'emeralds');
      positions.add(chest.x);
      underneath.add([2, 3, 4].flatMap((y) => [board.get(chest.x, y), board.get(chest.x + 1, y)]).join(''));
      expect(board.findRuns()).toHaveLength(0);
      expect(board.cells.filter((piece) => piece === EMERALD)).toHaveLength(2);
      expect(board.cells).not.toContain(RUBY);
      expect(board.gemRates).toEqual([0, 0]);
      for (let i = 0; i < 64; i++) if (board.cells[i] === EMERALD) expect(Math.floor(i / W)).toBeLessThanOrEqual(1);
      if (chest.x !== 0 && chest.x !== W - 2) continue;
      edgeCount++;
      const outer = chest.x === 0 ? 0 : W - 1;
      const inner = chest.x === 0 ? 1 : W - 2;
      expect(chest.y).toBe(H - 2);
      expect(board.get(outer, H - 1)).not.toBe(board.get(inner, H - 1));
      const locked = board.get(outer, H - 1);
      // No initial coin swap can match the outer coin: the chest blocks its
      // vertical pair and the inner coin cannot be swapped down through the chest.
      for (let x = 0; x < W; x++) for (let y = 1; y < H; y++) {
        if (board.get(x, y) >= 4 || board.get(x, y - 1) >= 4) continue;
        const copy = new HaulBoard(() => 0.5);
        copy.cells.splice(0, copy.cells.length, ...board.cells);
        copy.swap(x, y);
        expect(copy.findRuns().some((run) => run.dir === 0 && run.y === H - 1 && outer >= run.x && outer < run.x + run.length)).toBe(false);
      }
      const blast = board.swap(...opening!);
      expect(blast.kind).toBe('gem');
      if (blast.kind === 'gem') expect(blast.cleared).toContainEqual({ x: outer, y: H - 1, piece: locked, delay: 350 });
    }
    expect([...positions].sort()).toEqual([0, 2, 3, 4, 6]);
    expect(edgeCount).toBeGreaterThan(100);
    expect(edgeCount).toBeLessThan(200);
    expect(underneath.size).toBeGreaterThan(300);
  });

  it('constructs varied edge solutions without rubies or automatic opening matches', () => {
    const patterns = new Set<string>();
    for (let seed = 0; seed < 1000; seed++) {
      const rng = new PyRandom(seed);
      const { board, chest, solution, edgePattern } = createDrill(() => rng.random(), 'edges');
      patterns.add(edgePattern!);
      expect(board.cells).not.toContain(RUBY);
      expect(board.findRuns()).toHaveLength(0);
      expect(solution!.length).toBeGreaterThan(1);
      for (let move = 0; move < solution!.length; move++) {
        // Animation effects also consume the shared random stream between moves.
        for (let effect = 0; effect < 10; effect++) rng.random();
        const result = board.swap(...solution![move]);
        expect(['swap', 'gem']).toContain(result.kind);
        if (edgePattern === 'vertical' && move === 0) {
          expect(board.findRuns()).toContainEqual({ dir: 1, x: solution![0][0], y: 6, length: 3 });
        }
        if (edgePattern === 'single-emerald' && move === solution!.length - 1 && result.kind === 'gem') {
          expect(result.y).toBe(5);
          expect(result.cleared).toContainEqual({ x: chest.x === 0 ? 0 : 7, y: 7, piece: expect.any(Number), delay: 100 });
        }
        if (edgePattern === 'double-emerald' && move === 0 && result.kind === 'gem') {
          const outer = chest.x === 0 ? 0 : 7;
          expect(result.cleared.filter((p) => p.x === outer).map((p) => p.y).sort()).toEqual([5, 7]);
        }
        let hauled = 0;
        let settled = false;
        for (let step = 0; step < 300; step++) {
          const next = board.step();
          rng.random();
          if (!next) { settled = true; break; }
          if (next.kind === 'haul') hauled += next.chests.length;
          expect(board.cells).not.toContain(RUBY);
        }
        expect(settled).toBe(true);
        expect(hauled, `seed ${seed}, ${edgePattern}, move ${move}`).toBe(move === solution!.length - 1 ? 1 : 0);
        board.settle();
      }
    }
    expect([...patterns].sort()).toEqual(['double-emerald', 'horizontal', 'single-emerald', 'vertical']);
  });

  it('counts both emerald diagonals when they intersect the locked column', () => {
    expect(emeraldRowsInColumn(1, 6, 0)).toEqual([5, 7]);
    expect(emeraldRowsInColumn(6, 6, 7)).toEqual([5, 7]);
    expect(emeraldRowsInColumn(2, 5, 0)).toEqual([3, 7]);
    expect(emeraldRowsInColumn(0, 7, 0)).toEqual([]);
  });

  it('retains earlier edge emerald positions for historical replays', () => {
    const rng = new PyRandom(7);
    const { board } = createDrill(() => rng.random(), 'emeralds', 1);
    expect(board.get(7, 6)).toBe(EMERALD);
    expect(board.get(0, 7)).toBe(EMERALD);
  });

  it('retains the previous middle chests and top-row emeralds for version 2 training', () => {
    for (let seed = 0; seed < 30; seed++) {
      const rng = new PyRandom(seed);
      const { board, chest } = createDrill(() => rng.random(), 'emeralds', 2);
      expect(board.get(0, 7)).toBe(EMERALD);
      expect(board.get(7, 7)).toBe(EMERALD);
      expect(chest.x).toBeGreaterThanOrEqual(2);
      expect(chest.x).toBeLessThanOrEqual(4);
      expect(chest.y).toBeGreaterThanOrEqual(3);
      expect(chest.y).toBeLessThanOrEqual(5);
    }
  });
});
