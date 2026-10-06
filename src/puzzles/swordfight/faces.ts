// Pirates' faces, put together the way the game puts its 58x58 faces together: layers (head, face
// paint, hair, hat) from the game's face bundles, each placed at its offset in the frame and recoloured
// with the game's colourisations (skin, hair and the two cloth dyes).
import type { PyRandom } from '../../core/pyrandom';

export const FACE = 58;

/** Where each layer's image sits in the 58x58 frame. */
const AT: Record<string, [number, number]> = {
  'fmale-head': [14, 19], 'fmale-head-out': [14, 19], 'fmale-zombie': [15, 18], 'fmale-mercenary': [14, 19],
  'fmale-facepaint': [14, 19], 'fmale-facepaint-out': [14, 19], 'fmale-mask': [2, 0], 'fmale-shako': [10, 1],
  'fmale-hair-messy_short': [15, 15],
  'ffemale-head': [16, 18], 'ffemale-head-out': [16, 18], 'ffemale-zombie': [15, 18], 'ffemale-mercenary': [16, 18],
  'ffemale-facepaint': [15, 20], 'ffemale-facepaint-out': [15, 20], 'ffemale-mask': [5, 5], 'ffemale-shako': [11, 2],
  'ffemale-hair-cultist_top_knot': [25, 16], 'ffemale-hair-ponytail': [9, 14],
  homunculus: [7, 0], 'homunculus-out': [7, 0],
};

type Hsv = [number, number, number];

/** The game's colourisation classes: the source colour they replace, how near a colour must be, and each colour's HSV offsets. */
const ZATIONS = {
  skin: { source: '#C550D7', range: [0.08, 0.4, 1], colours: { darkest: [-0.75, -0.2, -0.45], dark: [-0.75, 0.16, -0.26], medium: [-0.75, -0.05, -0.01], tan: [-0.73, -0.08, -0.03], white: [-0.74, -0.28, -0.02], pale: [-0.72, -0.42, 0], pasty: [-0.72, -0.48, 0] } },
  hair: { source: '#922226', range: [0.05, 0.8, 1], colours: { red: [0.02, -0.1, 0], silver: [0.13, -0.9, -0.15], white: [0.13, -0.9, 0.15], black: [0.6, -0.7, -0.6], darkBrown: [0.1, 0, -0.4], lightBrown: [0.11, -0.2, -0.2], strawberryBlonde: [0.1, -0.1, 0], sandy: [0.13, -0.4, -0.1], blonde: [0.15, -0.4, 0.05] } },
  textile_p: { source: '#922226', range: [0.07, 0.7, 1], colours: { red: [0, 0.05, 0], brown: [-0.91, -0.2, -0.2], white: [0, -1, 0.1], black: [0, -1, -0.6], grey: [0, -1, -0.2], yellow: [-0.83, -0.2, 0.1], pink: [0.95, -0.2, 0.15], violet: [0.83, -0.1, -0.15], purple: [0.76, 0.05, -0.11], navyBlue: [0.65, -0.2, -0.2], blue: [-0.4, 0, 0], aqua: [0.5, 0, -0.1], lime: [0.32, -0.1, -0.1], green: [0.3, -0.2, -0.4], orange: [0.08, 0, 0.05], maroon: [0, 0.1, -0.3], darkBrown: [-0.91, -0.2, -0.4], gold: [0.125, 0.4, 0.1] } },
  textile_s: { source: '#57AC6A', range: [0.1, 0.6, 1], colours: { red: [0.65, 0.05, 0.2], brown: [-0.28, -0.37, -0.1], white: [0.72, -1, 0.2], black: [0.72, -1, -0.5], grey: [0.2, -1, 0], yellow: [0.81, -0.25, 0.2], pink: [0.6, -0.27, 0.25], violet: [-0.55, -0.15, 0.09], purple: [-0.6, 0.1, 0.1], navyBlue: [0.28, -0.27, -0.07], blue: [0.25, -0.15, 0.2], aqua: [0.15, 0, 0.15], lime: [-0.05, -0.1, 0.1], green: [-0.05, -0.25, -0.3], orange: [0.72, 0.04, 0.252], maroon: [0.65, 0.1, -0.2], darkBrown: [-0.28, -0.37, -0.27], gold: [0.76, 0.6, 0.24] } },
} as const;

type Zation = keyof typeof ZATIONS;

/** A layer and the colour classes it takes, in the order the game tries them. */
interface Layer {
  image: string;
  classes: Zation[];
}

export interface Look {
  /** Drawn bottom to top. */
  layers: Layer[];
  /** The same face knocked out, where the game has a passed-out expression. */
  out: Layer[];
  colours: Partial<Record<Zation, string>>;
}

export type FaceKind = 'You' | 'Cultist' | 'Homunculus' | 'Thrall' | 'Skilled swabbie';

const pick = <T>(rng: PyRandom, list: readonly T[]): T => list[rng.randintN(0, list.length - 1)];
const names = (z: Zation) => Object.keys(ZATIONS[z].colours);

