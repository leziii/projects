import type { CaregiverCard } from '@pawpal/shared';
import { ApiError, api, apiBase, getToken } from './client';

export const getCaregiverCard = (id: number) => api<CaregiverCard>(`/caregivers/${id}`);

/** The caregiver's approved photo as a local object URL (the image needs the login token). */
export async function caregiverPhotoUrl(id: number): Promise<string> {
  const res = await fetch(`${apiBase()}/api/caregivers/${id}/photo`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo', res.status);
  return URL.createObjectURL(await res.blob());
}
