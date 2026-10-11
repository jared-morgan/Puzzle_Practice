import { SoundBank, getWarningTimer } from './audio';

const urls = import.meta.glob<string>('./sounds/*.mp3', { eager: true, query: '?url', import: 'default' });
type Warning = 'cultist_attack' | 'vampire_warning';

/** One warning per timed session, using its simulation clock rather than a wall-clock timeout. */
export class TimerWarning {
  private played = false;
  private readonly sounds: SoundBank<Warning>;
  private readonly threshold: number;
  private readonly sound: Warning;

  constructor(style: 'gauntlet' | 'vampirate', muted: () => boolean) {
    this.sound = style === 'gauntlet' ? 'cultist_attack' : 'vampire_warning';
    // Gauntlet announces returning enemies 30 seconds before foraging ends.
    // Vampirate practice uses the existing 15-second warning for vampires returning.
    this.threshold = style === 'gauntlet' ? 30000 : 15000;
    this.sounds = new SoundBank<Warning>(urls, muted);
  }

  reset(): void { this.played = false; }

  update(remaining: number | null): void {
    if (this.played || remaining === null || remaining > this.threshold) return;
    this.played = true;
    if (remaining > 0 && getWarningTimer()) this.sounds.play(this.sound);
  }

  dispose(): void { this.sounds.dispose(); }
}
