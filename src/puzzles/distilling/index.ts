// Port of the main loop in Distilling_Sim.pyw. The shell queues browser input and hands it
// over once per frame, in the same order pygame's event loop handled it.
import { SoundBank } from '../../core/audio';
import { copyText, pasteText } from '../../core/clipboard';
import type { InputEvent } from '../../core/input';
import type { PuzzleFactory } from '../../core/puzzle';
import { loadAssets } from './assets';
import {
  activate_furnace,
  adjust_settings,
  adjust_settings_mode,
  board_length,
  calc_swaps,
  calculate_moving,
  check_for_burn,
  check_for_burn_warning,
  convert_seed,
  cursor_location,
  emptyBoard,
  emptySwapRules,
  find_skipped_coordinatees,
  generate_board,
  generate_seed,
  get_create_seed,
  get_practice_board,
  get_practice_settings,
  get_valid_swaps,
  import_board,
  is_paste_legal,
  modify_piece,
  next_random_seed,
  perform_swap,
  pixel_value_of_piece,
  play_sound,
  random,
  type SoundName,
  score_column,
  setSoundPlayer,
  swap_check,
  type Board,
  type BurnColumn,
  type ColumnsUp,
  type Location,
  type Seed,
  type Settings,
  type SwappingBoard,
  type SwapRules,
} from './game';
import { practiceAvailable, practiceGroupNames, practiceNames } from './practice';
import { at, deepcopy, range } from '../../core/py';
import * as gui from './render';

type PasteEvent = { type: 'paste'; target: 'Create' | 'Seeded'; text: string };

const black = 'rgb(31, 31, 31)';
const soundUrls = import.meta.glob<string>('./sounds/*.mp3', { eager: true, query: '?url', import: 'default' });

/** pygame key codes for the keys the game listens to. */
function keyCode(key: string): number | null {
  if (key === 'escape') return 27;
  return /^[0-9]$/.test(key) ? 48 + Number(key) : null;
}

