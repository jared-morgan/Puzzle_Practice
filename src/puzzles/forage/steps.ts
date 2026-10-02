// What a move looks like, step by step, for the animations. The board rules in logic.ts
// report each change here as it happens (a rotation, a clear, a fall, a refill), and the
// game draws them one after another. Recording never changes the rules or the random draws.
import type { Board } from './logic';

/** A piece drawn on its own while a step plays, moving between cells and/or fading. */
export interface Sprite {
  piece: string;
  /** [row, column]; rows above the board are negative, columns past its edges are off-board. */
  from: [number, number];
  to: [number, number];
  fade?: 'in' | 'out';
}

export interface Step {
  /** Everything that holds still during the step. */
  board: Board;
  sprites: Sprite[];
  duration: number;
}

export class StepRecorder {
  readonly steps: Step[] = [];

  /**
   * Records a step from the board after the change. Cells that a moving or fading-in sprite
   * ends on are blanked, so the piece isn't drawn twice; `keep` leaves a still board as given.
   */
  add(after: Board, sprites: Sprite[], duration: number, keep = false): void {
    if (!sprites.length) return;
    const board = after.map((row) => [...row]);
    if (!keep) {
      for (const s of sprites) {
        const [r, c] = s.to;
        if (s.fade !== 'out' && board[r]?.[c] !== undefined) board[r][c] = 'z';
      }
    }
    this.steps.push({ board, sprites, duration });
  }
}

/** Falls take longer the further pieces drop, but stay quick. */
export function fallDuration(sprites: Sprite[]): number {
  const rows = Math.max(...sprites.map((s) => Math.abs(s.to[0] - s.from[0]) + Math.abs(s.to[1] - s.from[1])));
  return Math.min(320, 90 + 35 * rows);
}
