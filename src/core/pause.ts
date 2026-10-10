import { keyMatches } from './controls';
import type { InputEvent } from './input';
import type { Panel } from './panel';

/** A stopped simulation clock: pauses add no time or input to the saved replay. */
export class SessionPause {
  paused = false;
  private stoppedAt = 0;
  private offset = 0;
  private replay = false;
  private held = new Set<string>();
  private releases: InputEvent[] = [];

  constructor(private readonly rawTicks: () => number, private readonly rawReplayTime?: (ms: number | null) => void) {}

  readonly ticks = (): number => this.replay ? this.rawTicks() : this.paused ? this.stoppedAt : this.rawTicks() - this.offset;
  readonly setReplayTime = (ms: number | null): void => {
    this.paused = false;
    this.replay = ms !== null;
    this.offset = 0;
    this.held.clear();
    this.releases = [];
    this.rawReplayTime?.(ms);
  };

  resume(): void {
    if (!this.paused) return;
    this.offset = this.rawTicks() - this.stoppedAt;
    this.paused = false;
  }

  toggle(): void {
    if (this.replay) return;
    if (this.paused) this.resume();
    else {
      this.stoppedAt = this.ticks();
      this.paused = true;
      this.releases = [...this.held].map((key) => ({ type: 'keyup', key }));
      this.held.clear();
    }
  }

  install(panel: Panel, active: () => boolean): void {
    panel.group().button('Pause', () => { if (active()) this.toggle(); }, {
      label: () => this.paused ? 'Resume' : 'Pause', disabled: () => !active() || this.replay,
    });
  }

  /** null keeps the last rendered frame while the simulation and its timers are stopped. */
  input(events: InputEvent[], puzzle: string, active: boolean): InputEvent[] | null {
    if (this.replay) return events;
    const filtered = events.filter((event) => {
      if ((event.type === 'keydown' || event.type === 'keyup') && keyMatches(event.key, puzzle, 'pause', 'escape')) {
        if (event.type === 'keydown' && active) this.toggle();
        return false;
      }
      return true;
    });
    if (!active) this.resume();
    if (this.paused) return null;
    for (const event of filtered) {
      if (event.type === 'keydown') this.held.add(event.key);
      if (event.type === 'keyup') this.held.delete(event.key);
    }
    return [...this.releases.splice(0), ...filtered];
  }
}