export default (async (ctx) => {
await loadAssets();
gui.initRenderer(ctx.screen.ctx);
const sounds = new SoundBank<SoundName>(soundUrls);
const get_ticks = ctx.ticks;

/* Variables preloaded */
let board_active = false;
let mouse_last_location: Location = [false, [-100, -100], [-1, -1]];
let location_selected: Location = [false, [-100, -100], [-1, -1]];
let burn_duration = 1000;
let burn_column: BurnColumn = [false, false, get_ticks(), []];

let start_time = get_ticks();
let time_of_last_burn = start_time;
let mouse_new_co: number[] = [];
let mouse_old_co: number[] = [];
let burn_waiting = false;
let score = 0;
let cc_chain = 0;
let columns_up: ColumnsUp = [0, { [-1]: 0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }];
let whites_burnt = 0;
let burns_in_chamber = 0;
let warning_played = false;
let session_paused: [boolean, number, number] = [false, 0, 0];
let is_create_seeded = false;
let time_passed = get_ticks() - start_time;

let settings: Settings = {
  Standard: true,
  Seeded: false,
  Create: false,
  Practice: false,
  'Furnace Interval': 15000,
  'Spawn Rates': [10, 10, 0, 1, 10],
  Difficulty: 50,
  'Practice Num': [0, 0],
  Volume: 3,
};
const spawn_rates_default = [10, 10, 0, 1, 10];
let seed: Seed = ['', ''];
let original_seed: Seed = ['', ''];

let board: Board = emptyBoard();
let swap_rules: SwapRules = emptySwapRules();
let swapping_board: SwappingBoard = [deepcopy(board), []];
let valid_swaps: number[][] = [];
let session_over = false;
let create_piece = 0;
let using_random_seed = true;
let paint_with: [boolean, number] = [false, -1];
let mouse_pos: [number, number] = [0, 0];
let current_mouse: [number, number] = [0, 0];

// I need a random number selected before the user sets the seed so that they can escape the loop of non randomness if desired.
let random_seed = generate_seed();

const pasted: PasteEvent[] = [];
const sound_volumes = (volume: number) => sounds.setVolume(volume);

sound_volumes(settings.Volume / 6);
setSoundPlayer((name) => sounds.play(name));

function copyToClipboard(value: string): void {
  // pyperclip.copy in the desktop version.
  copyText(value, 'Copy this seed:');
}

function requestPaste(target: 'Create' | 'Seeded'): void {
  // pyperclip.paste in the desktop version. Reading the clipboard is asynchronous in a
  // browser, so the result is queued and handled on a later frame.
  void pasteText('Paste a seed:').then((text) => {
    if (text !== null) pasted.push({ type: 'paste', target, text });
  });
}

function start_procedure(): void {
  seed = deepcopy(original_seed);
  session_over = false;
  let spawn_rates = settings['Spawn Rates'];
  let furnace_interval = settings['Furnace Interval'];
  let difficulty = settings.Difficulty;

  if (settings.Standard) {
    original_seed = ['', random_seed.slice(1)];
    seed = deepcopy(original_seed);
    random_seed = next_random_seed(random_seed);
    random.seed(seed[1]);
    [board, swap_rules, seed] = generate_board(board, settings['Spawn Rates'], 8, settings.Difficulty, seed);
  } else if (settings.Seeded) {
    if (using_random_seed) {
      seed[1] = random_seed.slice(1);
      original_seed[1] = seed[1];
      random_seed = next_random_seed(random_seed);
    }
    random.seed(seed[1]);
    if (original_seed[0] !== '') {
      [board, swap_rules, seed] = import_board(seed);
    } else {
      [board, swap_rules, seed] = generate_board(board, settings['Spawn Rates'], 8, settings.Difficulty, seed);
      original_seed = ['', seed[1]];
    }
  } else if (settings.Create) {
    if (is_create_seeded) {
      // Is it using a set board
      if (using_random_seed) {
        // Is it using a set rng generator
        seed[1] = random_seed.slice(1);
        random_seed = next_random_seed(random_seed);
      }
      random.seed(seed[1]);
      [board, swap_rules, seed] = import_board(seed);
    } else {
      original_seed = ['', random_seed.slice(1)];
      seed = deepcopy(original_seed);
      random_seed = next_random_seed(random_seed);
      random.seed(seed[1]);
      [board, swap_rules, seed] = generate_board(board, settings['Spawn Rates'], 8, settings.Difficulty, seed);
    }
  } else if (settings.Practice) {
    original_seed = ['', random_seed.slice(1)];
    seed = deepcopy(original_seed);
    random_seed = next_random_seed(random_seed);
    random.seed(seed[1]);
    [spawn_rates, furnace_interval, difficulty] = get_practice_settings(settings['Practice Num']);
    [board, swap_rules, seed] = get_practice_board(board, settings['Practice Num'], spawn_rates, difficulty, seed);
  }

  swapping_board = [deepcopy(board), []];
  session_paused = [false, 0, 0];
  whites_burnt = 0;
  burns_in_chamber = 0;
  warning_played = false;
  cc_chain = 0;
  score = 0;
  burn_waiting = false;
  start_time = get_ticks();
  time_of_last_burn = 0;
  mouse_new_co = [];
  mouse_old_co = [];
  mouse_last_location = [false, [-100, -100], [-1, -1]];
  location_selected = [false, [-100, -100], [-1, -1]];
  burn_column = [false, false, get_ticks() - start_time, []];
  time_passed = get_ticks() - start_time - session_paused[2];
  columns_up = [0, { [-1]: 0, 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 }];
  settings['Furnace Interval'] = furnace_interval;
  settings['Spawn Rates'] = spawn_rates;
  settings.Difficulty = difficulty;
}

function handlePaste(target: 'Create' | 'Seeded', text: string): void {
  original_seed = is_paste_legal(text, seed);
  using_random_seed = original_seed[1] === '';
  if (target === 'Create') {
    is_create_seeded = true;
    if (board_active) start_procedure();
  }
}

function handleMouseDown(button: number, pos: [number, number]): void {
  mouse_pos = pos;
  if (740 <= mouse_pos[0] && mouse_pos[0] <= 800 && 540 <= mouse_pos[1] && mouse_pos[1] <= 600) {
    // Change volume level
    settings.Volume = settings.Volume === 3 ? 0 : settings.Volume + 1;
    sound_volumes(settings.Volume / 6);
  }
  if (585 <= mouse_pos[0] && mouse_pos[0] <= 605 && 18 <= mouse_pos[1] && mouse_pos[1] <= 38) {
    // Copy board
    play_sound('options_change');
    copyToClipboard(get_create_seed(board));
  }

  if (settings.Practice) {
    const practice_num = settings['Practice Num'];
    if (600 < mouse_pos[0] && mouse_pos[0] < 628 && 90 < mouse_pos[1] && mouse_pos[1] < 114) {
      // Change difficulty of Practice
      if ((button === 1 || button === 4) && practice_num[0] < 9) {
        practice_num[0] += 1;
        practice_num[1] = 0;
      } else if ((button === 3 || button === 5) && practice_num[0] > 0) {
        practice_num[0] -= 1;
        practice_num[1] = 0;
      }
    }
    if (630 < mouse_pos[0] && mouse_pos[0] < 658 && 90 < mouse_pos[1] && mouse_pos[1] < 114) {
      if ((button === 1 || button === 4) && practice_num[1] < Math.max(...practiceAvailable[practice_num[0]])) {
        practice_num[1] += 1;
      } else if ((button === 3 || button === 5) && practice_num[1] > 0) {
        practice_num[1] -= 1;
      }
    }
  }

  if (board_active && settings.Create) {
    if (20 < mouse_pos[0] && mouse_pos[0] < 245 && 90 < mouse_pos[1] && mouse_pos[1] < 130) {
      if (button === 1) {
        // Does nothing useful, remnant of old code
        create_piece = Math.floor((mouse_pos[0] - 20) / 45);
      } else if (button === 2) {
        // Change the entire board to the piece when middle clicked
        const furnace_height = board_length(board);
        let piece_code = Math.floor((mouse_pos[0] - 20) / 45);
        if (piece_code === 2) piece_code = 4;
        else if (piece_code === 4) piece_code = 2;
        board = range(10).map(() => range(9).map(() => piece_code));
        for (const d of range((furnace_height + 1) % 2, 10, 2)) board[d][8] = -1;
        swapping_board[0] = deepcopy(board);
        swap_rules = calc_swaps(board, board_length(board));
      }
    } else if (585 < mouse_pos[0] && mouse_pos[0] < 600 && 68 < mouse_pos[1] && mouse_pos[1] < 83) {
      // Copies a seed in Create mode
      play_sound('options_change');
      copyToClipboard(get_create_seed(board));
    } else if (605 < mouse_pos[0] && mouse_pos[0] < 620 && 68 < mouse_pos[1] && mouse_pos[1] < 83) {
      // Pastes a seed in Create mode
      play_sound('options_change');
      requestPaste('Create');
    } else if (625 < mouse_pos[0] && mouse_pos[0] < 640 && 68 < mouse_pos[1] && mouse_pos[1] < 83) {
      // Generates a seed in Create mode
      play_sound('options_change');
      is_create_seeded = false;
      start_procedure();
      copyToClipboard(get_create_seed(board));
    }
  }

  if (455 < mouse_pos[0] && mouse_pos[0] < 630 && 440 < mouse_pos[1] && mouse_pos[1] < 465) {
    board_active = !board_active;
    if (board_active) start_procedure();
    else session_paused[0] = false;
  }

  if (board_active && !session_paused[0] && !burn_column[0]) {
    if (button === 1) {
      if (25 < mouse_pos[0] && mouse_pos[0] < 425 && 157 < mouse_pos[1] && mouse_pos[1] < 517) {
        // A click has been made on the board
        const new_location_selected = cursor_location(board, mouse_pos[0], mouse_pos[1], location_selected);
        if (at(at(board, new_location_selected[2][0]), new_location_selected[2][1]) !== 3) {
          location_selected = new_location_selected;
          valid_swaps = get_valid_swaps(location_selected, board, swap_rules);
        }
      }
    } else if (button === 3) {
      // Player wants to burn a column
      if (!burn_column[0]) burn_waiting = true;
    } else if (settings.Create && 3 < button && button < 6) {
      if (25 < mouse_pos[0] && mouse_pos[0] < 425 && 157 < mouse_pos[1] && mouse_pos[1] < 517) {
        // Change piece using scroll wheel in create mode
        [board, swap_rules, swapping_board] = modify_piece(mouse_pos, board, swapping_board, 'Scroll', button, swap_rules);
      }
    }
  }

  if ((!board_active && !session_paused[0]) || settings.Create) {
    const inside = (x1: number, x2: number, y1: number, y2: number) =>
      x1 < mouse_pos[0] && mouse_pos[0] < x2 && y1 < mouse_pos[1] && mouse_pos[1] < y2;
    const rates = settings['Spawn Rates'];
    if (inside(610, 630, 180, 200)) {
      rates[0] = adjust_settings(rates[0], button, spawn_rates_default[0], 0, 999, 1); // Change black spawn rate
    } else if (inside(635, 655, 180, 200)) {
      rates[1] = adjust_settings(rates[1], button, spawn_rates_default[1], 0, 999, 1); // Change brown spawn rate
    } else if (inside(660, 680, 180, 200)) {
      rates[4] = adjust_settings(rates[4], button, spawn_rates_default[4], 0, 999, 1); // Change white spawn rate
    } else if (inside(685, 705, 180, 200)) {
      rates[3] = adjust_settings(rates[3], button, spawn_rates_default[3], 0, 999, 1); // Change spice spawn rate
    } else if (inside(710, 730, 180, 200)) {
      rates[2] = adjust_settings(rates[2], button, spawn_rates_default[2], 0, 999, 1); // Change burnt spawn rate
    } else if (inside(600, 660, 155, 175)) {
      settings.Difficulty = adjust_settings(settings.Difficulty, button, 50, 0, 100, 1);
    } else if (inside(600, 720, 130, 150)) {
      settings['Furnace Interval'] = adjust_settings(settings['Furnace Interval'], button, 15000, 1000, 120000, 500);
    } else if (inside(565, 580, 18, 35)) {
      settings = adjust_settings_mode(settings, 'Standard');
      settings['Furnace Interval'] = 15000;
      board_active = false;
      burn_duration = 1000;
    } else if (inside(565, 580, 43, 60)) {
      settings = adjust_settings_mode(settings, 'Seeded');
      settings['Furnace Interval'] = 15000;
      board_active = false;
      burn_duration = 1000;
    } else if (inside(565, 580, 68, 85)) {
      settings = adjust_settings_mode(settings, 'Create');
      is_create_seeded = false;
      settings['Furnace Interval'] = 15000000;
      burn_duration = 100;
    } else if (inside(565, 580, 93, 110)) {
      settings = adjust_settings_mode(settings, 'Practice');
      board_active = false;
      burn_duration = 1000;
    } else if (settings.Seeded) {
      if (inside(588, 603, 45, 60)) {
        // Copy seed in Seeded mode
        play_sound('options_change');
        let copy_seed = original_seed[0];
        if (original_seed[1] !== '') copy_seed += '7' + original_seed[1];
        copyToClipboard(copy_seed);
      }
      if (inside(608, 623, 45, 60)) {
        // Paste seed in Seeded mode
        play_sound('options_change');
        requestPaste('Seeded');
      }
      if (inside(628, 643, 45, 60)) {
        // Generate and copy a seed in Seeded mode
        play_sound('options_change');
        const generated = generate_seed();
        copyToClipboard(generated);
        original_seed = convert_seed(generated);
        using_random_seed = false;
      }
    }

    if (inside(455, 800, 180, 200) && button === 2) {
      // Middle click sets spawn to default
      const isDefault = settings['Spawn Rates'].every((v, i) => v === spawn_rates_default[i]);
      settings['Spawn Rates'] = isDefault ? [0, 0, 0, 0, 1] : [...spawn_rates_default];
    } else if (inside(455, 800, 155, 175) && button === 2) {
      // Middle click sets difficulty to default
      settings.Difficulty = 50;
    } else if (inside(455, 800, 130, 150) && button === 2) {
      // Middle click switches furnace interval between defaults
      settings['Furnace Interval'] = settings['Furnace Interval'] === 15000 ? 15000000 : 15000;
    }
  }
}

function handleKey(type: 'keydown' | 'keyup', key: number): void {
  if (settings.Create) {
    if (48 < key && key < 54) {
      if (type === 'keydown') paint_with = [true, key - 49];
      else if (paint_with[1] === key - 49) paint_with = [false, -1];
    }
  }
  if (board_active && type === 'keydown' && key === 27) {
    if (session_paused[0]) {
      session_paused[0] = false;
      session_paused[2] += time_passed - session_paused[1];
      time_passed = time_passed - session_paused[2];
    } else {
      session_paused = [true, time_passed, session_paused[2]];
    }
  }
}

function frame(events: InputEvent[]): void {
  current_mouse = ctx.input.mouse;
  gui.fill(black);
  gui.background_two(0, 0);
  time_passed = get_ticks() - start_time - session_paused[2];

  for (const event of [...events, ...pasted.splice(0)]) {
    if (event.type === 'mousedown') handleMouseDown(event.button, event.pos);
    else if (event.type === 'keydown' || event.type === 'keyup') {
      const key = keyCode(event.key);
      if (key !== null) handleKey(event.type, key);
    } else if (event.type === 'paste') handlePaste(event.target, event.text);

    if (board_active && event.type === 'mouseup' && event.button === 1) {
      location_selected[0] = false;
      for (const piece of swapping_board[1]) piece[5] = false;
    }
  }

  if (board_active && !session_paused[0]) {
    if (burn_column[0]) gui.display_burn_column(board, burn_column, time_passed, burn_duration);
    let moving_pieces;
    [swapping_board, moving_pieces] = calculate_moving(swapping_board, time_passed);
    gui.display_board(board, swapping_board[0], burn_column, time_passed, burn_duration);
    gui.display_moving_pieces(moving_pieces);
    gui.display_swaps(board, swapping_board[0], swap_rules, burn_column, time_passed, burn_duration);
    mouse_pos = current_mouse;

    if (25 < mouse_pos[0] && mouse_pos[0] < 425 && 157 < mouse_pos[1] && mouse_pos[1] < 517) {
      if (paint_with[0] && settings.Create) {
        [board, swap_rules, swapping_board] = modify_piece(mouse_pos, board, swapping_board, 'Number', paint_with[1], swap_rules);
      }
      let coords_to_check: number[][] = [];
      const mouse_new_location = cursor_location(board, mouse_pos[0], mouse_pos[1], mouse_last_location);

      if (mouse_new_co.length) mouse_old_co = deepcopy(mouse_new_co);
      mouse_new_co = [mouse_pos[0], mouse_pos[1]];
      if (mouse_old_co.length) {
        const mouse_change = [mouse_new_co[0] - mouse_old_co[0], mouse_new_co[1] - mouse_old_co[1]];
        coords_to_check = find_skipped_coordinatees(mouse_change, mouse_old_co, board);
      }

      if (location_selected[0] && !burn_column[0] && coords_to_check.length && !burn_waiting) {
        for (const potential_swap of coords_to_check) {
          mouse_last_location[1] = pixel_value_of_piece(potential_swap, board);
          const swap_with = swap_check(potential_swap, valid_swaps, location_selected, board);
          if (swap_with) {
            mouse_last_location[1] = pixel_value_of_piece(swap_with, board);
            [board, swap_rules, location_selected, swapping_board] = perform_swap(board, swap_with, location_selected, time_passed, swapping_board);
            valid_swaps = get_valid_swaps(location_selected, board, swap_rules);
          }
        }
      }
      if (!location_selected[0]) mouse_last_location = deepcopy(mouse_new_location);
      gui.display_cursor(mouse_last_location[1][0], mouse_last_location[1][1]);
    } else {
      mouse_new_co = [];
    }
    if (!burn_column[0]) {
      if (!warning_played) warning_played = check_for_burn_warning(time_passed, time_of_last_burn, settings['Furnace Interval']);
      if (check_for_burn(time_passed, time_of_last_burn, settings['Furnace Interval'])) burn_waiting = true;
      if (location_selected[0]) gui.display_selected(location_selected[1][0], location_selected[1][1], swapping_board[1]);
    }

    if (burn_waiting && swapping_board[1].length === 0) {
      // Initiates a burn if one is ready and no pieces are swapping.
      [board, location_selected, valid_swaps, swap_rules, burn_column, burns_in_chamber, whites_burnt, seed] = activate_furnace(
        board,
        location_selected,
        time_passed,
        burns_in_chamber,
        whites_burnt,
        settings,
        seed,
      );
      swapping_board = [deepcopy(board), []];
      [score, cc_chain, columns_up, session_over] = score_column(burn_column, cc_chain, score, columns_up);
      burn_waiting = false;
    } else if (burn_column[0]) {
      if (time_passed > burn_column[2] + burn_duration) {
        // If burn finished reset things
        burn_column[0] = false;
        time_of_last_burn = time_passed - burn_duration;
        warning_played = false;
        if (session_over && !settings.Create) board_active = false;
      }
    }
  }

  gui.background(0, 0);
  if (board_active) {
    if (session_paused[0]) {
      gui.display_furnace(time_passed, burn_column[2] - session_paused[1] + time_passed, settings['Furnace Interval']);
    } else {
      gui.display_furnace(time_passed, burn_column[2], settings['Furnace Interval']);
    }
  }
  gui.display_vial(score, columns_up);
  gui.display_texts(settings, score, cc_chain, columns_up, board_active, session_paused, practiceNames, practiceGroupNames);
  gui.display_checkboxes(settings);
  gui.volume_display(settings.Volume);
  if (settings.Create) gui.display_create(create_piece);
}

return { frame, dispose: () => sounds.dispose() };
}) satisfies PuzzleFactory;

