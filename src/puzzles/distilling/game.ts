// Game rules and board logic, ported function-for-function from Distilling_Sim.pyw.
// Names and data shapes deliberately mirror the Python so the two can be compared side by side.
import { PyRandom } from '../../core/pyrandom';
import { at, contains, deepcopy, eq, floordiv, mod, pyRound, range } from '../../core/py';
import { practiceSettings, setSeeds } from './practice';

/*
-1 = empty
0 = black
1 = brown
2 = burnt
3 = spice
4 = white
*/
export type Board = number[][];
export type SwapRules = boolean[][];
export type Point = number[];
/** [is selected / valid, pixel location, cell coordinate] */
export type Location = [boolean, Point, number[]];
/** [destinations (pixel checkpoints), coordinate end, piece type, speed, time of last update, selected by cursor] */
export type MovingPiece = [Point[], number[], number, number, number, boolean];
export type SwappingBoard = [Board, MovingPiece[]];
/** [is burning?, column up?, time burn starts, pieces in burn column] */
export type BurnColumn = [boolean, boolean, number, number[]];
export type ColumnsUp = [number, Record<number, number>];
/** [piece sequence, rng decider] */
export type Seed = [string, string];

export interface Settings {
  Standard: boolean;
  Seeded: boolean;
  Create: boolean;
  Practice: boolean;
  'Furnace Interval': number;
  'Spawn Rates': number[];
  Difficulty: number;
  'Practice Num': number[];
  Volume: number;
}
export type Mode = 'Standard' | 'Seeded' | 'Create' | 'Practice';

export type SoundName =
  | 'blecch'
  | 'blecch2'
  | 'burn'
  | 'burn_warning'
  | 'burnt'
  | 'crystal_clear'
  | 'crystal_clear2'
  | 'finished'
  | 'smooth'
  | 'spicy'
  | 'swap_down'
  | 'swap_up'
  | 'options_change';

/** The module-level `random` the Python code shares between board generation and sound picks. */
export const random = new PyRandom();

let soundPlayer: (name: SoundName) => void = () => {};
export function setSoundPlayer(player: (name: SoundName) => void): void {
  soundPlayer = player;
}
export function play_sound(name: SoundName): void {
  soundPlayer(name);
}

export const pieces = [0, 1, 2, 3, 4];

const swap_logic: Record<number, number[][]> = {
  0: [[1], [2, 4]],
  1: [[2, 4], [0]],
  2: [[0], [1]],
  3: [[], []],
  4: [[0], [1]],
  [-1]: [[], []],
};

const piece_weights: Record<number, number> = { 0: -1, 1: 0, 2: 1, 3: 0, 4: 1, [-1]: 0 };

export const speed_cap = 3.5; // Maximum amount the normal speed can be multiplied by > 4 or so is effectively uncapped
export const distance_for_speed_increase = 55; // The minimum distance the piece needs to be away from it's destination to get a speed increase
export const speed_divider = 20; // Distance from the end location is divided by this to find the new speed. 55 is the distance of 1 swap
export const distance_buffer = 55; // This distance is not taken into account when finding a new speed
export const speed_constant = 375; // Base speed a swap

export function emptyBoard(): Board {
  return range(10).map(() => range(9).map(() => 0));
}

export function emptySwapRules(): SwapRules {
  return range(9).map(() => range(16).map(() => false));
}

export function board_length(board: Board): number {
  return board[0][8] === -1 ? 9 : 8;
}

function calc_swap(board: Board, column: number, row: number, swap_rules: SwapRules): SwapRules {
  const column_height = board[column][8] === -1 ? 'short' : 'long';
  const logic = swap_logic[board[column][row]];

  if (column_height === 'short') {
    if (row < 8) {
      if (column > 0) {
        swap_rules[column - 1][row * 2] = logic[0].includes(board[column - 1][row]); // left up check
        swap_rules[column - 1][row * 2 + 1] = logic[1].includes(board[column - 1][row + 1]); // left down check
      }
      if (column < 9) {
        swap_rules[column][row * 2] = logic[0].includes(board[column + 1][row]); // right up check
        swap_rules[column][row * 2 + 1] = logic[1].includes(board[column + 1][row + 1]); // right down check
      }
    }
  } else {
    if (column > 0) {
      if (row > 0) swap_rules[column - 1][row * 2 - 1] = logic[0].includes(board[column - 1][row - 1]); // left up check
      if (row < 8) swap_rules[column - 1][row * 2] = logic[1].includes(board[column - 1][row]); // left down check
    }
    if (column < 9) {
      if (row > 0) swap_rules[column][row * 2 - 1] = logic[0].includes(board[column + 1][row - 1]); // right up check
      if (row < 8) swap_rules[column][row * 2] = logic[1].includes(board[column + 1][row]); // right down check
    }
  }
  return swap_rules;
}

export function calc_swaps(board: Board, furnace_height: number): SwapRules {
  const long_columns = furnace_height === 8 ? range(0, board.length, 2) : range(1, board.length, 2);
  const swap_rules = emptySwapRules();
  for (const column of long_columns) {
    for (const row of range(9)) calc_swap(board, column, row, swap_rules);
  }
  return swap_rules;
}

