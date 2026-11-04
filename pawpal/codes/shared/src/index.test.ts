import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_NAME, SHARED_VERSION } from './index';

describe('shared package', () => {
  it('exports app name and version', () => {
    expect(APP_NAME).toBe('PawPal');
    expect(SHARED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // "export *" silently drops a name two modules both export, so each name must be unique.
  it('no two modules export the same name', async () => {
    const files = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');
    const seen = new Map<string, string>();
    const dups: string[] = [];
    for (const f of files) {
      for (const name of Object.keys(await import(/* @vite-ignore */ `./${f.slice(0, -3)}`))) {
        if (seen.has(name)) dups.push(`${name}: ${seen.get(name)} and ${f}`);
        seen.set(name, f);
      }
    }
    expect(dups).toEqual([]);
  });
});
