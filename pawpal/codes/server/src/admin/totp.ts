import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Authenticator-app codes (RFC 6238): 6 digits, 30-second steps, SHA-1, as Google/Microsoft Authenticator expect. */
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error('Bad base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits), base32 for the authenticator app. */
export const newTotpSecret = () => base32Encode(randomBytes(20));

/** The code for a time (default now). */
export function totpCode(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / STEP_SECONDS)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = h[h.length - 1] & 15;
  const n = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(n).padStart(DIGITS, '0');
}

/** The time step a code belongs to: now or one step either side (phone clocks drift a little); null if wrong. */
export function totpStep(secret: string, code: string, at = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (const d of [-1, 0, 1]) {
    const t = at + d * STEP_SECONDS * 1000;
    if (timingSafeEqual(Buffer.from(totpCode(secret, t)), Buffer.from(code))) return Math.floor(t / 1000 / STEP_SECONDS);
  }
  return null;
}

export const checkTotp = (secret: string, code: string, at = Date.now()) => totpStep(secret, code, at) !== null;

/** The link an authenticator app reads from a QR code. */
export const otpauthUrl = (username: string, secret: string) =>
  `otpauth://totp/PawPal%20Admin:${encodeURIComponent(username)}?secret=${secret}&issuer=PawPal%20Admin&digits=${DIGITS}&period=${STEP_SECONDS}`;
