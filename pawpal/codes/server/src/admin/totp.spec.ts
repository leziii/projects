import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';
import { base32Decode, base32Encode, checkTotp, newTotpSecret, otpauthUrl, totpCode } from './totp';

describe('authenticator codes', () => {
  // RFC 6238 test secret "12345678901234567890" (SHA-1); expected codes are the last 6 digits of the RFC table.
  const secret = base32Encode(Buffer.from('12345678901234567890'));

  it('matches the RFC 6238 test vectors', () => {
    expect(totpCode(secret, 59_000)).toBe('287082');
    expect(totpCode(secret, 1_111_111_109_000)).toBe('081804');
    expect(totpCode(secret, 1_234_567_890_000)).toBe('005924');
    expect(totpCode(secret, 20_000_000_000_000)).toBe('353130');
  });

  it('accepts one step of clock drift, no more', () => {
    const at = 1_234_567_890_000;
    expect(checkTotp(secret, totpCode(secret, at - 30_000), at)).toBe(true);
    expect(checkTotp(secret, totpCode(secret, at + 30_000), at)).toBe(true);
    expect(checkTotp(secret, totpCode(secret, at - 90_000), at)).toBe(false);
    expect(checkTotp(secret, 'abcdef', at)).toBe(false);
  });

  it('base32 round trip and setup link', () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(s))).toBe(s);
    expect(otpauthUrl('kf', s)).toBe(`otpauth://totp/PawPal%20Admin:kf?secret=${s}&issuer=PawPal%20Admin&digits=6&period=30`);
  });
});

describe('admin passwords', () => {
  it('stores a salted hash and checks it', async () => {
    const stored = await hashPassword('pawpal-2026!');
    expect(stored).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored).not.toBe(await hashPassword('pawpal-2026!'));
    expect(await verifyPassword('pawpal-2026!', stored)).toBe(true);
    expect(await verifyPassword('pawpal-2026?', stored)).toBe(false);
    expect(await verifyPassword('x', 'plain')).toBe(false);
  });
});