/** Generates a column from a given set of pieces (K's distilling counter seed) */
export function generate_seeded_column(
  spawn_rates: number[],
  difficulty: number,
  seed: Seed,
  old_column_height: number,
): [number[], Seed] {
  if (seed[0].length >= old_column_height) {
    const new_column: number[] = [];
    for (const x of range(old_column_height)) {
      new_column.push(parseInt(seed[0][0], 10));
      seed[0] = seed[0].slice(1);
      if (new_column[x] === 2) new_column[x] = 4;
    }
    if (old_column_height === 8) new_column.push(-1);
    return [new_column, seed];
  }
  return generate_column(spawn_rates, difficulty, seed);
}

export function generate_column(spawn_rates: number[], difficulty: number, seed: Seed): [number[], Seed] {
  const new_column: number[] = [];
  const current_spawn_rates = [...spawn_rates];
  const difficulty_adj = difficulty / 100;
  const chance_low_black = 2 * spawn_rates[0] * difficulty_adj;
  const chance_high_black = 2 * spawn_rates[0] - chance_low_black;
  const chance_high_brown = 2 * spawn_rates[1] * difficulty_adj;
  const chance_low_brown = 2 * spawn_rates[1] - chance_high_brown;
  for (const a of range(9)) {
    if (a < 4) {
      current_spawn_rates[0] = chance_high_black;
      current_spawn_rates[1] = chance_high_brown;
    } else if (a === 4) {
      current_spawn_rates[0] = spawn_rates[0];
      current_spawn_rates[1] = spawn_rates[1];
    } else {
      current_spawn_rates[0] = chance_low_black;
      current_spawn_rates[1] = chance_low_brown;
    }
    new_column.push(random.choiceWeighted(pieces, current_spawn_rates));
  }
  return [new_column, seed];
}

/**
 * The Python version fills a module-level `board`, so the board persists between
 * games; callers pass it in here.
 */
export function generate_board(
  board: Board,
  spawn_rates: number[],
  furnace_height: number,
  difficulty: number,
  seed: Seed,
): [Board, SwapRules, Seed] {
  for (const a of range(board.length - 1)) {
    const [output, nextSeed] = generate_column(spawn_rates, difficulty, seed);
    seed = nextSeed;
    board[a] = deepcopy(output);
  }
  for (const c of range(furnace_height)) board[9][c] = 0;
  for (const d of range((furnace_height + 1) % 2, 10, 2)) board[d][8] = -1;

  const swap_rules = calc_swaps(board, board_length(board));
  return [board, swap_rules, seed];
}

/** Takes an input seed which can be in various forms and transforms it into the form [piece sequence, rng decider] */
export function convert_seed(input: string): Seed {
  let seed: Seed;
  if (input.includes('7')) {
    if (input[0] === '7') return ['', input.slice(1)]; // We have no board, just an rng decider
    // We have both a board and an rng decider. (The Python version discards the
    // result of split() here and then crashes; splitting is what it intended.)
    const split = input.indexOf('7');
    seed = [input.slice(0, split), input.slice(split + 1)];
  } else {
    seed = [input, '']; // There's only a board
  }
  if (seed[0][0] === '8' || seed[0][0] === '9') return seed; // Seed generated through create mode where 8/9 is the furnace height

  // Seed generated through K's Distilling counter which uses different numbers to represent pieces
  seed[0] = seed[0]
    .replaceAll('1', '0')
    .replaceAll('2', '1')
    .replaceAll('5', '2')
    .replaceAll('3', '6') // 6 used as a temporary number
    .replaceAll('4', '3')
    .replaceAll('6', '4');
  return seed;
}

export function import_board(seed: Seed): [Board, SwapRules, Seed] {
  const board: Board = range(10).map(() => range(9).map(() => -1));
  const column_lengths = seed[0][0] === '9' ? [8, 9, 8, 9, 8, 9, 8, 9, 8, 9] : [9, 8, 9, 8, 9, 8, 9, 8, 9, 8];
  if (seed[0][0] === '9' || seed[0][0] === '8') seed[0] = seed[0].slice(1); // The first char just tells us the length of the furnace column, can be ditched now
  for (const x of range(10)) {
    for (const y of range(column_lengths[x])) {
      // A seed that runs out early crashes the Python version; here the gap fills with whites.
      board[x][y] = seed[0].length > 0 ? parseInt(seed[0][0], 10) : 4;
      seed[0] = seed[0].slice(1);
    }
  }
  const swap_rules = calc_swaps(board, board_length(board));
  return [board, swap_rules, seed];
}

function columnLenAt(board: Board, column: number): number {
  const board_len = board_length(board);
  if (mod(column, 2) === 0) return board_len === 8 ? 9 : 8; // Then in a column with opposite length to board_len
  return board_len; // We are in the same column length
}

export function cursor_location(board: Board, mouse_x: number, mouse_y: number, mouse_last_location: Location): Location {
  const x_shift = 25; // This value is one smaller than the first image displayed because the images are only 38x38 and the board gaps are 40x40
  const mouse_x_cell = Math.floor((mouse_x - x_shift) / 40); // Column we are in

  if (mouse_x_cell < 0 || mouse_x_cell > 9) {
    mouse_last_location[0] = false;
    return mouse_last_location;
  }
  const x = mouse_x_cell * 40 + x_shift; // X position we want to display
  const column_len = columnLenAt(board, mouse_x_cell);
  const y_shift = column_len === 8 ? 178 : 158;
  const mouse_y_cell = Math.floor((mouse_y - y_shift) / 40); // Row we are in

  if (mouse_y_cell < 0 || mouse_y_cell > column_len - 1) {
    mouse_last_location[0] = false;
    return mouse_last_location;
  }
  const y = mouse_y_cell * 40 + y_shift; // Y position we want to display
  return [true, [x, y], [mouse_x_cell, mouse_y_cell]];
}

