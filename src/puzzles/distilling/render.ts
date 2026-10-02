// Port of gui.py: draws the game onto a 450x600 canvas, mirroring the pygame blits. The settings
// column gui.py drew to the right of the board is HTML controls in the panel instead (index.ts).
import { image } from './assets';
import type { Board, BurnColumn, ColumnsUp, MovingPiece, Point, SwapRules } from './game';
import { board_length } from './game';
import { mod, pyRound, range } from '../../core/py';

export const display_width = 450;
export const display_height = 600;

let ctx: CanvasRenderingContext2D;

export function initRenderer(context: CanvasRenderingContext2D): void {
  ctx = context;
}

const pieces_img: Record<number, string> = {
  [-1]: 'piece_nothing',
  0: 'piece_black',
  1: 'piece_brown',
  2: 'piece_burnt',
  3: 'piece_spice',
  4: 'piece_white',
  5: 'piece_shadow',
};
const swap_img: Record<number, string> = { 0: 'swap_up', 1: 'swap_down' };

const long_y = 159;
const y_offset = 20;
const start_x = 26;
const gap_x = 40;
const gap_y = 40;
const swaps_gap_y = 20;
const swaps_long_y = 179;
const swaps_start_x = 56;

/** pygame truncates float blit positions to whole pixels. */
function blit(name: string | HTMLImageElement | HTMLCanvasElement, x: number, y: number, area?: number[]): void {
  const img = typeof name === 'string' ? image(name) : name;
  x = Math.trunc(x);
  y = Math.trunc(y);
  if (area) {
    const [ax, ay, aw, ah] = area.map(Math.trunc);
    if (aw <= 0 || ah <= 0) return;
    ctx.drawImage(img, ax, ay, aw, ah, x, y, aw, ah);
  } else {
    ctx.drawImage(img, x, y);
  }
}

export function fill(colour: string): void {
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, display_width, display_height);
}

const colouredVials = new Map<number, HTMLCanvasElement>();

function colour_vial(colour: number): HTMLCanvasElement {
  let cached = colouredVials.get(colour);
  if (cached) return cached;
  const vial = image('vial_back_dark');
  cached = document.createElement('canvas');
  cached.width = vial.width;
  cached.height = vial.height;
  const vctx = cached.getContext('2d')!;
  vctx.drawImage(vial, 0, 0);
  const data = vctx.getImageData(0, 0, vial.width, vial.height);
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] = Math.max(Math.min(data.data[i] + colour, 255), 0);
    data.data[i + 1] = Math.max(Math.min(data.data[i + 1] + colour, 255), 0);
    data.data[i + 2] = Math.max(Math.min(data.data[i + 2] + colour, 255), 0);
    data.data[i + 3] = 255; // The Python version draws onto a surface without per-pixel alpha.
  }
  vctx.putImageData(data, 0, 0);
  colouredVials.set(colour, cached);
  return cached;
}

export function background(background_x: number, background_y: number): void {
  blit('background', background_x, background_y);
}

export function background_two(background_x: number, background_y: number): void {
  blit('background2', background_x, background_y);
}

function get_vial_colour(score: number, columns_up: ColumnsUp): number {
  const colour_change = 50;
  let max_score = columns_up[1][0] + columns_up[1][1] + columns_up[1][2] + columns_up[1][3] + columns_up[1][4];
  for (const x of range(columns_up[0])) max_score += x * 4;
  if (max_score === 0) return 0;
  const vial_colour = score / max_score;
  return Math.trunc(pyRound(vial_colour * colour_change * 2 - colour_change, 0));
}

export function display_vial(score: number, columns_up: ColumnsUp): void {
  blit('vial_back_dark', 235, 55);
  const vial_start_y = 55;
  const vial_start_x = 235;
  const vial_width = 42;
  const vial_height = 75;
  const vial_filled = Math.min(vial_height, (vial_height / 12) * columns_up[0]);
  const vial_new_image = colour_vial(get_vial_colour(score, columns_up));

  blit(vial_new_image, vial_start_x, vial_start_y + vial_height - vial_filled, [0, vial_height - vial_filled, vial_width, vial_filled]);
  ctx.globalAlpha = 240 / 255; // glass_img.set_alpha(240)
  blit('glass', 235, 55);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(vial_start_x, Math.trunc(vial_start_y + vial_height - vial_filled), vial_width + 1, 1);
}

export function display_board(board: Board, swapping_board: Board, burn_column: BurnColumn, time_passed: number, burn_duration: number): void {
  const board_len = board_length(board);
  let animated_x = 0;
  if (burn_column[0]) {
    const burn_completion = (time_passed - burn_column[2]) / burn_duration;
    animated_x = gap_x * burn_completion - gap_x;
  }
  for (const a of range(swapping_board.length)) {
    const column_offset = board_len === 8 ? mod(a, 2) : 1 - mod(a, 2);
    for (const b of range(swapping_board[a].length)) {
      const piece_x = start_x + a * gap_x + animated_x;
      const piece_y = long_y + column_offset * y_offset + b * gap_y;
      blit(pieces_img[swapping_board[a][b]], piece_x, piece_y);
    }
  }
}

