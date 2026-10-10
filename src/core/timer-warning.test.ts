import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Store } from './storage';
import { getWarningTimer, setWarningTimer } from './audio';
import { TimerWarning } from './timer-warning';

const played = vi.hoisted(() => vi.fn());
vi.mock('./audio', async (original) => ({
  ...await original<typeof import('./audio')>(),
  SoundBank: class {
    constructor(_urls: unknown, private readonly muted: () => boolean) {}
    play(name: string) { if (!this.muted()) played(name); }
    dispose() {}
  },
}));

beforeEach(() => {
  played.mockClear();
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('warning timer', () => {
  it('defaults on and persists the global preference', () => {
    expect(getWarningTimer()).toBe(true);
    setWarningTimer(false);
    expect(new Store('global').get('warningTimer', true)).toBe(false);
    expect(getWarningTimer()).toBe(false);
    setWarningTimer(true);
    expect(getWarningTimer()).toBe(true);
  });

  it.each([
    ['gauntlet', 30000, 'cultist_attack'],
    ['vampirate', 15000, 'vampire_warning'],
  ] as const)('plays %s once at its threshold and resets for the next session', (style, threshold, sound) => {
    const warning = new TimerWarning(style, () => false);
    warning.update(null);
    warning.update(threshold + 1);
    expect(played).not.toHaveBeenCalled();
    warning.update(threshold);
    warning.update(threshold - 1);
    warning.update(0);
    expect(played.mock.calls).toEqual([[sound]]);
    warning.reset();
    warning.update(threshold - 1000);
    expect(played.mock.calls).toEqual([[sound], [sound]]);
    warning.dispose();
  });

  it('does not replay a disabled warning when the option is enabled afterward', () => {
    const warning = new TimerWarning('gauntlet', () => false);
    setWarningTimer(false);
    warning.update(25000);
    setWarningTimer(true);
    warning.update(20000);
    expect(played).not.toHaveBeenCalled();
    warning.reset();
    warning.update(25000);
    expect(played).toHaveBeenCalledOnce();
    warning.dispose();
  });

  it('consumes warnings silently during seeking and skips expired sessions', () => {
    let seeking = true;
    const warning = new TimerWarning('vampirate', () => seeking);
    warning.update(14000);
    seeking = false;
    warning.update(13000);
    warning.reset();
    warning.update(-100);
    expect(played).not.toHaveBeenCalled();
    warning.dispose();
  });
});