export function pixel_value_of_piece(location: number[], board: Board): Point {
  const column_len = columnLenAt(board, location[0]);
  return [location[0] * 40 + 25, location[1] * 40 + 158 + (9 - column_len) * 20];
}

export function coordinate_of_pixel_value(mouse_last_location: number[], board: Board): number[] {
  const x_coordinate = floordiv(mouse_last_location[0] - 25, 40);
  const column_len = columnLenAt(board, x_coordinate);
  const y_shift = column_len === 8 ? 178 : 158;
  let y_coordinate = floordiv(mouse_last_location[1] - y_shift, 40);
  if (column_len === 8 && y_coordinate === 8) y_coordinate = -1;
  else if (y_coordinate === 9) y_coordinate = -1;
  return [x_coordinate, y_coordinate];
}

export function get_valid_swaps(location_selected: Location, board: Board, swap_rules: SwapRules): number[][] {
  const [col, row] = location_selected[2];
  const column_len = columnLenAt(board, col);
  // Negative indices only happen for a deselected location; Python wraps them, so do the same.
  const rule = (c: number, r: number) => at(at(swap_rules, c), r);
  const valid_swaps: number[][] = [];

  if (column_len === 8) {
    if (col > 0) {
      if (rule(col - 1, row * 2)) valid_swaps.push([col - 1, row]);
      if (rule(col - 1, row * 2 + 1)) valid_swaps.push([col - 1, row + 1]);
    }
    if (col < 9) {
      if (rule(col, row * 2)) valid_swaps.push([col + 1, row]);
      if (rule(col, row * 2 + 1)) valid_swaps.push([col + 1, row + 1]);
    }
  }
  if (column_len === 9) {
    if (col > 0) {
      if (row > 0 && rule(col - 1, row * 2 - 1)) valid_swaps.push([col - 1, row - 1]);
      if (row < 8 && rule(col - 1, row * 2)) valid_swaps.push([col - 1, row]);
    }
    if (col < 9) {
      if (row > 0 && rule(col, row * 2 - 1)) valid_swaps.push([col + 1, row - 1]);
      if (row < 8 && rule(col, row * 2)) valid_swaps.push([col + 1, row]);
    }
  }
  return valid_swaps;
}

export function swap_check(
  mouse_last_location: number[],
  valid_swaps: number[][],
  location_selected: Location,
  board: Board,
): number[] | false {
  for (const valid_swap of valid_swaps) {
    if (eq(mouse_last_location, valid_swap)) {
      let board_len = board_length(board);
      if (!mod(location_selected[2][0], 2)) board_len = board_len === 9 ? 8 : 9;
      const same_row = valid_swap[1] === location_selected[2][1];
      if (board_len === 9) play_sound(same_row ? 'swap_down' : 'swap_up');
      else play_sound(same_row ? 'swap_up' : 'swap_down');
      return valid_swap;
    }
  }
  return false;
}

function smooth_path(destinations: Point[]): Point[] {
  const smooth_amount = 0.8; // A number between 0 and 1, when set to 1 each piece will travel in a straight line from the antepenultimate to the last piece
  const smooth_toggle = 0; // Difference required before smoothing
  const a = at(destinations, -3);
  const b = at(destinations, -2);
  const c = at(destinations, -1);

  for (const axis of [0, 1]) {
    // Python's min(difference[0:1]) only ever looks at the first difference.
    if (a[axis] < b[axis]) {
      if (c[axis] < b[axis]) {
        let difference = b[axis] - a[axis];
        if (difference > smooth_toggle) difference = difference * smooth_amount;
        b[axis] -= difference;
      }
    } else if (c[axis] > b[axis]) {
      let difference = a[axis] - b[axis];
      if (difference > smooth_toggle) difference = difference * smooth_amount;
      b[axis] += difference;
    }
  }
  return destinations;
}

function find_distance_of_list(destinations: Point[]): number {
  let distance = 0;
  for (const x of range(destinations.length - 1)) {
    distance += Math.sqrt((destinations[x][0] - destinations[x + 1][0]) ** 2 + (destinations[x][1] - destinations[x + 1][1]) ** 2);
  }
  return distance;
}

function speed_of_swap(destinations: Point[]): [Point[], number] {
  let speed = 1;
  if (destinations.length > 2) destinations = smooth_path(destinations);
  const destinations_temp: Point[] = [];
  for (const destination of destinations) {
    if (!contains(destinations_temp, destination)) destinations_temp.push(destination);
  }
  destinations = deepcopy(destinations_temp);
  const distance_to_travel = find_distance_of_list(destinations);
  const new_speed = Math.min((distance_to_travel - distance_buffer) / speed_divider, speed_cap);
  if (distance_to_travel > distance_for_speed_increase) speed = new_speed;
  if (speed < 1) speed = 1;
  return [destinations, speed];
}