/** How a pirate of a kind looks: man or woman, with random skin, hair and dyes. */
export function lookFor(kind: FaceKind, female: boolean, rng: PyRandom): Look {
  const g = female ? 'ffemale' : 'fmale';
  const head: Zation[] = female ? ['skin'] : ['skin', 'hair'];
  const colours: Look['colours'] = {
    skin: pick(rng, names('skin')), hair: pick(rng, names('hair')),
    textile_p: pick(rng, names('textile_p')), textile_s: pick(rng, names('textile_s')),
  };
  const layer = (image: string, classes: Zation[]): Layer => ({ image, classes });
  switch (kind) {
    case 'Homunculus':
      return { layers: [layer('homunculus', [])], out: [layer('homunculus-out', [])], colours };
    case 'Cultist': {
      const paint: Zation[] = ['skin', 'textile_p', 'textile_s'];
      const hair = female ? [layer('ffemale-hair-cultist_top_knot', ['hair'])] : [];
      return {
        layers: [layer(`${g}-head`, head), layer(`${g}-facepaint`, paint), ...hair],
        out: [layer(`${g}-head-out`, head), layer(`${g}-facepaint-out`, paint), ...hair],
        colours,
      };
    }
    case 'Thrall': {
      // A zombie under an enthralled mask, which hides the hair.
      const layers = [layer(`${g}-zombie`, ['skin']), layer(`${g}-mask`, ['textile_p', 'textile_s'])];
      return { layers, out: layers, colours };
    }
    case 'Skilled swabbie': {
      const hair = female ? [layer('ffemale-hair-ponytail', ['hair'])] : [];
      const layers = [layer(`${g}-mercenary`, head), ...hair, layer(`${g}-shako`, ['textile_p'])];
      return { layers, out: layers, colours };
    }
    default:
      return {
        layers: [layer('fmale-head', ['skin', 'hair']), layer('fmale-hair-messy_short', ['hair'])],
        out: [layer('fmale-head-out', ['skin', 'hair']), layer('fmale-hair-messy_short', ['hair'])],
        colours: { skin: 'tan', hair: 'darkBrown' },
      };
  }
}

// java.awt.Color's RGBtoHSB and HSBtoRGB, which the game's colourisation goes through.
function toHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const s = max ? (max - min) / max : 0;
  if (!s) return [0, 0, v];
  const rc = (max - r) / (max - min);
  const gc = (max - g) / (max - min);
  const bc = (max - b) / (max - min);
  let h = r === max ? bc - gc : g === max ? 2 + rc - bc : 4 + gc - rc;
  h /= 6;
  if (h < 0) h += 1;
  return [h, s, v];
}

function toRgb([hue, s, v]: Hsv): [number, number, number] {
  if (!s) {
    const c = Math.trunc(v * 255 + 0.5);
    return [c, c, c];
  }
  const h = (hue - Math.floor(hue)) * 6;
  const f = h - Math.floor(h);
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][Math.floor(h)];
  return [Math.trunc(r * 255 + 0.5), Math.trunc(g * 255 + 0.5), Math.trunc(b * 255 + 0.5)];
}

const SHORT_MAX = 32767;
const fixed = (f: number) => Math.trunc(f * SHORT_MAX);

function sourceHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  return toHsv(n >> 16 & 255, n >> 8 & 255, n & 255);
}

/** Recolours a colour by the first of a layer's colourisations it is near enough to (Colorization.matches / recolorColor). */
function recolour(hsv: Hsv, zations: Array<{ source: Hsv; range: readonly number[]; offsets: readonly number[] }>): Hsv | null {
  for (const z of zations) {
    const d = Math.abs(fixed(hsv[0]) - fixed(z.source[0]));
    if (Math.min(d, SHORT_MAX - d) > z.range[0] * SHORT_MAX) continue;
    if (Math.abs(z.source[1] - hsv[1]) > z.range[1] || Math.abs(z.source[2] - hsv[2]) > z.range[2]) continue;
    let h = hsv[0] + z.offsets[0];
    if (h > 1) h -= 1;
    const clamp = (x: number) => Math.min(Math.max(x, 0), 1);
    return [h, clamp(hsv[1] + z.offsets[1]), clamp(hsv[2] + z.offsets[2])];
  }
  return null;
}

/** Draws a face into a new 58x58 canvas. */
export function drawFace(look: Look, out: boolean, image: (name: string) => HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FACE;
  canvas.height = FACE;
  const ctx = canvas.getContext('2d')!;
  for (const layer of out ? look.out : look.layers) {
    const img = image(layer.image);
    const part = document.createElement('canvas');
    part.width = img.width;
    part.height = img.height;
    const pc = part.getContext('2d')!;
    pc.drawImage(img, 0, 0);
    const zations = layer.classes.flatMap((c) => {
      const colour = look.colours[c];
      const z = ZATIONS[c];
      const offsets = colour ? (z.colours as Record<string, readonly number[]>)[colour] : undefined;
      return offsets ? [{ source: sourceHsv(z.source), range: z.range, offsets }] : [];
    });
    if (zations.length) {
      const data = pc.getImageData(0, 0, part.width, part.height);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        if (!px[i + 3]) continue;
        const hsv = recolour(toHsv(px[i], px[i + 1], px[i + 2]), zations);
        if (hsv) [px[i], px[i + 1], px[i + 2]] = toRgb(hsv);
      }
      pc.putImageData(data, 0, 0);
    }
    const [x, y] = AT[layer.image];
    ctx.drawImage(part, x, y);
  }
  return canvas;
}