export function display_moving_pieces(moving_pieces: [number, Point, boolean][]): void {
  for (const piece of moving_pieces) {
    // Pieces look better 1 pixel lower, I assume this is due to rounding errors but didn't really check
    blit(pieces_img[piece[0]], piece[1][0] + 1, piece[1][1] + 1);
    if (piece[2]) blit('selected_glow', piece[1][0], piece[1][1]);
  }
}

export function display_burn_column(board: Board, burn_column: BurnColumn, time_passed: number, burn_duration: number): void {
  const burn_completion = (time_passed - burn_column[2]) / burn_duration;
  const board_len = board_length(board);
  const burn_height = board_len * gap_y;
  for (const i of range(burn_column[3].length)) {
    let animated_y = burn_height * burn_completion;
    if (burn_column[1]) animated_y = animated_y * -1;
    let piece_y: number;
    if (burn_column[3][8] === -1) {
      piece_y = 179 + i * gap_y + animated_y;
    } else {
      animated_y = (animated_y * 11) / 9;
      piece_y = 159 + i * gap_y + animated_y;
    }
    blit(pieces_img[burn_column[3][i]], 386, piece_y);
  }
}

export function display_swaps(
  board: Board,
  swapping_board: Board,
  swap_rules: SwapRules,
  burn_column: BurnColumn,
  time_passed: number,
  burn_duration: number,
): void {
  const board_len = board_length(board);
  let animated_x = 0;
  if (burn_column[0]) {
    const burn_completion = (time_passed - burn_column[2]) / burn_duration;
    animated_x = gap_x * burn_completion - gap_x;
  }
  for (const a of range(swap_rules.length)) {
    for (const b of range(swap_rules[a].length)) {
      if (!swap_rules[a][b]) continue;
      // Find the pieces that it connects, if both there, show swap
      let swap_is_after_long_column = a % 2 !== 0;
      if (board_len === 8) swap_is_after_long_column = !swap_is_after_long_column;

      let should_display_swap = true;
      const half = Math.floor(b / 2);
      if (swap_is_after_long_column) {
        if (swapping_board[a][half + (b % 2)] === -1) should_display_swap = false;
        else if (swapping_board[a + 1][half] === -1) should_display_swap = false;
      } else {
        if (swapping_board[a][half] === -1) should_display_swap = false;
        else if (swapping_board[a + 1][half + (b % 2)] === -1) should_display_swap = false;
      }
      if (should_display_swap) {
        const piece_x = swaps_start_x + a * gap_x + animated_x;
        const piece_y = swaps_long_y + b * swaps_gap_y;
        let swap_direction: number;
        if (board_len === 9) swap_direction = a % 2 === b % 2 ? 1 : 0; // 1 = \, 0 = /
        else swap_direction = a % 2 === b % 2 ? 0 : 1;
        blit(swap_img[swap_direction], piece_x - swap_direction + 1, piece_y); // one image is slightly off so small correction needed
      }
    }
  }
}

export function display_cursor(x: number, y: number): void {
  blit('cursor', x, y);
}

export function display_selected(x: number, y: number, moving: MovingPiece[]): void {
  const cursor_in_swap = moving.some((swap) => swap[5]);
  if (!cursor_in_swap) blit('selected_glow', x, y);
}

export function display_furnace(time_passed: number, time_of_last_burn: number, burn_interval: number): void {
  if (time_of_last_burn + burn_interval < time_passed) time_of_last_burn = time_passed - burn_interval;
  const time_left = burn_interval - time_passed + time_of_last_burn;
  const furnace_dimensions = [109, 66];
  const image_start_y = 11;
  const image_end_y = furnace_dimensions[1] - 5;
  const image_change_y = image_end_y - image_start_y; // The amount of the image we care about
  const pixels_to_show = Math.trunc(pyRound((1 - time_left / burn_interval) * image_change_y, 0));
  const highest_pixel_reached = image_start_y + image_change_y - pixels_to_show;
  blit('furnace_hot', 341, 534 + highest_pixel_reached, [0, highest_pixel_reached, furnace_dimensions[0], pixels_to_show]);
}

export function display_create(create_piece: number): void {
  const useful_order = [0, 1, 4, 3, 2];
  for (const x of range(5)) {
    blit(pieces_img[5], 20 + x * 45 - 2, 90 - 2);
    blit(pieces_img[useful_order[x]], 20 + x * 45, 90);
  }
  blit('selected_glow', create_piece * 45 + 20 - 1, 90 - 1);
}
