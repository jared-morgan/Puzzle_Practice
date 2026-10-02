// Sound playback on the Web Audio API, standing in for pygame.mixer.
// Browsers only allow audio after a user gesture, so the context is created on the
// first click or key press (see unlockAudio) and sounds decode lazily after that.
// Ship sounds as MP3: Safari can't decode Ogg Vorbis everywhere.
import { byName, type UrlGlob } from './assets';

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
  private volume = 0.5;
  private disposed = false;

  constructor(glob: UrlGlob) {
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
    this.disposed = true;
    this.gain?.disconnect();
  }
}
