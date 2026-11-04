import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC keeps decorator metadata so NestJS dependency injection works in tests.
export default defineConfig({
  test: { include: ['test/**/*.e2e-spec.ts', 'src/**/*.spec.ts'], globals: false },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
