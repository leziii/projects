/**
 * E14-1 A02 (round 57): one card per admin queue. Each count uses the same rule as its list (R57-2),
 * and an admin only sees cards for pages they may open (R57-3).
 */
import type { AdminPage } from './admin';
import { canCheckBank, type MoneyItem } from './money';

export type QueueKey = 'caregivers' | 'pets' | 'exceptions' | 'cases' | 'money_failed' | 'money_late';
export const QUEUE_KEYS: QueueKey[] = ['caregivers', 'pets', 'exceptions', 'cases', 'money_failed', 'money_late'];

export interface QueueInfo {
  label: string;
  page: AdminPage;
  /** Where the card opens; the list there shows the same rows. */
  path: string;
}

export const QUEUE_INFO: Record<QueueKey, QueueInfo> = {
  caregivers: { label: 'Caregivers to review', page: 'caregivers', path: '/caregivers' },
  pets: { label: 'Pets to check', page: 'pets', path: '/pets' },
  exceptions: { label: 'Exceptions open', page: 'exceptions', path: '/exceptions' },
  cases: { label: 'Cases open', page: 'cases', path: '/cases' },
  money_failed: { label: 'Money failed', page: 'money', path: '/money?tab=failed' },
  money_late: { label: 'Money processing over 30 min', page: 'money', path: '/money?tab=late' },
};

export interface QueueCount {
  key: QueueKey;
  count: number;
}

export const DASHBOARD_RULES = { refreshSeconds: 60 } as const;
export const DASHBOARD_NOTE = 'Normal orders run on their own. Only these queues need you.';

/** R57-3: the queues this admin can open. */
export const queuesFor = (pages: readonly AdminPage[]) => QUEUE_KEYS.filter((k) => pages.includes(QUEUE_INFO[k].page));

/** R57-2: the rows of each list that wait for an admin. */
export const waitingCase = (r: { status: string }) => r.status !== 'decided';
export const waitingException = (r: { status: string }) => r.status === 'open';
export const moneyFailed = (i: Pick<MoneyItem, 'state'>) => i.state === 'failed';
export const moneyLate = (i: Pick<MoneyItem, 'state' | 'late'>) => canCheckBank(i);

/** R57-4: grey at 0, red for failed money, amber otherwise. */
export function queueTone(q: QueueCount): 'quiet' | 'danger' | 'warning' {
  if (q.count === 0) return 'quiet';
  return q.key === 'money_failed' ? 'danger' : 'warning';
}

/** "Nothing waiting", "1 waiting", "12 waiting". */
export const queueCountText = (n: number) => (n === 0 ? 'Nothing waiting' : `${n} waiting`);
