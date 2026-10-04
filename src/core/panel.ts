// The panel beside a puzzle's canvas: real HTML controls instead of controls drawn on the canvas.
// A puzzle builds it once from `ctx.panel`, binding each control to a getter and a setter; the
// host calls `sync()` after every frame, so controls follow the game's state (values, disabled,
// hidden) without the puzzle pushing updates.
//
// Play, Settings and History are always available, followed by mode, clock and main score.
//
//   Shared    tabs, session choices (Mode), clock, then main score.
//   Play      Start / Stop and any other controls that matter during a game.
//   Settings  everything chosen before a game: the rest of the game's options, then Look and
//             Sound last.
//
//   panel.clock(() => (timed ? { label: 'Time left', ms: left, countdown: true } : null));
//   const session = panel.session();
//   session.select('Mode', MODES, () => settings.mode, (m) => (settings.mode = m), { disabled: () => running });
//   session.note(() => `Difficulty ${settings.difficulty}`);
//   session.button('Start', start, { variant: 'primary', label: () => (running ? 'Stop' : 'Start') });
//   panel.score().stats(['', 'Now', 'Best'], () => [['Moves', String(moves), String(best)]]);
//   panel.settings.group('Game').toggle('Ants', () => settings.ants, (on) => (settings.ants = on), { disabled: () => running });

import { getVolume, setVolume } from './audio';
import { keyFor, keyLabel, resetKeys, setKey, type KeyBinding } from './controls';
import { Store } from './storage';

type Get<T> = () => T;

export interface Option<T> {
  value: T;
  label: string;
}

export interface GroupOptions extends ControlOptions {
  /** Lays the group's fields out in this many columns, labels above, for runs of short boxes. */
  columns?: number;
}

export interface ControlOptions {
  /** Greys the control out and ignores it while true. */
  disabled?: Get<boolean>;
  /** Hides the control while true. */
  hidden?: Get<boolean>;
  /** Tooltip. */
  title?: string;
}

export interface ButtonOptions extends ControlOptions {
  variant?: 'primary' | 'secondary';
  /** A label that changes with the game, e.g. Start / Stop. */
  label?: Get<string>;
}

export interface NumberOptions extends ControlOptions {
  min?: number;
  max?: number;
  step?: number;
}
export interface RangeOptions extends NumberOptions {
  maxValue?: Get<number>;
}

export interface TextOptions extends ControlOptions {
  placeholder?: string;
  /** Hint for on-screen keyboards, e.g. 'numeric'. */
  inputMode?: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export interface ClockReading {
  /** What the time means, e.g. 'Time' or 'Time left'. */
  label: string;
  ms: number;
  /** A count down, shown as m:ss; otherwise a stopwatch, shown to the hundredth. */
  countdown?: boolean;
  /** A record to beat, in the same format. */
  best?: number | null;
  /** Shows the time in red, e.g. the last ten seconds. */
  warn?: boolean;
}

/** The clock's text: m:ss counting down, seconds to the hundredth (m:ss.cc past a minute) counting up. */
export function formatClock(ms: number, countdown = false): string {
  if (!Number.isFinite(ms) || ms >= 3_600_000) return '-';
  ms = Math.max(0, ms);
  if (countdown) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  const cs = Math.floor(ms / 10);
  const secs = ((cs % 6000) / 100).toFixed(2);
  return cs < 6000 ? secs : `${Math.floor(cs / 6000)}:${secs.padStart(5, '0')}`;
}

/** One tab's column of cards. */
export class Page {
  constructor(
    private readonly panel: Panel,
    readonly element: HTMLElement,
  ) {}

  /** A card of related controls, with an optional heading. */
  group(title?: string, options: GroupOptions = {}): Group {
    const card = el('section', 'panel-group');
    if (title) card.append(el('h2', 'panel-title', title));
    if (options.columns) {
      card.classList.add('is-columns');
      card.style.setProperty('--columns', String(options.columns));
    }
    this.element.append(card);
    this.panel.watch(card, options);
    return new Group(this.panel, card);
  }
}

export class Panel {
  private readonly syncers: Array<() => void> = [];
  private readonly tabs = el('nav', 'panel-tabs');
  private readonly pages: Array<{ name: string; tab: HTMLButtonElement; page: Page }> = [];
  private readonly clockCard = el('section', 'panel-group panel-clock');
  /** Where the canvas should get focus back after a control is used, so keys reach the game. */
  onUsed: () => void = () => {};
  /** Play controls beneath the shared mode, clock and score. `panel.group()` adds here. */
  readonly play: Page;
  /** What's chosen before a game. */
  readonly settings: Page;
  private readonly preferences = new Store('global');
  private hideTimer = this.preferences.get<boolean>('hideTimer', false);
  private readonly live: Page;
  private readonly sessionPage: Page;
  private readonly sessionElement: HTMLElement;
  private readonly liveElement: HTMLElement;

