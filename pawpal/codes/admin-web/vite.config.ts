import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { headTags } from '../shared/src/brand';

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'pawpal-brand-head',
      transformIndexHtml: (html) =>
        html.replace('</title>', `</title>\n    ${headTags(undefined, 'PawPal Admin')}\n    <link rel="icon" type="image/svg+xml" href="/logo.svg">`),
    },
  ],
  // Use shared TypeScript source directly so changes show up without a rebuild.
  resolve: { alias: { '@pawpal/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) } },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000' } },
  build: {
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('element-plus') ? 'element-plus' : id.includes('node_modules') ? 'vendor' : undefined),
      },
    },
    chunkSizeWarningLimit: 1000,
  },
});
