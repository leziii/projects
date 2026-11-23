import { MONEY_STATE_LABEL, type MoneyDetail, type MoneyItem, type MoneyState } from '@pawpal/shared';
import { api } from './payments';

/** E13-4 A13 (R56-1): every refund and order payout not done, and the latest done ones. */
export const listMoney = (f?: typeof fetch) => api<MoneyItem[]>('/admin/money', undefined, f);
/** A14 (R56-2): one item with each try and who did what. */
export const getMoney = (id: string, f?: typeof fetch) => api<MoneyDetail>(`/admin/money/${encodeURIComponent(id)}`, undefined, f);
/** R56-3: only a failed item; never pays twice. */
export const sendAgain = (id: string, f?: typeof fetch) => api<MoneyDetail>(`/admin/money/${encodeURIComponent(id)}/send-again`, {}, f);
/** R56-4: ask the bank about a try processing for a long time. */
export const checkBank = (id: string, f?: typeof fetch) => api<MoneyDetail>(`/admin/money/${encodeURIComponent(id)}/check`, {}, f);

export const MONEY_TAG: Record<MoneyState, 'danger' | 'warning' | 'success'> = { failed: 'danger', processing: 'warning', done: 'success' };

/** "Failed", "Processing · late", "Done". */
export const moneyStateText = (i: Pick<MoneyItem, 'state' | 'late'>) => `${MONEY_STATE_LABEL[i.state]}${i.late ? ' · over 30 min' : ''}`;

/** "Order P…01 · visit 2", or just the order. */
export const moneyWhereText = (i: Pick<MoneyItem, 'number' | 'index'>) => (i.index === null ? i.number : `${i.number} · visit ${i.index + 1}`);
