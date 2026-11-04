import { REQUEST_END_LABEL, formatRM, timeLeftText, visitWhen, type RequestCard, type RequestHistoryRow } from '@pawpal/shared';

export const REQUESTS_URL = '/pages/caregiver/requests';
export const requestUrl = (id: number) => `/pages/caregiver/request?id=${id}`;

/** Urgent / Normal tag (R25-4). */
export const tagText = (c: Pick<RequestCard, 'urgent'>) => (c.urgent ? 'Urgent' : 'Normal');

/** "First visit Tue 3 Nov · 9:00 am · 2 visits" */
export const visitsText = (c: Pick<RequestCard, 'firstVisit' | 'visits'>) => `First visit ${visitWhen(c.firstVisit)} · ${c.visits} ${c.visits === 1 ? 'visit' : 'visits'}`;

/** "Setapak · 1 dog, 1 cat" */
export const whereText = (c: Pick<RequestCard, 'area' | 'pets'>) => `${c.area} · ${c.pets}`;

export const incomeText = (c: Pick<RequestCard, 'incomeSen'>) => `You earn ${formatRM(c.incomeSen)}`;

/** Time left, or "Expired" once the deadline has passed (R25-5). */
export const leftText = (c: Pick<RequestCard, 'deadline'>, now: Date) => timeLeftText(c.deadline, now) ?? REQUEST_END_LABEL.expired;

/** True when a card on screen has run out, so the list should be read again. */
export const anyExpired = (cards: Pick<RequestCard, 'deadline'>[], now: Date) => cards.some((c) => timeLeftText(c.deadline, now) === null);

/** "P20261102001 · Expired" */
export const historyText = (h: Pick<RequestHistoryRow, 'number' | 'end'>) => `${h.number} · ${REQUEST_END_LABEL[h.end]}`;
