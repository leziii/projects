import { actorLabel, type StatusChange } from '@pawpal/shared';
import { api } from './payments';

export const fetchHistory = (entity: string, id: number, f?: typeof fetch) => api<StatusChange[]>(`/history/${entity}/${id}`, undefined, f);

const word = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Created → Pending" for the first row, "Pending → Succeeded" after. */
export function stepLabel(c: StatusChange): string {
  return `${c.fromStatus ? word(c.fromStatus) : 'Created'} → ${word(c.toStatus)}`;
}

/** "Gateway · Gateway webhook evt_1" */
export function whoWhy(c: StatusChange): string {
  return `${actorLabel(c.actorType, c.actorId)} · ${c.reason}`;
}
