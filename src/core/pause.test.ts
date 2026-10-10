import { describe, expect, it } from 'vitest';
import { SessionPause } from './pause';

describe('session pause', () => {
  it('excludes each pause from elapsed game time', () => {
    let now = 100;
    const pause = new SessionPause(() => now);
    pause.toggle();
    now = 5100;
    expect(pause.ticks()).toBe(100);
    pause.resume();
    now = 5200;
    expect(pause.ticks()).toBe(200);
    pause.toggle();
    now = 9200;
    pause.resume();
    now = 9300;
    expect(pause.ticks()).toBe(300);
  });

  it('discards paused inputs and releases held controls on resume', () => {
    const pause = new SessionPause(() => 100);
    pause.input([{ type: 'keydown', key: 'arrowleft' }], 'swordfight', true);
    expect(pause.input([{ type: 'keydown', key: 'escape' }], 'swordfight', true)).toBeNull();
    expect(pause.input([{ type: 'keydown', key: 'space' }], 'swordfight', true)).toBeNull();
    expect(pause.input([{ type: 'keydown', key: 'escape' }], 'swordfight', true))
      .toEqual([{ type: 'keyup', key: 'arrowleft' }]);
  });

  it('uses exact replay timestamps even after a live pause', () => {
    let now = 100;
    const pause = new SessionPause(() => now, (ms) => { if (ms !== null) now = ms; });
    pause.toggle(); now = 5100; pause.resume();
    pause.setReplayTime(700);
    expect(pause.ticks()).toBe(700);
    pause.toggle();
    expect(pause.paused).toBe(false);
    pause.setReplayTime(null);
    now = 800;
    expect(pause.ticks()).toBe(800);
  });
});
