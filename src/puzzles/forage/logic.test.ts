import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import fixture from './parity-fixture.json';
import {
  afterMove,
  boardCalc,
  boardTurn,
  createSpawner,
  fillPuzzle,
  generateRandomBoard,
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
  bb: true,
  fj: true,
  cc: true,
  eq: true,
  machete: true,
  shovel: true,
  monkey: true,
  scramble: false,
  forageLevel: 4,
};

describe('Forage matches the Python version', () => {
  it('plays a CI session with every chest and tool enabled', () => {
    const rng = new PyRandom(2024);
    const [board, reserve] = generateRandomBoard(base, rng);
    expect({ board: rows(board), reserve: rows(reserve) }).toEqual(fixture.ci_start);
    const spawner = createSpawner(base, rng)!;
    const cleared = [0, 0, 0];
    let moves = 0;
    const states: string[] = [];
    for (const [r, c, b] of fixture.ci_clicks as [number, number, 1 | 3][]) {
      moves += boardTurn(board, r, c, b, rng);
      boardCalc(board, reserve, base, rng).forEach((n, i) => (cleared[i] += n));
      afterMove(board, spawner, rng);
      states.push(rows(board).join(''));
    }
    expect([...states.filter((_, i) => i % 10 === 0), states.at(-1)]).toEqual(fixture.ci_states);
    expect({ reserve: rows(reserve), cleared, moves, next: spawner.next, column: spawner.column, msl: spawner.movesSinceLast }).toEqual(
      fixture.ci_end,
    );
  });

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
