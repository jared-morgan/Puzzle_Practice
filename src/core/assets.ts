// Image loading. A puzzle passes the result of
//   import.meta.glob('./media/*.png', { eager: true, query: '?url', import: 'default' })
// and gets back its images keyed by file name without the extension.

export type UrlGlob = Record<string, string>;

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
}

/** Maps a Vite glob result to { name: url }. */
export function byName(glob: UrlGlob): Record<string, string> {
  return Object.fromEntries(Object.entries(glob).map(([path, url]) => [baseName(path), url]));
}

export class Images {
  private readonly images = new Map<string, HTMLImageElement>();

  get(name: string): HTMLImageElement {
    const img = this.images.get(name);
    if (!img) throw new Error(`Missing image ${name}`);
    return img;
  }

  has(name: string): boolean {
    return this.images.has(name);
  }

  static async load(glob: UrlGlob): Promise<Images> {
    const result = new Images();
    await Promise.all(
      Object.entries(byName(glob)).map(async ([name, url]) => {
        const img = new Image();
        img.src = url;
        await img.decode();
        result.images.set(name, img);
      }),
    );
    return result;
  }
}