export function perform_swap(
  board: Board,
  swap_with: number[],
  location_selected: Location,
  time_passed: number,
  swapping_board: SwappingBoard,
): [Board, SwapRules, Location, SwappingBoard] {
  // swap_with is the coordinates of the piece not selected
  // location_selected[1] is the pixel location of start
  // location_selected[2] is the coordinate location of start
  swapping_board[0][swap_with[0]][swap_with[1]] = -1; // We don't want the moving pieces to show normally
  swapping_board[0][location_selected[2][0]][location_selected[2][1]] = -1;

  const temporary_pieces: MovingPiece[] = [];

  // The piece on the cursor
  let deletion: number[] = [];
  let moving_piece_found = false;
  for (const x of range(swapping_board[1].length)) {
    if (eq(swapping_board[1][x][1], location_selected[2])) {
      moving_piece_found = true;
      const destinations = swapping_board[1][x][0];
      destinations.push(pixel_value_of_piece(swap_with, board));
      const [new_destinations, new_speed] = speed_of_swap(destinations);
      temporary_pieces[0] = [
        deepcopy(new_destinations),
        deepcopy(swap_with),
        board[location_selected[2][0]][location_selected[2][1]],
        new_speed,
        swapping_board[1][x][4],
        true,
      ];
      deletion.push(x);
    }
  }
  if (!moving_piece_found) {
    temporary_pieces[0] = [
      [deepcopy(location_selected[1]), deepcopy(pixel_value_of_piece(swap_with, board))], // [0][0] pixel start, [0][-1] pixel end
      deepcopy(swap_with), // [1] coordinate end
      board[location_selected[2][0]][location_selected[2][1]], // [2] piece type
      1, // [3] speed
      time_passed, // [4] time of last update
      true, // [5] if piece is selected by mouse cursor
    ];
  }
  if (deletion.length) swapping_board[1].splice(deletion[0], 1);
  deletion = [];

  // The piece moved by the piece on the cursor
  moving_piece_found = false;
  for (const x of range(swapping_board[1].length)) {
    if (eq(swapping_board[1][x][1], swap_with)) {
      moving_piece_found = true;
      const destinations = swapping_board[1][x][0];
      destinations.push(location_selected[1]);
      const [new_destinations, new_speed] = speed_of_swap(destinations);
      temporary_pieces[1] = [
        deepcopy(new_destinations),
        deepcopy(location_selected[2]),
        board[swap_with[0]][swap_with[1]],
        new_speed,
        swapping_board[1][x][4],
        false,
      ];
      deletion.push(x);
    }
  }
  if (!moving_piece_found) {
    temporary_pieces[1] = [
      [deepcopy(pixel_value_of_piece(swap_with, board)), deepcopy(location_selected[1])],
      deepcopy(location_selected[2]),
      board[swap_with[0]][swap_with[1]],
      1,
      time_passed,
      false,
    ];
  }
  if (deletion.length) swapping_board[1].splice(deletion[0], 1);

  swapping_board[1].push(temporary_pieces[0]);
  swapping_board[1].push(temporary_pieces[1]);

  // Sorting out the pieces on the normal board now that they are correct on the swap board
  const temp_piece = board[swap_with[0]][swap_with[1]];
  board[swap_with[0]][swap_with[1]] = board[location_selected[2][0]][location_selected[2][1]];
  board[location_selected[2][0]][location_selected[2][1]] = temp_piece;
  location_selected[2] = swap_with;
  location_selected[1] = pixel_value_of_piece(location_selected[2], board);

  const swap_rules = calc_swaps(board, board_length(board));
  return [board, swap_rules, location_selected, swapping_board];
}

function sign(number: number): number {
  return number < 0 ? -1 : 1;
}

export function calculate_moving(swapping_board: SwappingBoard, time_passed: number): [SwappingBoard, [number, Point, boolean][]] {
  const moving_pieces: [number, Point, boolean][] = [];

  if (swapping_board[1].length) {
    const pieces_for_deletion: number[] = [];

    for (const p of range(swapping_board[1].length)) {
      const piece = deepcopy(swapping_board[1][p]);
      let x_change = piece[0][1][0] - piece[0][0][0];
      let y_change = piece[0][1][1] - piece[0][0][1];
      let total_change = Math.sqrt(x_change ** 2 + y_change ** 2);
      let time_change = time_passed - piece[4];
      let speed = piece[3] * speed_constant;
      let pixels_to_change = (speed * time_change) / 1000;

      let destinations_reach = 0;
      let piece_at_finish = false;
      let swap_x = 0;
      let swap_y = 0;

      if (Math.abs(pixels_to_change) >= total_change) {
        if (piece[0].length === 2) {
          piece_at_finish = true; // Piece has reached it's end
          swapping_board[0][piece[1][0]][piece[1][1]] = piece[2];
          pieces_for_deletion.push(p);
        } else {
          destinations_reach = 1; // Piece must continue to the next checkpoint
          x_change = piece[0][2][0] - piece[0][1][0];
          y_change = piece[0][2][1] - piece[0][1][1];
          total_change = Math.sqrt(x_change ** 2 + y_change ** 2);
          // How much time we have left after hitting the prior checkpoint
          time_change = total_change === 0 ? 0 : time_change * (1 - pixels_to_change / total_change);
          speed = piece[3] * speed_constant;
          pixels_to_change = (speed * time_change) / 1000;
        }
      }

      if (!piece_at_finish) {
        // Python divides by abs(x_change) inside a try/except ZeroDivisionError.
        swap_x = x_change === 0 ? 0 : Math.sqrt(pixels_to_change ** 2 / (1 + Math.abs(y_change) / Math.abs(x_change)));
        if (Math.abs(swap_x) > Math.abs(piece[0][0][0] - piece[0][1][0])) {
          swap_x = Math.abs(piece[0][0][0] - piece[0][1][0]);
          swap_y = Math.abs(piece[0][0][1] - piece[0][1][1]);
          piece[0][0][0] = piece[0][1][0];
          if (piece[0].length === 2) {
            piece_at_finish = true; // Piece has reached it's end
            swapping_board[0][piece[1][0]][piece[1][1]] = piece[2];
            pieces_for_deletion.push(p);
          }
        } else if (swap_x === 0) {
          swap_y = pixels_to_change;
        } else {
          swap_y = (swap_x * Math.abs(y_change)) / Math.abs(x_change);
        }
      }

      if (!piece_at_finish) {
        swap_x = swap_x * sign(x_change);
        swap_y = swap_y * sign(y_change);
        piece[0][destinations_reach][0] = pyRound(piece[0][destinations_reach][0] + swap_x, 2);
        piece[0][destinations_reach][1] = pyRound(piece[0][destinations_reach][1] + swap_y, 2);
        if (destinations_reach === 1) piece[0] = piece[0].slice(1);

        swapping_board[1][p] = piece;
        swapping_board[1][p][4] = time_passed;
        moving_pieces.push([piece[2], [piece[0][0][0], piece[0][0][1]], piece[5]]);
      }
    }
    if (pieces_for_deletion.length) {
      const to_delete = pieces_for_deletion.map((p) => swapping_board[1][p]);
      for (const d of to_delete) {
        // list.index() finds the first equal element, not necessarily the same object.
        const index = swapping_board[1].findIndex((candidate) => eq(candidate, d));
        swapping_board[1].splice(index, 1);
      }
    }
  }
  return [swapping_board, moving_pieces];
}

