import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export type ImageType = 'jpg' | 'png' | 'webp';

/** Image type from the file's first bytes; null if it is not a JPEG, PNG or WebP. */
export function imageType(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export const IMAGE_MIME: Record<ImageType, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

const KEY = /^[a-z]+\/[a-f0-9]{32}\.(jpg|png|webp)$/;

/**
 * Private files (vaccine cards and later report photos). Development keeps them on the server's disk
 * under UPLOAD_DIR; cloud storage replaces this when hosting is chosen. Files are never served directly:
 * a controller checks who may see a file, then reads it here.
 */
@Injectable()
export class FileStore {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR', 'uploads'));
  }

  async save(folder: string, data: Buffer, type: ImageType): Promise<string> {
    const key = `${folder}/${randomBytes(16).toString('hex')}.${type}`;
    await mkdir(join(this.root, folder), { recursive: true });
    await writeFile(join(this.root, key), data);
    return key;
  }

  read(key: string): Promise<Buffer> {
    if (!KEY.test(key)) throw new Error(`Bad file key ${key}`);
    return readFile(join(this.root, key));
  }
}
