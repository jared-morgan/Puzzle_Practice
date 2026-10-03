import { describe, expect, it } from 'vitest';
import { PyRandom } from '../../core/pyrandom';
import { BoardRandom, type Cell } from './board';
import { CELL, COLS, Game, LEVEL_HOLES, newStats, ROWS, type SoundName, type SpeedConfig, VIEW_X, VIEW_Y } from './game';

/** A greedy player: the placement covering the most open cells, preferring holes with pieces in. */
function bestMove(game: Game): { slot: number; turns: number; flip: boolean; cell: Cell } | null {
  let best: { slot: number; turns: number; flip: boolean; cell: Cell; score: number } | null = null;
  game.tools.forEach((tool, slot) => {
    if (!tool) return;
    for (const flip of [false, true]) {
      for (let turns = 0; turns < 4; turns++) {
        const piece = Object.assign(Object.create(Object.getPrototypeOf(tool.piece)), tool.piece);
        if (flip) piece.flip();
        for (let i = 0; i < turns; i++) piece.rotate(true);
        for (let x = 0; x < COLS; x++) {
          for (let y = 0; y < ROWS; y++) {
            if (game.inToolbox([x, y])) continue;
            const t = game.target([x, y], piece);
            if (!t || t.hole.size === 0 || t.hole.filled) continue;
            const covers = t.hole.checkPiece(piece, t.at[0], t.at[1]);
            if (covers === 0) continue;
            const score = covers * 10 + (t.hole.piecesUsed > 0 ? 5 : 0) - (piece.isPutty ? 30 : 0);
            if (!best || score > best.score) best = { slot, turns, flip, cell: [x, y], score };
          }
        }
      }
    }
  });
  return best;
}

function play(speed: SpeedConfig | null, seed: number, moves: number) {
  const sounds: SoundName[] = [];
  let levels = 0;
  const stats = newStats();
  let now = 0;
  const game = new Game(seed, new BoardRandom(seed), stats, { sound: (s) => sounds.push(s), levelDone: () => levels++ }, speed, new PyRandom(seed), now);
  const tick = (ms: number) => {
    for (let t = 0; t < ms; t += 16) game.update((now += 16));
  };
  tick(1500);
  let placed = 0;
  for (let i = 0; i < moves && levels === 0; i++) {
    while ((game.scrolling || game.levelText) && levels === 0) tick(100);
    if (levels > 0) break;
    const move = bestMove(game);
    if (!move) break;
    game.keyPick(move.slot);
    if (move.flip) game.flip();
    for (let t = 0; t < move.turns; t++) game.rotate(true);
    const px = VIEW_X + move.cell[0] * CELL + 5;
    const py = VIEW_Y + move.cell[1] * CELL + 5;
    game.pointerMove(px, py);
    const before = stats.placed;
    game.pointerDown(1, px, py);
    game.pointerUp(1);
    if (stats.placed > before) placed++;
    tick(1600);
  }
  return { game, stats, sounds, levels, placed };
}

describe('vampire carpentry play', () => {
  it('fills a board of 17 holes, scrolling in new ones, then moves on', () => {
    const { stats, sounds, levels, placed } = play(null, 12345, 400);
    expect(placed).toBeGreaterThan(50);
    expect(stats.holesFilled).toBe(LEVEL_HOLES);
    expect(levels).toBe(1);
    expect(stats.scrolls[0] + stats.scrolls[1]).toBeGreaterThan(3);
    expect(sounds.filter((s) => s.startsWith('hole_m') || s === 'hole_craftsmanship' || s === 'hole_pigs_breakfast').length).toBe(LEVEL_HOLES);
    expect(sounds).toContain('hole_grows');
    expect(stats.grades.reduce((a, b) => a + b, 0)).toBe(LEVEL_HOLES);
  });

  it('speed mode keeps dealing small holes', () => {
    for (const size of [1, 2, 3]) {
      const { stats } = play({ holes: 2, size, letter: 12 }, 99 + size, 60);
      expect(stats.holesFilled, `size ${size}`).toBeGreaterThan(5);
    }
  });
});
