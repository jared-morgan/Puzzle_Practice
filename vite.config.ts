import { defineConfig, type Plugin } from 'vite';

/**
 * The landing page builds its cards in JS, so the browser only finds the thumbnails after the
 * script has downloaded and run. This starts them downloading straight from index.html instead,
 * but only when the landing page is the one being opened.
 */
function preloadThumbnails(): Plugin {
  return {
    name: 'preload-thumbnails',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const urls = Object.values(ctx.bundle ?? {})
          .filter((file) => file.type === 'asset' && file.originalFileNames.some((name) => /[\\/]thumbnail\.webp$/.test(name)))
          .map((file) => `./${file.fileName}`)
          .sort();
        if (!urls.length) return;
        const script = `if(!/^#\\/./.test(location.hash))for(const u of ${JSON.stringify(urls)}){const l=document.createElement('link');l.rel='preload';l.as='image';l.href=u;document.head.append(l)}`;
        return [{ tag: 'script', children: script, injectTo: 'head' }];
      },
    },
  };
}

export default defineConfig({
  // Relative asset paths so the build works under https://<user>.github.io/<repo>/.
  base: './',
  plugins: [preloadThumbnails()],
});
