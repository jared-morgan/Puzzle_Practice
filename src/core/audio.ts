// Sound playback on the Web Audio API, standing in for pygame.mixer.
// Browsers only allow audio after a user gesture, so the context is created on the
// first click or key press (see unlockAudio) and sounds decode lazily after that.
// Ship sounds as MP3: Safari can't decode Ogg Vorbis everywhere.
import { byName, type UrlGlob } from './assets';
import { Store } from './storage';

const preferences = new Store('global');
let globalVolume = Math.max(0, Math.min(100, preferences.get<number>('volume', 50)));
const banks = new Set<SoundBank>();
export const getVolume = () => globalVolume;
export function setVolume(value: number): void {
  globalVolume = Math.max(0, Math.min(100, value));
  preferences.set('volume', globalVolume);
  for (const bank of banks) bank.setVolume(globalVolume / 100);
}

let context: AudioContext | null = null;
const waiting: Array<(ctx: AudioContext) => void> = [];

export function unlockAudio(): void {
  if (context) {
    if (context.state === 'suspended') void context.resume();
    return;
  }
  try {
    context = new AudioContext();
  } catch {
    return; // No audio device: the desktop games skip sounds in the same situation.
  }
  for (const callback of waiting.splice(0)) callback(context);
}

function withContext(callback: (ctx: AudioContext) => void): void {
  if (context) callback(context);
  else waiting.push(callback);
}

export class SoundBank<Name extends string = string> {
  private readonly buffers = new Map<string, AudioBuffer>();
  private gain: GainNode | null = null;
  private volume = globalVolume / 100;
  private disposed = false;

  constructor(glob: UrlGlob, private readonly isMuted: () => boolean = () => false) {
    banks.add(this);
    const urls = byName(glob);
    withContext((ctx) => {
      if (this.disposed) return;
      this.gain = ctx.createGain();
      this.gain.gain.value = this.volume;
      this.gain.connect(ctx.destination);
      for (const [name, url] of Object.entries(urls)) {
        fetch(url)
          .then((response) => response.arrayBuffer())
          .then((data) => ctx.decodeAudioData(data))
          .then((buffer) => this.buffers.set(name, buffer))
          .catch(() => {});
      }
    });
  }

  play(name: Name): void {
    if (this.isMuted()) return;
    const buffer = this.buffers.get(name);
    if (!context || !this.gain || !buffer || this.disposed) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gain);
    source.start();
  }

  /** 0–1, like Sound.set_volume. */
  setVolume(volume: number): void {
    this.volume = volume;
    if (this.gain) this.gain.gain.value = volume;
  }

  dispose(): void {
    banks.delete(this);
    this.disposed = true;
    this.gain?.disconnect();
  }
}
