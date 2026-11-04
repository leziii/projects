import type { BlockInput, Schedule, ScheduleSettings } from '@pawpal/shared';
import { api } from './client';

export const getSchedule = () => api<Schedule>('/caregiver/schedule');
export const saveScheduleSettings = (s: ScheduleSettings) => api<Schedule>('/caregiver/schedule/settings', s);
export const addBlock = (b: BlockInput) => api<Schedule>('/caregiver/schedule/blocks', b);
export const removeBlock = (id: number) => api<Schedule>(`/caregiver/schedule/blocks/${id}/delete`, {});
