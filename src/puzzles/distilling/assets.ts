// The images Distilling_Sim.pyw reads from media/.
import { Images } from '../../core/assets';

const imageUrls = import.meta.glob<string>('./media/*.png', { eager: true, query: '?url', import: 'default' });

let images: Images | null = null;

export function image(name: string): HTMLImageElement {
  return images!.get(name);
}

export async function loadAssets(): Promise<void> {
  images = await Images.load(imageUrls);
}
