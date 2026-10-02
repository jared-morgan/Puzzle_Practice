import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import fixture from './parity-fixture.json';
import {
  fillPuzzle,
  parseBoard,
  randomizeColours,
  scramblePuzzle,
  type Settings,
} from './logic';
import { PUZZLES } from './puzzles';

// The fixture comes from running the original Python modules with the same seeds
// (scripts/parity/forage_fixture.py), so these check the port draw for draw.
const rows = (board: string[][]) => board.map((r) => r.join(''));

const base: Settings = {
  mode: 'ci',
  normalRatios: [0.6472, 0.3435, 0.0094],
  bb: true,
  fj: true,
  cc: true,
  eq: true,
  machete: true,
  shovel: true,
  monkey: true,
  scramble: false,
  forageLevel: 4,
  ants: true,
};

describe('Forage puzzles match the Python version', () => {
  it('fills and scrambles puzzles', () => {
    const settings: Settings = { ...base, mode: 'puzzle' };
    let rng = new PyRandom(77);
    const reserve = parseBoard(['xxxuuxw', 'wywvvuy', 'uxyyxwv', 'vuxvxxw', 'wwuuyxy', 'wvyyvuu', 'uxuxvwx', 'yxyywxu', 'xuwuxyx', 'wvwwxuu']);
    const puzzle = randomizeColours(parseBoard(PUZZLES[3]), rng);
    expect(rows(puzzle)).toEqual(fixture.puzzle3_colours);
    expect(rows(fillPuzzle(puzzle, reserve, settings, rng))).toEqual(fixture.puzzle3);
    rng = new PyRandom(78);
    const scrambled = scramblePuzzle(27, randomizeColours(parseBoard(PUZZLES[27]), rng), reserve, { ...settings, scramble: true }, rng);
    expect(rows(scrambled)).toEqual(fixture.puzzle27_scrambled);
    expect(rows(reserve)).toEqual(fixture.reserve_after);
  });
});
