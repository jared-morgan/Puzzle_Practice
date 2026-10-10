import { describe, expect, it } from 'vitest';
import { SPACE } from '../../core/duty/report';
import { BrewBoard, HEAVY, LIGHT, MEDIUM, SPICE, WIDTH, type ColumnResult } from './logic';
import { columnOrbs } from './report';

function column(pieces: number[]): ColumnResult {
  const board = new BrewBoard(0);
  board.columns[WIDTH - 1] = pieces;
  return board.scoreRightColumn();
}

describe('columns in a Distilling report', () => {
  const clear = () => column(Array(8).fill(LIGHT));
  const bad = () => column([MEDIUM, ...Array(7).fill(LIGHT)]);

  it('shows CC13 as thirteen overlapping orbs in one chain', () => {
    const columns = Array.from({ length: 13 }, clear);
    expect(columnOrbs(columns)).toEqual([{ icon: 'orb-clear', label: 'Crystal Clears', count: 13 }]);
  });

  it('omits burnt columns but separates the Crystal Clear chains they break', () => {
    expect(columnOrbs([clear(), clear(), column(Array(8).fill(HEAVY)), clear()])
      .map(({ icon, count }) => [icon, count])).toEqual([['orb-clear', 2], [SPACE, 1], ['orb-clear', 1]]);
  });

  it('gives each bad column its own gap because it is outside a CC chain', () => {
    expect(columnOrbs([bad(), bad(), clear()]).map(({ icon, count }) => [icon, count]))
      .toEqual([['orb-bad', 1], [SPACE, 1], ['orb-bad', 1], [SPACE, 1], ['orb-clear', 1]]);
  });

  it('preserves bad/good runs, with a spacer at every transition', () => {
    expect(columnOrbs([bad(), ...Array.from({ length: 4 }, clear), bad(), ...Array.from({ length: 4 }, clear)])
      .map(({ icon, count }) => [icon, count])).toEqual([
      ['orb-bad', 1], [SPACE, 1], ['orb-clear', 4], [SPACE, 1],
      ['orb-bad', 1], [SPACE, 1], ['orb-clear', 4],
    ]);
  });

  it('shows spice in a clear column as orange, while a spicy bad column remains brown', () => {
    const spicyClear = column([SPICE, ...Array(7).fill(LIGHT)]);
    const spicyBad = column([SPICE, MEDIUM, ...Array(6).fill(LIGHT)]);
    expect(columnOrbs([clear(), spicyClear, clear(), spicyBad]).map(({ icon, count }) => [icon, count]))
      .toEqual([['orb-clear', 1], ['orb-spicy', 1], ['orb-clear', 1], [SPACE, 1], ['orb-bad', 1]]);
  });
});
