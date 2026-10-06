import { describe, expect, it } from 'vitest';
import fixtures from './client-fixtures.json';
import { gemStrikes, piece, PieceStream, SwordBoard } from './logic';
import { patternColor, swordPattern } from './patterns';
import { Match, DEFAULTS } from './match';
import { TrainingBot } from './ai';

describe('Swordfight client and cloned-server parity', () => {
  it('deals the same 200 pieces as java.util.Random on the cloned server', () => {
    const stream = new PieceStream(fixtures.seed);
    const actual = Array.from({ length: 100 }, () => stream.pair()).flat().map(p => [p.color, p.breaker]);
    expect(actual).toEqual(fixtures.pieces);
  });
  it('maps supported sword patterns and colour variations exactly as the stock client', () => {
    for (const fixture of fixtures.patterns) {
      const pattern = swordPattern({ type: fixture.type, color1: Math.floor(fixture.variation / 8), color2: fixture.variation % 8 });
      expect(Array.from({ length: 8 }, (_, y) => Array.from({ length: 6 }, (_, x) => patternColor(pattern, x, y, true)))).toEqual(fixture.rows);
      expect(patternColor(pattern, 2, 5, false)).toBe(pattern[1][2]);
    }
  });
  it('converts gems and chains using the cloned server attack builder', () => {
    expect(gemStrikes(2, 2)).toEqual([{ width: 1, height: 4 }]);
    expect(gemStrikes(3, 3)).toEqual([{ width: 2, height: 4 }]);
    expect(gemStrikes(2, 3, 2)).toEqual([{ width: 2, height: 6 }]);
    expect(gemStrikes(6, 4)).toEqual([{ width: 4, height: 3 }, { width: 3, height: 3 }]);
  });
});

describe('player board', () => {
  it('only clears connected colours touched by a breaker', () => {
    const board = new SwordBoard();
    board.stack(0, piece(0)); board.stack(0, piece(0, true)); board.stack(3, piece(0));
    expect(board.resolve().cleared).toBe(2);
    expect(board.get(3, 12)?.color).toBe(0);
  });
  it('joins a rectangle, sends a strike, and includes the loose breaker separately', () => {
    const board = new SwordBoard();
    for (const x of [0, 1]) for (let i = 0; i < 2; i++) board.stack(x, piece(2));
    board.fuse(); expect(board.gems()).toHaveLength(1);
    board.stack(2, piece(2, true));
    const result = board.resolve();
    expect(result.cleared).toBe(5); expect(result.attacks[0].strikes).toEqual([{ width: 1, height: 4 }]);
    expect(result.attacks[0].sprinkles).toBe(0);
  });
  it('holds fused blocks together under gravity', () => {
    const board = new SwordBoard();
    for (let y = 9; y <= 10; y++) for (const x of [0, 1]) board.cells[y][x] = piece(1);
    board.cells[12][0] = piece(2); board.fuse(); board.gravity();
    expect(board.gems()[0]).toMatchObject({ y: 10, width: 2, height: 2 });
    expect(board.get(1, 12)).toBeNull();
  });
  it('ages sprinkles over two placements and strikes over three, with the correct sword colours', () => {
    const pattern = swordPattern({ type: 127, color1: 0, color2: 0 });
    const board = new SwordBoard(); board.receive({ strikes: [], sprinkles: 6, chain: 1 }, pattern, 0);
    expect(board.get(0, 12)).toMatchObject({ color: pattern[0][0], age: 2 });
    board.age(); expect(board.get(0, 12)?.age).toBe(1);
    board.age(); expect(board.get(0, 12)?.age).toBe(0);
    const strikeBoard = new SwordBoard(); strikeBoard.receive({ strikes: [{ width: 1, height: 4 }], sprinkles: 0, chain: 1 }, pattern, 0);
    expect(strikeBoard.cells.flat().filter(Boolean)).toHaveLength(4);
    strikeBoard.age(); strikeBoard.age(); expect(strikeBoard.get(0, 12)?.age).toBe(1);
    strikeBoard.age(); expect(strikeBoard.get(0, 12)?.age).toBe(0);
  });
  it('creates a genuine double when falling pieces reach a second breaker', () => {
    const board = new SwordBoard();
    board.cells[12][0] = piece(0); board.cells[11][0] = piece(0, true);
    board.cells[10][0] = piece(1); board.cells[12][1] = piece(1, true);
    const result = board.resolve();
    expect(result.cleared).toBe(4); expect(result.maxChain).toBe(2);
  });
});

describe('training matches', () => {
  it('is deterministic regardless of render frame rate', () => {
    const settings = { ...DEFAULTS, enemies: 3, speed: 100, randomColors: true };
    const fast = new Match(settings, '424242'), slow = new Match(settings, '424242');
    for (let t = 10; t <= 20000; t += 10) fast.advance(t);
    slow.advance(20000);
    expect(fast).toEqual(slow);
  });
  it('bounds rotation at the wall and supports dropping, top-out, and dismissal', () => {
    const game = new Match({ ...DEFAULTS, mode: 'Practice' }, '1');
    for (let i = 0; i < 10; i++) game.move(-1);
    game.rotate(false); expect(game.positions().every(p => p.x >= 0 && p.x < 6)).toBe(true);
    game.drop(); expect(game.pairs).toBe(1);
    game.dismiss(); game.drop(); expect(game.result).toBe('Dismissed'); expect(game.pairs).toBe(1);
  });
  it('keeps a single saved breaker instead of randomly clearing an unrelated colour', () => {
    const bot = new TrainingBot('1', 1, { ...DEFAULTS, clearChance: 0 });
    bot.board.stack(0, piece(1));
    bot.step([piece(0, true), piece(2)]);
    expect(bot.board.cells.flat().some(p => p?.color === 1)).toBe(true);
  });
  it('queues attacks only on the selected living opponent and wins after their knockouts', () => {
    const game = new Match({ ...DEFAULTS, enemies: 2 }, '424242');
    game.chooseTarget(1);
    game.player.stack(0, piece(0)); game.player.stack(0, piece(0));
    game.falling!.pair = [piece(0, true), piece(3)]; game.falling!.x = 0;
    game.drop();
    expect(game.bots[0].incoming).toEqual([]); expect(game.bots[1].incoming.length).toBeGreaterThan(0);
    for (const bot of game.bots) bot.board.cells[0][3] = piece(0);
    game.advance(6000); expect(game.result).toBe('Won');
  });
});
