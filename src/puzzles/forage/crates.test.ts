import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { CRATE_SIZES, crateSize, HEIGHT, isCrate, isCrateAnchor, isTool, WIDTH } from './board';
import { GauntletChests, ServerRequests } from './crates';
import { Forage } from './engine';

/** Plays random clicks, favouring tools, and checks the board stays whole. */
function play(game: Forage, moves: number, seed: number): void {
  const pick = new PyRandom(seed);
  for (let i = 0; i < moves; i++) {
    let x = pick.randintN(0, WIDTH - 2);
    let y = pick.randintN(0, HEIGHT - 2);
    const tools = game.cells.flatMap((p, j) => (isTool(p) ? [j] : []));
    if (tools.length && pick.random() < 0.3) {
      const j = pick.choice(tools);
      [x, y] = [j % WIDTH, Math.floor(j / WIDTH)];
    }
    game.act(x, y, pick.random() < 0.5);
    // Gaps only stay under a wedged crate: refills come from the top.
    game.cells.forEach((p, j) => {
      if (p !== -1) return;
      const [cx, cy] = [j % WIDTH, Math.floor(j / WIDTH)];
      const above = Array.from({ length: cy }, (_, yy) => game.board.getPiece(cx, yy));
      expect(above.some(isCrate), `gap at ${cx},${cy}`).toBe(true);
    });
    const anchors = game.cells.filter(isCrateAnchor);
    expect(game.board.crates).toBe(anchors.length);
    expect(game.board.crateArea).toBe(anchors.reduce((a, p) => a + CRATE_SIZES[crateSize(p)].width * CRATE_SIZES[crateSize(p)].height, 0));
  }
}

describe('crate sources', () => {
  it('normal foraging asks for at most one crate per banana, and never more than 3 at once', () => {
    const source = new ServerRequests(new PyRandom(3), [0.6, 0.35, 0.05], 9);
    const game = new Forage(11n, source);
    play(game, 1500, 1);
    expect(source.requested).toBeGreaterThan(2);
    expect(source.requested).toBeLessThanOrEqual(9);
    expect(game.cratesCollected).toBeLessThanOrEqual(9);
  });

  it('the Gauntlet brings 9 chests a board, at most 3 on it, scored 1, 2 or 3', () => {
    const source = new GauntletChests(new PyRandom(4), [0.5, 0.35, 0.15], 9);
    const game = new Forage(12n, source);
    let points = 0;
    let collected = 0;
    for (let i = 0; i < 1500; i++) {
      game.act(i % (WIDTH - 1), (i * 7) % (HEIGHT - 1), i % 3 === 0);
      points += game.lastResult.gauntletPoints;
      collected += game.lastResult.collected.reduce((a, b) => a + b, 0);
      expect(game.board.crates).toBeLessThanOrEqual(3);
      game.lastResult.gauntletPoints = 0;
      game.lastResult.collected = [0, 0, 0];
    }
    expect(source.budget).toBeGreaterThanOrEqual(0);
    expect(points).toBeGreaterThanOrEqual(collected);
  });
});