function get_column_weight(board: Board): number {
  let column_weight = 0;
  for (const piece of board[9]) column_weight += piece_weights[piece];
  return column_weight;
}

function deal_with_burns(burn_column: BurnColumn, board: Board, burns_in_chamber: number, whites_burnt: number): [Board, number, number] {
  if (!burn_column[1]) {
    for (const piece of burn_column[3]) {
      if (piece === 4) {
        whites_burnt += 1;
        if (whites_burnt % 2 === 0) burns_in_chamber += 1;
      }
    }
  }
  for (const x of range(board[0].length)) {
    if (burns_in_chamber > 0 && board[0][x] === 4) {
      burns_in_chamber -= 1;
      board[0][x] = 2;
    }
  }
  return [board, burns_in_chamber, whites_burnt];
}

export function activate_furnace(
  board: Board,
  location_selected: Location,
  time_passed: number,
  burns_in_chamber: number,
  whites_burnt: number,
  settings: Settings,
  seed: Seed,
): [Board, Location, number[][], SwapRules, BurnColumn, number, number, Seed] {
  const old_column_height = board_length(board);
  const burn_column: BurnColumn = [true, false, time_passed, board[9]];
  if (get_column_weight(board) > -1) burn_column[1] = true;
  board.splice(9, 1);
  if (settings.Standard || settings.Create || settings.Practice) {
    const [new_column, nextSeed] = generate_column(settings['Spawn Rates'], settings.Difficulty, seed);
    seed = nextSeed;
    board.unshift(new_column);
  } else if (settings.Seeded) {
    const [seeded_column, nextSeed] = generate_seeded_column(settings['Spawn Rates'], settings.Difficulty, seed, old_column_height);
    seed = nextSeed;
    board.unshift(seeded_column);
  }
  if (old_column_height === 8) board[0][8] = -1;

  [board, burns_in_chamber, whites_burnt] = deal_with_burns(burn_column, board, burns_in_chamber, whites_burnt);

  const swap_rules = calc_swaps(board, board_length(board));
  let valid_swaps: number[][] = [];
  if (location_selected[0]) {
    if (location_selected[2][0] === 9) {
      location_selected[0] = false;
    } else {
      location_selected[1][0] += 40;
      location_selected[2][0] += 1;
      valid_swaps = get_valid_swaps(location_selected, board, swap_rules);
    }
  }
  return [board, location_selected, valid_swaps, swap_rules, burn_column, burns_in_chamber, whites_burnt, seed];
}

