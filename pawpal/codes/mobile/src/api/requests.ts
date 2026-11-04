import type { RejectReason, RequestDetail, RequestList, TaskList, VisitTask } from '@pawpal/shared';
import { api } from './client';

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
export const arriveVisit = (orderId: number, i: number) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/arrive`, {});
export const enterVisit = (orderId: number, i: number) => api<VisitTask>(`/caregiver/tasks/${orderId}/${i}/enter`, {});
