import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store, exportAll } from '../core/storage';
import { replayWrites, listReplayFiles } from '../core/replay-storage';
import type { ReplayRecorder } from '../core/replay';
import type { PuzzleContext, PuzzleFactory } from '../core/puzzle';

const captured = vi.hoisted(() => ({ recorders: [] as ReplayRecorder[] }));
vi.mock('../core/replay', async (original) => {
  const module = await original<typeof import('../core/replay')>();
  return { ...module, ReplayRecorder: class extends module.ReplayRecorder {
    constructor(...args: ConstructorParameters<typeof module.ReplayRecorder>) { super(...args); captured.recorders.push(this); }
  } };
});
vi.mock('../core/assets', async (original) => ({
  ...await original<typeof import('../core/assets')>(),
  Images: class { static async load() { return { get: () => ({ width: 450, height: 600 }) }; } },
}));
vi.mock('../core/fonts', () => ({ loadFont: async () => {} }));
vi.mock('../core/audio', () => ({ SoundBank: class { play() {} dispose() {} } }));

function canvasContext() {
  return new Proxy({
    measureText: (text: string) => ({ width: text.length * 8 }),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : () => {} });
}
function panelHarness() {
  const buttons = new Map<string, () => void>();
  const setters = new Map<string, (value: number) => void>();
  const tables: Array<() => unknown> = [];
  const results: Array<() => unknown> = [];
  const buttonStates = new Map<string, { disabled?: () => boolean; label?: () => string }>();
  const group = (page: string, title = ''): any => new Proxy({}, { get: (_target, method) => {
    if (method === 'group') return (name: string) => group(page, name);
    if (method === 'button') return (name: string, action: () => void, options: { disabled?: () => boolean; label?: () => string } = {}) => {
      // The real panel evaluates button state immediately, before the factory finishes.
      options.disabled?.();
      options.label?.();
      buttons.set(page + ':' + title + ':' + name, action);
      buttonStates.set(page + ':' + title + ':' + name, options);
      return group(page, title);
    };
    if (method === 'number') return (name: string, _get: unknown, set: (value: number) => void) => { setters.set(page + ':' + title + ':' + name, set); return group(page, title); };
    if (method === 'stats') return (_header: unknown, get: () => unknown) => { tables.push(get); return group(page, title); };
    return () => group(page, title);
  } });
  const panel = new Proxy({}, { get: (_target, method) => {
    if (method === 'group') return (title = '') => group('Play', title);
    if (method === 'settings') return group('Settings');
    if (method === 'tab') return (page: string) => group(page);
    if (method === 'results') return (get: () => unknown) => { results.push(get); };
    return () => group('Play');
  } });
  return { panel, buttons, setters, buttonStates, stats: () => tables.map((get) => get()), results: () => results.map((get) => get()) };
}

beforeEach(async () => {
  await replayWrites.idle();
  captured.recorders = [];
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal('navigator', { storage: {} });
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  vi.stubGlobal('document', { createTextNode: (text: string) => ({ textContent: text }), createElement: () => ({
    width: 450, height: 600, getContext: canvasContext,
    style: {}, setAttribute() {}, addEventListener() {}, replaceChildren() {}, append() {},
  }) });
});