// prettier-ignore
const transparant_values = new Set<string>(
  ('15,39 26,39 7,35 8,0 19,0 30,0 0,5 0,14 0,23 4,2 34,3 10,36 2,32 33,38 3,6 37,8 3,33 37,35 38,0 38,9 7,3 8,4 6,34 29,36 0,0 11,0 0,9 33,33 2,36 3,1 14,1 37,3 25,38 3,10 37,12 37,30 ' +
   '3,37 38,4 36,34 17,39 28,39 6,38 33,1 33,37 34,2 22,0 2,31 3,5 37,7 36,29 7,2 36,38 9,39 6,33 10,3 33,5 25,1 2,8 10,39 34,6 2,35 37,2 32,36 3,0 14,0 3,9 37,11 26,1 36,33 5,36 29,3 28,38 ' +
   '6,37 33,0 2,3 20,39 2,12 2,30 3,4 1,34 36,1 35,36 36,10 36,37 6,5 9,38 39,29 10,2 33,4 39,38 25,0 2,7 12,39 23,39 32,35 1,29 35,31 1,38 36,5 28,1 36,32 5,35 29,2 28,37 6,0 39,24 39,33 2,2 ' +
   '32,3 31,38 2,11 35,8 4,39 1,15 32,39 1,33 35,35 36,0 36,9 5,3 9,1 5,39 6,4 39,10 11,37 39,19 0,37 39,28 39,37 12,38 35,3 4,34 1,10 1,28 1,37 36,4 17,0 28,0 38,32 5,7 39,5 8,36 31,1 30,36 ' +
   '39,14 0,32 39,23 39,32 31,37 32,2 1,5 35,7 4,38 34,39 1,14 1,32 38,27 5,2 38,36 9,0 7,39 18,39 39,0 0,18 39,9 0,27 39,18 12,1 0,36 39,27 4,6 35,2 1,0 4,33 34,34 1,9 37,39 38,13 38,31 5,6 ' +
   '26,38 7,34 0,4 0,13 27,39 39,4 0,22 8,35 20,0 31,0 39,13 0,31 39,22 4,1 32,1 1,4 35,6 34,38 1,13 3,32 37,34 38,8 38,26 38,35 7,38 8,3 30,3 0,8 0,17 39,8 0,26 31,4 0,35 12,0 23,0 4,5 ' +
   '34,33 37,29 3,36 15,1 38,3 37,38 38,12 38,30 27,2 29,39 0,3 0,12 0,21 33,36 34,1 4,0 2,39 37,6 34,37 3,31 37,33 38,7 7,1 7,37 8,2 30,2 0,7 21,39 0,16 10,38 34,5 2,34 37,1 3,8 37,10 37,28 ' +
   '22,39 3,35 38,2 15,0 26,0 38,11 7,5 27,1 11,2 6,36 29,38 0,2 33,35 34,0 2,29 2,38 3,3 37,5 3,30 36,36 7,0 18,0 9,37 10,1 33,3 2,6 10,37 34,4 2,33 32,34 37,0 3,7 37,9 13,39 24,39 35,39 ' +
   '36,31 7,4 5,34 29,1 6,35 29,37 2,1 2,10 2,28 2,37 3,2 37,4 32,38 35,34 36,8 16,39 36,35 5,38 6,3 9,36 6,39 33,2 10,0 39,36 2,5 1,27 1,36 36,3 13,38 24,38 35,38 36,30 36,39 5,33 29,0 39,31 ' +
   '31,36 2,0 2,9 4,37 32,37 1,31 35,33 36,7 5,1 5,37 6,2 21,0 8,39 19,39 30,39 39,17 39,26 39,35 2,4 13,1 24,1 35,1 4,32 1,8 1,26 1,35 36,2 35,37 5,5 9,3 38,39 5,32 6,6 27,38 39,3 39,12 0,30 ' +
   '0,39 11,39 39,21 39,30 39,39 31,35 32,0 1,3 35,5 4,36 1,12 1,30 35,32 1,39 36,6 38,25 28,2 5,0 38,34 6,1 39,7 0,25 8,38 31,3 30,38 39,16 0,34 39,25 4,4 39,34 31,39 32,4 13,0 24,0 4,31 34,32 ' +
   '35,0 1,7 37,37 1,25 38,29 5,4 9,2 38,38 0,11 27,37 39,2 0,20 39,11 0,29 11,38 39,20 0,38 4,8 1,2 35,4 4,35 34,36 16,0 1,11 37,32 3,39 38,6 14,39 38,15 38,24 38,33 7,36 8,1 30,1 0,6 0,15 ' +
   '39,6 0,24 8,37 31,2 30,37 39,15 0,33 4,3 33,39 1,6 37,27 3,34 38,1 37,36 38,10 38,28 38,37 27,0 11,1 0,1 0,10 39,1 0,19 0,28 12,2 33,34 4,7 25,39 1,1 34,35 37,31 3,38 38,5 14,38 38,14').split(' '),
);

function check_if_mouse_in_circle(cell: number[], coordinates: number[], board: Board): boolean {
  const pixel_value_of_cell = pixel_value_of_piece(cell, board);
  const key = `${coordinates[0] - pixel_value_of_cell[0]},${coordinates[1] - pixel_value_of_cell[1]}`;
  return !transparant_values.has(key);
}

export function find_skipped_coordinatees(mouse_change: number[], mouse_old_co: number[], board: Board): number[][] {
  const coords_to_check: number[][] = [];
  if (mouse_change[0] === 0 && mouse_change[1] === 0) return coords_to_check;

  if (Math.abs(mouse_change[0]) >= Math.abs(mouse_change[1])) {
    // There are more x values than y so I should solve for x
    const delta_y = mouse_change[1] / Math.abs(mouse_change[0]);
    const step = mouse_change[0] / Math.abs(mouse_change[0]);
    for (const change_x of range(1, Math.abs(mouse_change[0]) + 1)) {
      coords_to_check.push([
        Math.trunc(mouse_old_co[0] + change_x * step),
        delta_y === 0 ? mouse_old_co[1] : Math.trunc(pyRound(mouse_old_co[1] + change_x * delta_y, 0)),
      ]);
    }
  } else {
    const delta_x = mouse_change[0] / Math.abs(mouse_change[1]);
    const step = mouse_change[1] / Math.abs(mouse_change[1]);
    for (const change_y of range(1, Math.abs(mouse_change[1]) + 1)) {
      coords_to_check.push([
        delta_x === 0 ? mouse_old_co[0] : Math.trunc(pyRound(mouse_old_co[0] + change_y * delta_x, 0)),
        Math.trunc(mouse_old_co[1] + change_y * step),
      ]);
    }
  }

  const cells_to_check: number[][] = [];
  for (const coordinates of coords_to_check) {
    const cell = coordinate_of_pixel_value(coordinates, board);
    if (cell[1] > -1 && !contains(cells_to_check, cell) && check_if_mouse_in_circle(cell, coordinates, board)) {
      cells_to_check.push(cell);
    }
  }
  return cells_to_check;
}

