import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Encrypts private text (addresses, contacts) with AES-256-GCM.
 * Stored as "v1.<iv>.<tag>.<data>" in base64url; a wrong key or changed data fails to open.
 */
export class Sealer {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('The address key must be 32 bytes');
  }

  seal(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return ['v1', iv, cipher.getAuthTag(), data].map((p) => (typeof p === 'string' ? p : p.toString('base64url'))).join('.');
  }

  /** HMAC-SHA256 with a key derived from the sealing key, in hex. */
  hash(plain: string): string {
    const hashKey = createHmac('sha256', this.key).update('pawpal-hash-v1').digest();
    return createHmac('sha256', hashKey).update(plain, 'utf8').digest('hex');
  }

  open(sealed: string): string {
    const [v, iv, tag, data] = sealed.split('.');
    if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unknown sealed format');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  }
}

/** ADDRESS_KEY: 32 random bytes in base64 (generate with: openssl rand -base64 32). */
export function keyFromEnv(value: string): Buffer {
  const key = Buffer.from(value.trim(), 'base64');
  if (key.length !== 32) throw new Error('ADDRESS_KEY must be 32 bytes in base64 (openssl rand -base64 32)');
  return key;
}
