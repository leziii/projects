import { SERVICE_RULES } from '@pawpal/shared';

/** Width and height that fit inside max × max, never enlarged. */
export function fitSize(w: number, h: number, max: number = SERVICE_RULES.shrinkToPx): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** R36-4: shrink a photo on the phone before upload (JPEG, longest side 1600 px). Falls back to the original file. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const { w, h } = fitSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const out = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/jpeg', 0.8));
    return out && out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