export function check_for_burn(time_passed: number, time_of_last_burn: number, burn_interval: number): boolean {
  return burn_interval - time_passed + time_of_last_burn < 0;
}

export function check_for_burn_warning(time_passed: number, time_of_last_burn: number, burn_interval: number): boolean {
  const warning_time = 2500;
  if (burn_interval - warning_time - time_passed + time_of_last_burn < 0) {
    play_sound('burn_warning');
    return true;
  }
  return false;
}

export function score_column(
  burn_column: BurnColumn,
  cc_chain: number,
  score: number,
  columns_up: ColumnsUp,
): [number, number, ColumnsUp, boolean] {
  const piece_scores: Record<string, Record<number, number>> = {
    true: { [-1]: 0, 0: -1, 1: 0, 2: 0, 3: 3, 4: 1 },
    false: { [-1]: 0, 0: 0, 1: 0, 2: 0, 3: -3, 4: 0 },
  };
  const pieces_in_column: Record<number, number> = { [-1]: 0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const piece of burn_column[3]) pieces_in_column[piece] += 1;

  if (burn_column[1]) {
    columns_up[0] += 1;
    if (pieces_in_column[0] === 0 && pieces_in_column[1] === 0 && pieces_in_column[2] === 0) {
      score += cc_chain * 4;
      cc_chain += 1;
      play_sound(random.choice([true, false]) ? 'crystal_clear' : 'crystal_clear2');
    } else {
      cc_chain = 0;
    }
    if (pieces_in_column[0] + pieces_in_column[2] === pieces_in_column[4]) {
      play_sound(random.choice([true, false]) ? 'blecch' : 'blecch2');
    } else if (pieces_in_column[0] === 0 && pieces_in_column[2] === 0 && pieces_in_column[4] > pieces_in_column[1] && cc_chain < 1) {
      play_sound('smooth');
    }
    if (burn_column[3].includes(3)) play_sound('spicy');
  } else {
    cc_chain = 0;
    play_sound('burn');
    if (burn_column[3].includes(4)) play_sound('burnt');
  }
  if (burn_column[1]) {
    for (const piece of [-1, 0, 1, 2, 3, 4]) columns_up[1][piece] += pieces_in_column[piece];
  }
  for (const piece of burn_column[3]) score += piece_scores[String(burn_column[1])][piece];

  let session_over = false;
  if (columns_up[0] > 11 && (cc_chain < 12 || !burn_column[1])) session_over = true;

  return [score, cc_chain, columns_up, session_over];
}

export function adjust_settings(setting: number, button: number, fallback: number, min: number, max: number, interval: number): number {
  if (button === 1 || button === 4) {
    if (setting < max) setting += interval;
    else if (setting > max) setting = fallback;
  } else if (button === 3 || button === 5) {
    if (setting > max) setting = fallback;
    else if (setting > min) setting -= interval;
  }
  return setting;
}

export function adjust_settings_mode(settings: Settings, mode: Mode): Settings {
  for (const m of ['Standard', 'Seeded', 'Create', 'Practice'] as Mode[]) settings[m] = m === mode;
  return settings;
}

/** Returns the converted seed if the paste is all digits, otherwise the seed passed in. */
export function is_paste_legal(paste: string, seed: Seed): Seed {
  if (!/[^0-9]/.test(paste)) return convert_seed(paste);
  return seed;
}

export function modify_piece(
  mouse_pos: number[],
  board: Board,
  swapping_board: SwappingBoard,
  event_type: 'Scroll' | 'Number',
  input: number,
  swap_rules: SwapRules,
): [Board, SwapRules, SwappingBoard] {
  const mouse_co = coordinate_of_pixel_value(mouse_pos, board);
  const normal_order = [0, 1, 2, 3, 4];
  const useful_order = [0, 1, 4, 3, 2];
  if (mouse_co[1] === -1) return [board, swap_rules, swapping_board];

  if (event_type === 'Scroll') {
    const scroll_direction = Math.trunc((input - 4.5) * -2);
    let piece_index = useful_order.indexOf(board[mouse_co[0]][mouse_co[1]]) + scroll_direction;
    if (piece_index === -1) piece_index = 4;
    else if (piece_index === 5) piece_index = 0;
    board[mouse_co[0]][mouse_co[1]] = useful_order[piece_index];
  } else {
    board[mouse_co[0]][mouse_co[1]] = useful_order[normal_order.indexOf(input)];
  }
  swapping_board[0] = deepcopy(board);
  swap_rules = calc_swaps(board, board_length(board));
  return [board, swap_rules, swapping_board];
}

/** The board in create-mode seed format (the Python version copies this to the clipboard). */
export function get_create_seed(board: Board): string {
  let seed = String(board_length(board));
  for (const x of range(10)) {
    for (const y of range(9)) {
      if (board[x][y] !== -1) seed += String(board[x][y]);
    }
  }
  return seed;
}

