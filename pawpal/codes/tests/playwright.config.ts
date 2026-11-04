import { defineConfig } from '@playwright/test';

// Browser tests for admin-web (5173) and mobile H5 (5174). Starts all apps if not running.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  workers: 1, // tests share one database and one admin list, so run them one at a time
  reporter: 'list',
  use: { headless: true },
  webServer: [
    { command: 'pnpm --filter @pawpal/server dev', url: 'http://localhost:3000/api/health', reuseExistingServer: true, cwd: '..', timeout: 120_000 },
    { command: 'pnpm --filter @pawpal/admin-web dev', url: 'http://localhost:5173', reuseExistingServer: true, cwd: '..', timeout: 120_000 },
    { command: 'pnpm --filter @pawpal/mobile dev', url: 'http://localhost:5174', reuseExistingServer: true, cwd: '..', timeout: 120_000 },
  ],
});
