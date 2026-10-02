// Fonts shared by every puzzle.
import type { FontSpec } from './screen';
import freeSansBoldUrl from './fonts/freesansbold.ttf?url';

const loaded = new Map<string, Promise<void>>();

/** Loads a font file once and registers it under `family`. */
export function loadFont(family: string, url: string): Promise<void> {
  let promise = loaded.get(family);
  if (!promise) {
    const face = new FontFace(family, `url(${url})`);
    promise = face.load().then((f) => {
      document.fonts.add(f);
    });
    loaded.set(family, promise);
  }
  return promise;
}

const PYGAME_DEFAULT = 'Pygame Default';

/**
 * The font pygame falls back to for `pygame.font.SysFont(<unknown>, size)` and `Font(None, size)`:
 * FreeSansBold, scaled to 0.6875 of the requested size, with the ascent pygame reports.
 */
export function pygameFont(size: number): FontSpec {
  const px = Math.floor(size * 0.6875);
  return { family: PYGAME_DEFAULT, px, ascent: Math.ceil(px * 0.8) };
}

export function loadPygameFont(): Promise<void> {
  return loadFont(PYGAME_DEFAULT, freeSansBoldUrl);
}
