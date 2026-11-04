import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import { pwa } from './pwa';

export default defineConfig({
  plugins: [uni(), pwa()],
  // Use shared TypeScript source directly so changes show up without a rebuild.
  resolve: { alias: { '@pawpal/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
});
