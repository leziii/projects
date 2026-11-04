import { defineConfig } from 'vitest/config';

// Unit tests run without the uni-app plugin.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