  constructor(readonly root: HTMLElement, private readonly canvas?: HTMLCanvasElement) {
    this.tabs.setAttribute('role', 'tablist');
    root.append(this.tabs);
    this.play = this.tab('Play');
    this.settings = this.tab('Settings');
    this.tab('History');
    this.clockCard.hidden = true;
    const session = el('div', 'panel-page panel-session');
    const live = el('div', 'panel-page panel-live');
    this.tabs.after(session, live);
    this.sessionElement = session;
    this.liveElement = live;
    this.sessionPage = new Page(this, session);
    this.live = new Page(this, live);
    live.append(this.clockCard);
    this.settings.group('Display').toggle('Hide timer', () => this.hideTimer, (on) => {
      this.hideTimer = on;
      this.preferences.set('hideTimer', on);
    });
    this.settings.group('Sound').range('Volume', getVolume, setVolume, { min: 0, max: 100 });
    this.show(this.pages[0].name);
  }

  /** The page for a tab, made the first time it's asked for; tabs sit in the order they're made. */
  tab(name: string): Page {
    const existing = this.pages.find((p) => p.name === name);
    if (existing) return existing.page;
    const tab = el('button', 'panel-tab', name);
    tab.type = 'button';
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => {
      this.show(name);
      this.used();
    });
    this.tabs.append(tab);
    const element = el('div', 'panel-page');
    element.setAttribute('role', 'tabpanel');
    this.root.append(element);
    const page = new Page(this, element);
    this.pages.push({ name, tab, page });
    if (this.pages.length > 1) element.hidden = true;
    return page;
  }

  /** Switches to a tab, e.g. back to Play when a game starts. */
  show(name: string): void {
    for (const p of this.pages) {
      const on = p.name === name;
      p.page.element.hidden = !on;
      p.tab.classList.toggle('is-active', on);
      p.tab.setAttribute('aria-selected', String(on));
    }
    const settingsOpen = name === 'Settings';
    this.sessionElement.hidden = settingsOpen;
    this.liveElement.hidden = settingsOpen;
    this.sync();
  }

  /** Adds this puzzle's editable keyboard bindings to its Settings tab. */
  controls(puzzle: string, bindings: readonly KeyBinding[]): void {
    const group = this.settings.group('Controls');
    for (const binding of bindings) {
      group.text(binding.label, () => keyLabel(keyFor(puzzle, binding.id, binding.defaultKey)), (value) => {
        setKey(puzzle, binding.id, value);
      }, { placeholder: binding.defaultKey, title: `Default: ${binding.defaultKey}` });
    }
    group.button('Restore defaults', () => resetKeys(puzzle));
  }

  /** A card of related controls on the Play tab, with an optional heading. */
  group(title?: string, options: GroupOptions = {}): Group {
    return this.play.group(title, options);
  }

  /** Session controls follow the tabs and precede the timer and main score. */
  session(title?: string, options: GroupOptions = {}): Group {
    return this.sessionPage.group(title, options);
  }

  /** The main score stays visible when browsing Settings or History. */
  score(title = 'Score', options: GroupOptions = {}): Group {
    return this.live.group(title, options);
  }

  /** Compact, accessible results in the main board area. */
  results(get: Get<{ title?: string; rows: readonly (readonly string[])[] } | null>): void {
    if (!this.canvas?.parentElement) return;
    const overlay = el('section', 'game-results');
    overlay.setAttribute('aria-label', 'Session results');
    const heading = el('h2', '', 'Session results');
    const content = el('div', 'results-content');
    overlay.append(heading, content);
    this.canvas.parentElement.append(overlay);
    overlay.hidden = true;
    new Group(this, content).stats([], () => get()?.rows ?? []);
    this.addSync(() => {
      const result = get();
      overlay.hidden = !result;
      heading.textContent = result?.title ?? 'Session results';
    });
  }

