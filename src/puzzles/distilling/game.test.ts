import { describe, expect, it } from 'vitest';
import {
  convert_seed,
  create_junk_board,
  emptyBoard,
  generate_board,
  get_create_seed,
  get_practice_board,
  import_board,
  random,
  type Seed,
} from './game';

// Expected boards were captured from the original Python game (Distilling_Sim.pyw)
// by replaying the same actions headless with pygame.
describe('board generation matches the Python version', () => {
  it('generates the same Standard board for a given rng seed', () => {
    const seed: Seed = ['', '14197503245864312206'];
    random.seed(seed[1]);
    const [board] = generate_board(emptyBoard(), [10, 10, 0, 1, 10], 8, 50, seed);
    expect(get_create_seed(board)).toBe('81101431444411110114304010011140000001401141444410400104114114041114040444404000000000');
  });

  it('round-trips a create-mode seed', () => {
    const text = '94104140411011314444114101143140100114400000014011414440114000141041140411040404444140';
    const [board] = import_board(convert_seed(text));
    expect(get_create_seed(board)).toBe(text);
  });

  it('converts seeds from K’s distilling counter', () => {
    expect(convert_seed('12345')).toEqual(['01432', '']);
    expect(convert_seed('7123')).toEqual(['', '123']);
    expect(convert_seed('8447999')).toEqual(['844', '999']);
  });

  it('builds junk and preset practice boards', () => {
    random.seed('1');
    const [junk] = create_junk_board(19, [10, 10, 0, 1, 10], 8, ['', '1']);
    expect(junk[9].slice(0, 8)).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(junk[0][0]).toBe(0);

    random.seed('1');
    const [preset] = get_practice_board(emptyBoard(), [6, 5], [10, 10, 0, 0, 10], 50, ['', '1']);
    expect(get_create_seed(preset)).toBe('8' + '4'.repeat(85));
  });
});
