// Port of the main loop in Distilling_Sim.pyw. The shell queues browser input and hands it
// over once per frame, in the same order pygame's event loop handled it.
import { SoundBank } from '../../core/audio';
import { copyText, pasteText } from '../../core/clipboard';
import type { InputEvent } from '../../core/input';
import type { PuzzleFactory } from '../../core/puzzle';
import { loadAssets } from './assets';
import {
  activate_furnace,
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
  type Mode,
  type Seed,
  type Settings,
  type SwappingBoard,
  type SwapRules,
} from './game';
import { practiceAvailable, practiceGroupNames, practiceNames } from './practice';
import { at, deepcopy, floatStr, pyRound, range } from '../../core/py';
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
    }
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
}

function handleKey(type: 'keydown' | 'keyup', key: number): void {
  if (settings.Create) {
    if (48 < key && key < 54) {
      if (type === 'keydown') paint_with = [true, key - 49];
      else if (paint_with[1] === key - 49) paint_with = [false, -1];
    }
  }
  if (board_active && type === 'keydown' && key === 27) toggle_pause();
}

function toggle_pause(): void {
  if (session_paused[0]) {
    session_paused[0] = false;
    session_paused[2] += time_passed - session_paused[1];
    time_passed = time_passed - session_paused[2];
  } else {
    session_paused = [true, time_passed, session_paused[2]];
  }
}

// ---- Panel ----
// The settings column gui.py drew right of the board, with the same rules for when each part
// could be changed.

const modes: { value: Mode; label: string }[] = [
  { value: 'Standard', label: 'Standard' },
  { value: 'Seeded', label: 'Seeded' },
  { value: 'Create', label: 'Create' },
  { value: 'Practice', label: 'Practice' },
];
const current_mode = (): Mode => modes.find((m) => settings[m.value])!.value;
// Spawn rates are listed in the order gui.py drew them, not their order in settings.
const spawn_columns: [number, string][] = [
  [0, 'Black'],
  [1, 'Brown'],
  [4, 'White'],
  [3, 'Spice'],
  [2, 'Burnt'],
];
const timerless = 15000000;
/** The settings column only took clicks while stopped, or at any time in Create mode. */
const settings_locked = () => !((!board_active && !session_paused[0]) || settings.Create);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function set_mode(mode: Mode): void {
  if (settings[mode]) return;
  settings = adjust_settings_mode(settings, mode);
  if (mode === 'Create') {
    is_create_seeded = false;
    settings['Furnace Interval'] = timerless;
    burn_duration = 100;
    return;
  }
  if (mode !== 'Practice') settings['Furnace Interval'] = 15000;
  board_active = false;
  burn_duration = 1000;
}

function toggle_running(): void {
  board_active = !board_active;
  if (board_active) start_procedure();
  else session_paused[0] = false;
}

const game_group = ctx.panel.group('Game');
game_group.select('Mode', modes, current_mode, set_mode, { disabled: settings_locked });
game_group.number(
  'Practice group',
  () => settings['Practice Num'][0],
  (n) => {
    const practice_num = settings['Practice Num'];
    if (n !== practice_num[0]) {
      practice_num[0] = n;
      practice_num[1] = 0;
    }
  },
  { min: 0, max: 9, hidden: () => !settings.Practice },
);
game_group.number(
  'Practice board',
  () => settings['Practice Num'][1],
  (n) => {
    const practice_num = settings['Practice Num'];
    practice_num[1] = clamp(n, 0, Math.max(...practiceAvailable[practice_num[0]]));
  },
  { min: 0, hidden: () => !settings.Practice },
);
game_group.note(() => {
  if (!settings.Practice) return '';
  const [group, num] = settings['Practice Num'];
  return `${practiceGroupNames[group]} ${practiceNames[group][num]}`;
});

// Start and the score sit near the top, since the settings below run past the canvas.
ctx.panel
  .group()
  .button('Start', toggle_running, { variant: 'primary', label: () => (board_active ? 'Stop' : 'Start') })
  .button('Pause', toggle_pause, { disabled: () => !board_active, label: () => (session_paused[0] ? 'Resume' : 'Pause'), title: 'Esc' });