  /**
   * The clock below session controls. Null readings and Hide timer hide the card.
   */
  clock(get: Get<ClockReading | null>): void {
    const label = el('span', 'panel-clock-label');
    const time = el('span', 'panel-clock-time');
    const best = el('span', 'panel-clock-best');
    this.clockCard.replaceChildren(label, time, best);
    this.clockCard.hidden = false;
    this.addSync(() => {
      const reading = get();
      this.clockCard.hidden = this.hideTimer || !reading;
      const labelText = reading?.label ?? 'Time';
      const timeText = reading ? formatClock(reading.ms, reading.countdown) : 'Not timed';
      const bestText = reading?.best != null ? `Best ${formatClock(reading.best, reading.countdown)}` : '';
      if (label.textContent !== labelText) label.textContent = labelText;
      if (time.textContent !== timeText) time.textContent = timeText;
      if (best.textContent !== bestText) best.textContent = bestText;
      time.classList.toggle('is-off', !reading);
      time.classList.toggle('is-warn', !!reading?.warn);
    });
  }

  /** Brings every control in line with the game's state. Cheap when nothing changed. */
  sync(): void {
    for (const sync of this.syncers) sync();
  }

  /** @internal */
  addSync(sync: () => void): void {
    this.syncers.push(sync);
    sync();
  }

  /** @internal Applies the disabled / hidden / title options to a control's element. */
  watch(node: HTMLElement, options: ControlOptions, input?: HTMLInputElement | HTMLSelectElement | HTMLButtonElement): void {
    if (options.title) node.title = options.title;
    const { disabled, hidden } = options;
    if (!disabled && !hidden) return;
    this.addSync(() => {
      if (hidden) {
        const hide = hidden();
        if (node.hidden !== hide) node.hidden = hide;
      }
      if (disabled) {
        const off = disabled();
        node.classList.toggle('is-disabled', off);
        if (input && input.disabled !== off) input.disabled = off;
      }
    });
  }

  /** @internal */
  used(): void {
    this.sync();
    this.onUsed();
  }
}

export class Group {
  constructor(
    private readonly panel: Panel,
    readonly element: HTMLElement,
  ) {}

  private field(label: string, control: HTMLElement, options: ControlOptions, input?: HTMLInputElement | HTMLSelectElement): HTMLElement {
    const row = el('label', 'panel-field');
    row.append(el('span', 'panel-label', label), control);
    this.element.append(row);
    this.panel.watch(row, options, input);
    return row;
  }

  /** A dropdown of exclusive choices. */
  select<T extends string | number>(label: string, options: readonly Option<T>[], get: Get<T>, set: (value: T) => void, opts: ControlOptions = {}): this {
    const select = el('select', 'panel-select');
    for (const [i, option] of options.entries()) {
      const node = el('option', '', option.label);
      node.value = String(i);
      select.append(node);
    }
    select.addEventListener('change', () => {
      set(options[Number(select.value)].value);
      this.panel.used();
    });
    this.field(label, select, opts, select);
    this.panel.addSync(() => {
      const index = String(options.findIndex((o) => o.value === get()));
      if (select.value !== index) select.value = index;
    });
    return this;
  }

  /** An on/off switch. Consecutive toggles in a group flow into columns. */
  toggle(label: string, get: Get<boolean>, set: (on: boolean) => void, opts: ControlOptions = {}): this {
    const input = el('input', 'panel-switch');
    input.type = 'checkbox';
    input.addEventListener('change', () => {
      set(input.checked);
      this.panel.used();
    });
    const row = el('label', 'panel-toggle');
    row.append(input, el('span', '', label));
    this.toggleGrid().append(row);
    this.panel.watch(row, opts, input);
    this.panel.addSync(() => {
      const on = get();
      if (input.checked !== on) input.checked = on;
    });
    return this;
  }

  private toggleGrid(): HTMLElement {
    const last = this.element.lastElementChild;
    if (last?.classList.contains('panel-toggles')) return last as HTMLElement;
    const grid = el('div', 'panel-toggles');
    this.element.append(grid);
    return grid;
  }

  /** A number box; the value is set when it's committed (Enter or leaving the box). */
  range(label: string, get: Get<number>, set: (value: number) => void, opts: RangeOptions = {}): this {
    const input = el('input', 'panel-range');
    input.type = 'range';
    input.min = String(opts.min ?? 0);
    input.max = String(opts.max ?? 100);
    input.step = String(opts.step ?? 1);
    const output = el('output');
    const control = el('div', 'panel-range-control');
    control.append(input, output);
    input.addEventListener('input', () => {
      set(Number(input.value));
      this.panel.sync();
    });
    input.addEventListener('change', () => this.panel.used());
    this.field(label, control, opts, input);
    this.panel.addSync(() => {
      if (opts.maxValue) input.max = String(opts.maxValue());
      const value = String(get());
      input.value = value;
      output.textContent = value;
    });
    return this;
  }

