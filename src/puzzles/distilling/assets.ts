// The images and font Distilling_Sim.pyw reads from media/.
import { Images } from '../../core/assets';
import { loadFont } from '../../core/fonts';
import fontUrl from './media/Roboto-Regular.ttf?url';

const imageUrls = import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' });

export const FONT_FAMILY = 'Roboto Simulator';

let images: Images | null = null;

export function image(name: string): HTMLImageElement {
  return images!.get(name);
}

export async function loadAssets(): Promise<void> {
  [images] = await Promise.all([Images.load(imageUrls), loadFont(FONT_FAMILY, fontUrl)]);
}
