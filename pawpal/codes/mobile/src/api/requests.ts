import type { CheckItem, GeoPoint, RejectReason, RequestDetail, RequestList, TaskList, VisitTask, Review } from '@pawpal/shared';
import { ApiError, api, apiBase, getToken } from './client';

export interface CaregiverHome {
  newRequests: number;
  todayVisits: number;
}

/** S01 and S06 (E6-1). */
export const getHome = () => api<CaregiverHome>('/caregiver/home');
export const getRequests = () => api<RequestList>('/requests');
export const getRequest = (id: number) => api<RequestDetail>(`/requests/${id}`);
/** R25-8: why a caregiver account is paused. */
export const getPaused = () => api<{ paused: boolean; reason: string | null }>('/caregiver/paused');
/** S07 (E6-2): accept the whole order, or say no with a reason the owner never sees. */
export const acceptRequest = (id: number) => api<RequestDetail>(`/requests/${id}/accept`, {});
export const rejectRequest = (id: number, reason: RejectReason) => api<RequestDetail>(`/requests/${id}/reject`, { reason });
/** S08 (E8-1): one day's tasks and the 14-day row. */
export const getTasks = (date?: string) => api<TaskList>(`/caregiver/tasks${date ? `?date=${date}` : ''}`);
/** S09 (E8-2): one visit of an accepted order. */
export const getVisit = (orderId: number, i: number) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}`);
/** S10 (E8-3): "I've arrived", and for Pre-authorised the caregiver's entry confirm. */
export const arriveVisit = (orderId: number, i: number, location: GeoPoint | null) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/arrive`, { location });
export const enterVisit = (orderId: number, i: number) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/enter`, {});
/** S11 (E8-4): tick an item, add or delete a photo, see a photo (private, so loaded with the login token). */
export const checkItem = (orderId: number, i: number, item: CheckItem, done: boolean) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/check`, { item, done });
export const deleteVisitPhoto = (orderId: number, i: number, photoId: number) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/photos/${photoId}/delete`, {});

export async function uploadVisitPhoto(orderId: number, i: number, file: Blob): Promise<VisitTask> {
  const form = new FormData();
  form.append('photo', file, 'photo.jpg');
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/api/caregiver/tasks/${orderId}/${i}/photos`, { method: 'POST', body: form, headers: { authorization: `Bearer ${getToken()}` } });
  } catch {
    throw new ApiError('OFFLINE', 'Upload failed. Check your connection and try again', 0);
  }
  const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!res.ok) throw new ApiError(body.code ?? `HTTP_${res.status}`, res.status === 413 ? 'Photo is too big (max 10 MB)' : (body.message ?? 'Upload failed'), res.status, body);
  return body as VisitTask;
}

export async function visitPhotoUrl(orderId: number, i: number, photoId: number): Promise<string> {
  const res = await fetch(`${apiBase()}/api/caregiver/tasks/${orderId}/${i}/photos/${photoId}`, { headers: { authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new ApiError('NO_PHOTO', 'Could not load the photo', res.status);
  return URL.createObjectURL(await res.blob());
}
/** S12 (E8-5): the note draft, and sending the report. */
export const saveReportNote = (orderId: number, i: number, note: string) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/note`, { note });
export const sendReport = (orderId: number, i: number, location: GeoPoint | null) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/report`, { location });

/** E9-3 S07 (R41-5) */
export const getRequestReview = (id: number) => api<{ review: Review | null }>(`/requests/${id}/review`);
export const replyReview = (id: number, reply: string) => api<{ review: Review | null }>(`/requests/${id}/review/reply`, { reply });
