import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { BRAND, headTags, webManifest } from '../shared/src/brand';

/** The service worker; the dev server's copy caches nothing (DEV = true). */
const swSource = (dev = false) => {
  const src = readFileSync(fileURLToPath(new URL('./sw.js', import.meta.url)), 'utf8');
  return dev ? src.replace('const DEV = false;', 'const DEV = true;') : src;
};

/**
 * Makes the mobile app installable (E1-5): serves /manifest.webmanifest and /sw.js at the site root
 * and adds the brand's head tags. Everything comes from shared/src/brand.ts.
 */
export function pwa(): Plugin {
  const manifest = () => JSON.stringify(webManifest(), null, 2);
  return {
    name: 'pawpal-pwa',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/manifest.webmanifest') {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifest());
        } else if (req.url === '/sw.js') {
          res.setHeader('Content-Type', 'text/javascript');
          res.end(swSource(true));
        } else next();
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource() });
    },
    transformIndexHtml(html) {
      return html
        .replace('<title></title>', `<title>${BRAND.name}</title>`)
        .replace(
          '<!--preload-links-->',
          `${headTags()}
    <link rel="manifest" href="/manifest.webmanifest">
    <link rel="icon" type="image/png" href="/static/icons/favicon-32.png">
    <link rel="apple-touch-icon" href="/static/icons/apple-touch-icon.png">
    <!--preload-links-->`,
        );
    },
  };
}
