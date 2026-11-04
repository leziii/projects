import { randomBytes, scrypt, timingSafeEqual, type BinaryLike } from 'node:crypto';

const scryptAsync = (pw: BinaryLike, salt: BinaryLike, len: number) =>
  new Promise<Buffer>((resolve, reject) => scrypt(pw, salt, len, (err, key) => (err ? reject(err) : resolve(key))));

/** "scrypt$<salt>$<hash>" (hex). Only the hash is stored, never the password. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${(await scryptAsync(password, salt, 64)).toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const key = await scryptAsync(password, Buffer.from(salt, 'hex'), 64);
  return timingSafeEqual(key, Buffer.from(hash, 'hex'));
}
