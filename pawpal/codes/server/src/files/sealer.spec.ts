import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { Sealer, keyFromEnv } from './sealer';

describe('address encryption', () => {
  const sealer = new Sealer(randomBytes(32));

  it('seals and opens; the stored text does not show the address', () => {
    const sealed = sealer.seal('A-12-3, Jalan Kiara 3');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('Kiara');
    expect(sealer.seal('same')).not.toBe(sealer.seal('same'));
    expect(sealer.open(sealed)).toBe('A-12-3, Jalan Kiara 3');
  });

  it('refuses a wrong key or changed data', () => {
    const sealed = sealer.seal('secret');
    expect(() => new Sealer(randomBytes(32)).open(sealed)).toThrow();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('other').toString('base64url');
    expect(() => sealer.open(parts.join('.'))).toThrow();
  });

  it('reads ADDRESS_KEY as 32 bytes of base64', () => {
    expect(keyFromEnv(randomBytes(32).toString('base64'))).toHaveLength(32);
    expect(() => keyFromEnv('short')).toThrow('ADDRESS_KEY must be 32 bytes');
  });

  it('hashes the same text the same way, different keys differently', () => {
    expect(sealer.hash('900101-14-5678')).toBe(sealer.hash('900101-14-5678'));
    expect(sealer.hash('900101-14-5678')).not.toBe(sealer.hash('900101-14-5679'));
    expect(new Sealer(randomBytes(32)).hash('900101-14-5678')).not.toBe(sealer.hash('900101-14-5678'));
  });
});