ctx.panel.group('Score').stats([], () => [
  ['Score', floatStr(pyRound(score / Math.max(columns_up[0], 1), 2))],
  ['Chain', String(cc_chain)],
]);

const board_group = ctx.panel.group('Settings');
board_group.toggle(
  'Burn timer',
  () => settings['Furnace Interval'] !== timerless,
  (on) => (settings['Furnace Interval'] = on ? 15000 : timerless),
  { disabled: settings_locked },
);
board_group.number(
  'Burn timer (s)',
  () => settings['Furnace Interval'] / 1000,
  (seconds) => (settings['Furnace Interval'] = clamp(Math.round(seconds * 2) * 500, 1000, 120000)),
  { min: 1, max: 120, step: 0.5, disabled: settings_locked, hidden: () => settings['Furnace Interval'] === timerless },
);
board_group.number('Difficulty', () => settings.Difficulty, (n) => (settings.Difficulty = Math.round(n)), {
  min: 0,
  max: 100,
  disabled: settings_locked,
});

const spawn_group = ctx.panel.group('Spawn rates', { columns: 5 });
for (const [index, label] of spawn_columns) {
  spawn_group.number(label, () => settings['Spawn Rates'][index], (n) => (settings['Spawn Rates'][index] = Math.round(n)), {
    min: 0,
    max: 999,
    disabled: settings_locked,
  });
}
const default_spawn_rates = () => settings['Spawn Rates'].every((v, i) => v === spawn_rates_default[i]);
spawn_group.button(
  'Defaults',
  () => (settings['Spawn Rates'] = default_spawn_rates() ? [0, 0, 0, 0, 1] : [...spawn_rates_default]),
  {
    label: () => (default_spawn_rates() ? 'Whites only' : 'Defaults'),
    disabled: settings_locked,
    title: 'Switch between the default spawn rates and a board of only whites',
  },
);

// The board's seed can be copied in any mode, and pasted or dealt anew while playing in Create.
const create_seed_group = ctx.panel.group('Board');
create_seed_group.button('Copy', () => {
  play_sound('options_change');
  copyToClipboard(get_create_seed(board));
}, { title: "Copy the board's seed" });
create_seed_group.button(
  'Paste',
  () => {
    play_sound('options_change');
    requestPaste('Create');
  },
  { hidden: () => !settings.Create, disabled: () => !board_active, title: 'Play a board from a pasted seed' },
);
create_seed_group.button(
  'Generate',
  () => {
    // Generates a seed in Create mode
    play_sound('options_change');
    is_create_seeded = false;
    start_procedure();
    copyToClipboard(get_create_seed(board));
  },
  { hidden: () => !settings.Create, disabled: () => !board_active, title: 'Deal a new board and copy its seed' },
);

const seed_group = ctx.panel.group('Seed', { hidden: () => !settings.Seeded });
seed_group.button(
  'Copy',
  () => {
    play_sound('options_change');
    let copy_seed = original_seed[0];
    if (original_seed[1] !== '') copy_seed += '7' + original_seed[1];
    copyToClipboard(copy_seed);
  },
  { disabled: settings_locked, title: 'Copy the seed of the last start' },
);
seed_group.button(
  'Paste',
  () => {
    play_sound('options_change');
    requestPaste('Seeded');
  },
  { disabled: settings_locked, title: 'Use a pasted seed for the next start' },
);
seed_group.button(
  'New',
  () => {
    // Generate and copy a seed in Seeded mode
    play_sound('options_change');
    const generated = generate_seed();
    copyToClipboard(generated);
    original_seed = convert_seed(generated);
    using_random_seed = false;
  },
  { disabled: settings_locked, title: 'Make a new seed, copy it and use it for the next start' },
);

const volumes = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'High' },
];
ctx.panel.group('Sound').select('Volume', volumes, () => settings.Volume, (volume) => {
  settings.Volume = volume;
  sound_volumes(settings.Volume / 6);
});

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
  if (settings.Create) gui.display_create(create_piece);
}

return { frame, dispose: () => sounds.dispose() };
}) satisfies PuzzleFactory;

