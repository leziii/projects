import { describe, expect, it } from 'vitest';
import { imageType } from './file-store';

describe('uploaded image type', () => {
  it('reads the type from the first bytes, not the file name', () => {
    expect(imageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('jpg');
    expect(imageType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('png');
    expect(imageType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
    expect(imageType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(imageType(Buffer.alloc(0))).toBeNull();
  });
});