/** "7" followed by a random 20 digit number. */
export function generate_seed(): string {
  return '7' + random.randint(10n ** 19n, 10n ** 20n - 1n).toString();
}

export function next_random_seed(random_seed: string): string {
  return '7' + (BigInt(random_seed.slice(1)) + 1n).toString();
}

export function get_practice_settings(practice_num: number[]): [number[], number, number] {
  const key = practice_num.join(',');
  const preset = practiceSettings[key];
  if (preset) {
    const [furnace_interval, difficulty, spawn_rates] = preset;
    return [[...spawn_rates], furnace_interval, difficulty];
  }
  return [[10, 10, 0, 1, 10], 15000000, 50];
}

function alternate_8_and_9(number: number): number {
  return number === 8 ? 9 : 8;
}

export function create_junk_board(junk: number, spawn_rates: number[], furnace_height: number, seed: Seed): [Board, SwapRules, Seed] {
  let junk_left = junk;
  const board: Board = range(10).map(() => range(9).map(() => 4)); // All white starting board

  // if furnace_height 8 then odd columns have piece removed, if 9 then even columns
  for (const a of range(9 - furnace_height, 10, 2)) board[a][8] = -1; // Remove extra pieces from short columns

  if (junk_left > 0) {
    // I want atleast one good black and brown
    board[0][0] = 0;
    junk_left -= 1;
  }
  if (junk_left > 0) {
    board[0][alternate_8_and_9(furnace_height) - 1] = 1;
    junk_left -= 1;
  }

  let junk_height = furnace_height;
  let column = 9;
  while (junk_left >= junk_height) {
    // Full columns of black junk on the right
    for (const row of range(junk_height)) board[column][row] = 0;
    column -= 1;
    junk_left -= junk_height;
    junk_height = alternate_8_and_9(junk_height);
  }
  if (junk_left === 0 && column < 9) {
    // If it added a full column and ran out of junk I want a bottom right brown.
    board[column + 1][alternate_8_and_9(junk_height) - 1] = 1;
  } else {
    // Else fill the column with black leaving one junk for bottom right
    for (const row of range(junk_left - 1)) board[column][row] = 0;
    board[column][junk_height - 1] = 1;
  }

  // Replace some whites with spices
  let total_odds = 0;
  for (const a of spawn_rates) total_odds += a;
  const whites_and_spice_odds = [spawn_rates[3], total_odds - spawn_rates[3]]; // Odds of spice, odds of white
  for (const c of range(10)) {
    for (const row of range(9)) {
      if (board[c][row] === 4) board[c][row] = random.choiceWeighted([3, 4], whites_and_spice_odds);
    }
  }
  const swap_rules = calc_swaps(board, furnace_height);
  return [board, swap_rules, seed];
}

function create_trap_board(junk: number, spawn_rates: number[], furnace_height: number, seed: Seed): [Board, SwapRules, Seed] {
  const [board, , nextSeed] = create_junk_board(junk - 9, spawn_rates, furnace_height, seed);
  seed = nextSeed;
  const trap_at_top = random.choice([false, true]);
  board[0] = generate_column([1, 1, 0, 0, 0], 50, seed)[0];
  board[0][8] = -1;
  if (trap_at_top) {
    board[0][0] = 3;
    board[1][0] = 0;
    board[2][0] = 3;
    board[1][1] = 0;
    board[1][8] = 1;
  } else {
    board[0][7] = 3;
    board[1][8] = 0;
    board[2][7] = 3;
    board[1][0] = 0;
    board[1][7] = 1;
  }
  const swap_rules = calc_swaps(board, 9);
  return [board, swap_rules, seed];
}

export function get_practice_board(
  board: Board,
  practice_num: number[],
  spawn_rates: number[],
  difficulty: number,
  seed: Seed,
): [Board, SwapRules, Seed] {
  const furnace_height = 8;
  const requires_generate_board = [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 6], [2, 9], [3, 5], [3, 6], [4, 5], [5, 4]];
  const requires_junk_board = [[7, 0], [7, 1], [8, 0], [8, 1], [9, 0], [9, 1], [9, 2]];
  const junk_amounts = [36, 36, 19, 19, 19, 19, 19];
  const spice_trapped_boards = [[9, 17], [9, 18], [9, 19], [9, 20], [9, 21]];
  const spice_trapped_junks = [30, 27, 23, 18, 13];

  if (contains(requires_generate_board, practice_num)) return generate_board(board, spawn_rates, furnace_height, difficulty, seed);
  if (contains(requires_junk_board, practice_num)) {
    const junk = junk_amounts[requires_junk_board.findIndex((p) => eq(p, practice_num))];
    return create_junk_board(junk, spawn_rates, furnace_height, seed);
  }
  const seeds = setSeeds[practice_num.join(',')];
  if (seeds) {
    seed[0] = random.choice(seeds);
    return import_board(seed);
  }
  if (contains(spice_trapped_boards, practice_num)) {
    const junk = spice_trapped_junks[spice_trapped_boards.findIndex((p) => eq(p, practice_num))];
    return create_trap_board(junk, spawn_rates, 9, seed);
  }
  // Every practice level is covered above; the Python version would return None here.
  return generate_board(board, spawn_rates, furnace_height, difficulty, seed);
}
