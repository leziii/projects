import type { Pet, PetInput } from '@pawpal/shared';
import { ApiError, api, apiBase, getToken } from './client';

export const listPets = () => api<Pet[]>('/pets');
export const getPet = (id: number) => api<Pet>(`/pets/${id}`);
export const createPet = (input: Partial<PetInput>) => api<Pet>('/pets', input);
export const updatePet = (id: number, input: Partial<PetInput>) => api<Pet>(`/pets/${id}`, input);

/** Uploads the vaccine card photo (multipart, so plain fetch with the login token). */
export async function uploadVaccinePhoto(id: number, file: Blob): Promise<Pet> {
  const form = new FormData();
  form.append('photo', file);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/pets/${id}/vaccine-photo`, { method: 'POST', body: form, headers: { authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new ApiError('OFFLINE', 'Cannot reach PawPal. Check your connection', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!res.ok) throw new ApiError(body.code ?? `HTTP_${res.status}`, res.status === 413 ? 'Photo is too big (max 5 MB)' : (body.message ?? 'Upload failed'), res.status, body);
  return body as Pet;
}

/** The private vaccine card photo as a local object URL (the image needs the login token). */
export async function vaccinePhotoUrl(id: number): Promise<string> {
  const res = await fetch(`${apiBase()}/api/pets/${id}/vaccine-photo`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo', res.status);
  return URL.createObjectURL(await res.blob());
}
