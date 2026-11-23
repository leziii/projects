import type { QueueCount } from '@pawpal/shared';
import { api } from './payments';

/** E14-1 A02 (R57-1, R57-3): counts of the queues this admin can open. */
export const getQueues = (f?: typeof fetch) => api<QueueCount[]>('/admin/dashboard/queues', undefined, f);