  number(label: string, get: Get<number>, set: (value: number) => void, opts: NumberOptions = {}): this {
    const input = el('input', 'panel-input');
    input.type = 'number';
    input.inputMode = 'numeric';
    if (opts.min !== undefined) input.min = String(opts.min);
    if (opts.max !== undefined) input.max = String(opts.max);
    input.step = String(opts.step ?? 1);
    input.addEventListener('change', () => {
      let value = Number(input.value);
      if (input.value === '' || Number.isNaN(value)) value = get();
      if (opts.min !== undefined) value = Math.max(opts.min, value);
      if (opts.max !== undefined) value = Math.min(opts.max, value);
      set(value);
      input.value = String(get());
      this.panel.used();
    });
    enterCommits(input);
    this.field(label, input, opts, input);
    this.panel.addSync(() => {
      const value = String(get());
      if (document.activeElement !== input && input.value !== value) input.value = value;
    });
    return this;
  }

  /** A text box; the value is set when it's committed (Enter or leaving the box). */
  text(label: string, get: Get<string>, set: (value: string) => void, opts: TextOptions = {}): this {
    const input = el('input', 'panel-input');
    input.type = 'text';
    input.spellcheck = false;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.inputMode) input.inputMode = opts.inputMode;
    input.addEventListener('change', () => {
      set(input.value);
      input.value = get();
      this.panel.used();
    });
    enterCommits(input);
    this.field(label, input, opts, input);
    this.panel.addSync(() => {
      const value = get();
      if (document.activeElement !== input && input.value !== value) input.value = value;
    });
    return this;
  }

  /** A button. Consecutive buttons in a group sit side by side. */
  button(label: string, onClick: () => void, opts: ButtonOptions = {}): this {
    const button = el('button', `panel-button ${opts.variant === 'primary' ? 'is-primary' : ''}`, label);
    button.type = 'button';
    button.addEventListener('click', () => {
      onClick();
      this.panel.used();
    });
    const last = this.element.lastElementChild;
    const row = last?.classList.contains('panel-buttons') ? (last as HTMLElement) : el('div', 'panel-buttons');
    row.append(button);
    this.element.append(row);
    this.panel.watch(button, opts, button);
    if (opts.label) {
      const get = opts.label;
      this.panel.addSync(() => {
        const text = get();
        if (button.textContent !== text) button.textContent = text;
      });
    }
    return this;
  }

  /**
   * A small table, e.g. Now / Best per stat. `rows` returns [label, ...cells];
   * the first header cell sits over the labels and is usually ''.
   */
  stats(header: readonly string[], rows: Get<readonly (readonly string[])[]>, opts: ControlOptions = {}): this {
    const table = el('table', 'panel-stats');
    if (header.some(Boolean)) {
      const head = el('tr');
      for (const cell of header) head.append(el('th', '', cell));
      table.append(el('thead'));
      table.tHead!.append(head);
    }
    const body = el('tbody');
    table.append(body);
    this.element.append(table);
    this.panel.watch(table, opts);
    let last = '';
    this.panel.addSync(() => {
      const data = rows();
      const key = JSON.stringify(data);
      if (key === last) return;
      last = key;
      body.replaceChildren(
        ...data.map((row) => {
          const tr = el('tr');
          row.forEach((cell, i) => tr.append(el(i === 0 ? 'th' : 'td', '', cell)));
          return tr;
        }),
      );
    });
    return this;
  }

  /** A line of text that follows the game, e.g. a hint or a result. */
  note(get: Get<string>, opts: ControlOptions = {}): this {
    const p = el('p', 'panel-note');
    this.element.append(p);
    this.panel.watch(p, opts);
    this.panel.addSync(() => {
      const text = get();
      if (p.textContent !== text) p.textContent = text;
      p.hidden = !text || (opts.hidden?.() ?? false);
    });
    return this;
  }

  /** Any other element, for controls the kit doesn't cover. */
  append(node: HTMLElement, opts: ControlOptions = {}): this {
    this.element.append(node);
    this.panel.watch(node, opts);
    return this;
  }
}

/** Enter commits a text or number box the way leaving it does. */
function enterCommits(input: HTMLInputElement): void {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') input.blur();
  });
}

/** True for elements that take typing, whose keys the game shouldn't see. */
export function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement;
}