describe('Distilling session dismissal', () => {
  it.each(['button', 'navigation'] as const)('completes a full-jug Crystal Clear streak through %s without scoring another column', async (ending) => {
    const store = new Store('distilling');
    store.set('mode', 'Seeded');
    store.set('timerOn', false);
    store.set('spawnRates', [0, 0, 0, 0, 1]);
    vi.stubGlobal('navigator', { storage: {}, clipboard: { readText: async () => '8' + '4'.repeat(85) } });
    const { panel, buttons, buttonStates, stats, results } = panelHarness();
    let now = 0;
    const screen = new Proxy({ ctx: canvasContext() }, { get: (target, key) => key === 'ctx' ? target.ctx : () => ({ width: 0, height: 0 }) });
    const context = { screen, input: { mouse: [-1, -1] }, panel, store, ticks: () => now,
      setReplayTime: (time: number | null) => { if (time !== null) now = time; } } as unknown as PuzzleContext;
    const factory = (await import('./distilling/index')).default;
    const instance = await factory(context);
    buttons.get('Play:Seed:Paste')!();
    await new Promise((resolve) => setTimeout(resolve, 0));
    buttons.get('Play::Start')!();
    for (let column = 0; column < 12; column++) {
      now = column * 2000;
      instance.frame([{ type: 'keydown', key: 'x' }]);
      now += 1500;
      instance.frame([]);
    }
    // A Crystal Clear streak can continue beyond a full jug; dismissal should bank its score.
    expect(buttonStates.get('Play::Start')!.label!()).toBe('Dismiss');
    const scoreBefore = stats()[0];
    buttons.get('Play::Pause')!();
    if (ending === 'button') buttons.get('Play::Start')!();
    else instance.dispose?.();
    expect(buttonStates.get('Play::Start')!.label!()).toBe('Start');
    expect(buttonStates.get('Play::Pause')!.label!()).toBe('Pause');
    const result = results()[0] as { rows: string[][] };
    expect(result.rows.find(([name]) => name === 'Columns distilled')![1]).toBe('12');
    expect(result.rows.find(([name]) => name === 'Columns burnt')![1]).toBe('0');
    expect(result.rows[0]).toEqual((scoreBefore as string[][])[0]);
    await replayWrites.idle();
    const data = JSON.parse(exportAll()).data;
    const histories = Object.entries(data).filter(([key]) => key.includes(':history:'));
    expect(histories).toHaveLength(1);
    expect(histories[0][1]).toHaveLength(1);
    const [replay] = await listReplayFiles('distilling');
    expect(replay).toBeDefined();
    if (ending === 'button') {
      const perf = vi.spyOn(performance, 'now').mockReturnValue(0);
      expect(await captured.recorders[0].playAt(replay.at, replay.runId)).toBe(true);
      perf.mockReturnValue(replay.duration);
      instance.frame([]);
      expect(results()[0]).toEqual(result);
      expect(JSON.parse(exportAll()).data).toEqual(data);
      buttons.get('History:Replays:Stop')!();
      instance.dispose?.();
      expect(JSON.parse(exportAll()).data).toEqual(data);
    }
    expect(await listReplayFiles('distilling')).toHaveLength(1);
  });
});
afterEach(async () => {
  await replayWrites.idle();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('puzzle completion during replay', () => {
  it.each([
    ['blacksmithing', 500, 20, { mode: 'perfect', perfectTimer: 100 }],
    ['treasure-haul', 62000, 100, { round: 30 }],
    ['distilling', 30000, 20, { timerOn: true, timerSeconds: 0.01 }],
    ['vampire-carp', 121000, 1000, {}],
    ['forage', 12000, 20, { settings: { mode: 'ci', roundSeconds: 5 } }],
  ] as const)('%s keeps player history unchanged through playback, seeking and Stop', async (puzzle, end, step, settings) => {
    const store = new Store(puzzle);
    if (puzzle === 'forage') vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    for (const [key, value] of Object.entries(settings)) store.set(key, value);
    const { panel, buttons, setters, stats, results } = panelHarness();
    let now = 0;
    const screen = new Proxy({ ctx: canvasContext() }, { get: (target, key) => key === 'ctx' ? target.ctx : () => ({ width: 0, height: 0 }) });
    const input = { mouse: [-1, -1] };
    const context = { screen, input, panel, store, ticks: () => now,
      setReplayTime: (time: number | null) => { if (time !== null) now = time; } } as unknown as PuzzleContext;
    const factory = (await import('./' + puzzle + '/index')).default as PuzzleFactory;
    const instance = await factory(context);
    const recorder = captured.recorders[0];
    buttons.get('Play::Start')!();
    for (now = 0; now <= end; now += step) {
      if (puzzle === 'forage' && now >= 2000 && now <= 8000) {
        const index = Math.floor(now / step) % 54;
        instance.frame([{ type: 'mousedown', button: 1, pos: [67 + (index % 6) * 45 + 10, 50 + Math.floor(index / 6) * 45 + 10] }]);
      } else instance.frame([]);
    }
    await replayWrites.idle();
    const data = JSON.parse(exportAll()).data as Record<string, unknown>;
    const expectedStats = stats();
    const histories = Object.entries(data).filter(([key]) => key.includes(':history:'));
    expect(histories).toHaveLength(1);
    expect(histories[0][1]).toHaveLength(1);
    const replay = (await listReplayFiles(puzzle))[0];
    expect(replay).toBeDefined();
    const perf = vi.spyOn(performance, 'now').mockReturnValue(0);
    expect(await recorder.playAt(replay.at, replay.runId)).toBe(true);
    perf.mockReturnValue(replay.duration);
    instance.frame([]);
    expect(stats()).toEqual(expectedStats);
    if (puzzle === 'distilling') expect(results()[0]).not.toBeNull();
    expect(JSON.parse(exportAll()).data).toEqual(data);
    setters.get('History:Replays:Jump to (s)')!(replay.duration / 1000);
    buttons.get('History:Replays:Jump')!();
    await vi.waitFor(() => expect(recorder.isSeeking).toBe(false));
    // Allow lazy loading/restoration to complete before testing Stop.
    await new Promise((resolve) => setTimeout(resolve, 0));
    buttons.get('History:Replays:Stop')!();
    expect(JSON.parse(exportAll()).data).toEqual(data);
    expect(await listReplayFiles(puzzle)).toHaveLength(1);
    instance.dispose?.();
  });
});
