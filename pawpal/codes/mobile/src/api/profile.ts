import type { CaregiverProfile, ProfileInput } from '@pawpal/shared';
import { ApiError, api, apiBase, getToken } from './client';

export const getProfile = () => api<CaregiverProfile>('/caregiver/profile');
export const saveProfile = (input: ProfileInput) => api<CaregiverProfile>('/caregiver/profile', input);

/** Sends a new profile photo for review (multipart, so plain fetch with the login token). */
export async function uploadProfilePhoto(file: Blob): Promise<CaregiverProfile> {
  const form = new FormData();
  form.append('photo', file);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/caregiver/profile/photo`, { method: 'POST', body: form, headers: { authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new ApiError('OFFLINE', 'Cannot reach PawPal. Check your connection', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!res.ok) throw new ApiError(body.code ?? `HTTP_${res.status}`, res.status === 413 ? 'Photo is too big (max 5 MB)' : (body.message ?? 'Upload failed'), res.status, body);
  return body as CaregiverProfile;
}

/** The photo in use or the one waiting, as a local object URL (the image needs the login token). */
export async function profilePhotoUrl(which: 'current' | 'pending'): Promise<string> {
  const res = await fetch(`${apiBase()}/api/caregiver/profile/photo?which=${which}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo', res.status);
  return URL.createObjectURL(await res.blob());
}
