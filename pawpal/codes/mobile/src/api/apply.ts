import type { Application, ApplicationFileKind, ApplicationInput, CARE_GUIDE } from '@pawpal/shared';
import { ApiError, api, apiBase, getToken } from './client';

export const getApplication = () => api<Application>('/caregiver/application');
export const saveApplication = (input: ApplicationInput) => api<Application>('/caregiver/application', input);
export const submitApplication = () => api<Application>('/caregiver/application/submit', {});
export const removeApplicationFile = (id: number) => api<Application>(`/caregiver/application/files/${id}/delete`, {});
export const getCareGuide = () => api<typeof CARE_GUIDE>('/caregiver/guide');

/** Uploads one document photo (multipart, so plain fetch with the login token). */
export async function uploadApplicationFile(kind: ApplicationFileKind, file: Blob): Promise<Application> {
  const form = new FormData();
  form.append('photo', file);
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/caregiver/application/files?kind=${kind}`, { method: 'POST', body: form, headers: { authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new ApiError('OFFLINE', 'Cannot reach PawPal. Check your connection', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!res.ok) throw new ApiError(body.code ?? `HTTP_${res.status}`, res.status === 413 ? 'Photo is too big (max 5 MB)' : (body.message ?? 'Upload failed'), res.status, body);
  return body as Application;
}

/** A private document photo as a local object URL (the image needs the login token). */
export async function applicationFileUrl(id: number): Promise<string> {
  const res = await fetch(`${apiBase()}/api/caregiver/application/files/${id}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo', res.status);
  return URL.createObjectURL(await res.blob());
}
