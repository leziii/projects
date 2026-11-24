import { CAREGIVER_STATUSES, DAY_END, DAY_START, SETTLEMENT_STATE_LABEL, formatRM, timeText, type SettleResult, type TestAlertResult, type TestErrorResult, type AlertLogRow, type BookedVisit, type AlertSent, type RequestAlert, type CaregiverStatus, type Message, type MessageCategory, type MessageLinkType, type Role, type User } from '@pawpal/shared';
import { api } from './payments';

/** Stand-in for caregiver review until E4-2: set a caregiver's status by phone number. */
export const setCaregiverStatus = (phone: string, status: CaregiverStatus, reason: string, f?: typeof fetch) =>
  api<User>('/dev/caregiver-status', { phone, status, reason }, f);

export const STATUS_OPTIONS: { value: CaregiverStatus; label: string }[] = CAREGIVER_STATUSES.map((value) => ({
  value,
  label: { none: 'None (not a caregiver)', pending: 'Pending review', approved: 'Approved', rejected: 'Rejected', suspended: 'Suspended' }[value],
}));

export interface TestMessage {
  phone: string;
  role: Role | '';
  category: MessageCategory;
  title: string;
  body: string;
  linkType: MessageLinkType | '';
  linkId: number | null;
}

/** Sends a test message to a user's message centre (E2-3). Only the fields in use are sent. */
export function sendTestMessage(m: TestMessage, f?: typeof fetch) {
  const { linkId, ...rest } = m;
  return api<Message>('/dev/message', m.linkType === 'payment' ? { ...rest, linkId } : rest, f);
}

export const MESSAGE_ROLE_OPTIONS = [
  { value: '', label: 'Either role' },
  { value: 'owner', label: 'Owner' },
  { value: 'caregiver', label: 'Caregiver' },
];

export const LINK_OPTIONS = [
  { value: '', label: 'No link' },
  { value: 'caregiver_application', label: 'Their caregiver application' },
  { value: 'payment', label: 'A payment (enter its id)' },
];

/** Stand-in for a real booking request (E2-5 until E6-1): alerts an approved caregiver. */
export const sendRequestAlert = (phone: string, r: RequestAlert, f?: typeof fetch) => api<AlertSent>('/dev/request-alert', { phone, ...r }, f);
export const alertLog = (phone: string, f?: typeof fetch) => api<AlertLogRow[]>(`/dev/alerts?phone=${encodeURIComponent(phone)}`, undefined, f);
export const runDueAlerts = (f?: typeof fetch) => api<{ sent: number }>('/dev/run-alerts', {}, f);
export const setWhatsappUnreachable = (phone: string, unreachable: boolean, f?: typeof fetch) =>
  api<{ phone: string; unreachable: boolean }>('/dev/whatsapp-unreachable', { phone, unreachable }, f);

const CHANNEL = { push: 'Push', whatsapp: 'WhatsApp', sms: 'SMS' } as const;
/** "Push sent · WhatsApp sent" for a toast. */
export const alertSummary = (sent: AlertSent) => sent.results.map((r) => `${CHANNEL[r.channel]} ${r.status}`).join(' · ');

/** Stand-in for a booked order (E4-5 until E6): a visit on an approved caregiver's schedule. */
export const addTestVisit = (phone: string, date: string, start: number, minutes: number, f?: typeof fetch) =>
  api<BookedVisit>('/dev/test-visit', { phone, date, start, minutes }, f);

/** Start times for the test visit: every half hour in service hours. */
export const START_OPTIONS = Array.from({ length: (DAY_END - DAY_START) / 30 + 1 }, (_, i) => DAY_START + i * 30).map((value) => ({ value, label: timeText(value) }));

/** E14-3: start the waiting rule version today. */
/** E15-3 (R61-5): a test error from the server, and a test money alert to the support number. */
export const sendTestError = (f?: typeof fetch) => api<TestErrorResult>('/dev/monitor/test-error', {}, f);
export const sendTestMoneyAlert = (f?: typeof fetch) => api<TestAlertResult>('/dev/monitor/test-alert', {}, f);

export const startRulesNow = (f?: typeof fetch) => api<{ version: string | null }>('/dev/rules/start-now', {}, f);

/** E13-1 (R53-6): settle an order now instead of waiting for the 10-minute check. */
export const settleOrderNow = (number: string, f?: typeof fetch) => api<SettleResult>('/dev/order-settled', { number: number.trim().toUpperCase() }, f);
/** E13-1: mark every visit not final yet as done and confirmed, so the order can settle. */
export const finishOrderVisits = (number: string, f?: typeof fetch) =>
  api<{ number: string; finished: number }>('/dev/order-finish', { number: number.trim().toUpperCase() }, f);

/** "Paying · RM74.80 to the caregiver" */
export const settleResultText = (r: Pick<SettleResult, 'state' | 'amountSen'>) =>
  r.state === 'nothing' ? SETTLEMENT_STATE_LABEL.nothing : `${SETTLEMENT_STATE_LABEL[r.state]} · ${formatRM(r.amountSen)} to the caregiver`;

/** Makes an open request's deadline pass now (E6-1), to see it move to History. */
export const expireRequest = (number: string, f?: typeof fetch) => api<{ number: string }>('/dev/request-expire', { number: number.trim().toUpperCase() }, f);

/** R35-7: one visit of an accepted order starts in 10 minutes, so "I've arrived" can be tested now (E8-3). */
/** R40-2: make a sent report 12 h old, then run the auto-confirm. */
export const reportDue = (number: string, visit: number, f?: typeof fetch) =>
  api<{ number: string; confirmed: number }>('/dev/report-due', { number: number.trim().toUpperCase(), index: visit - 1 }, f);

/** E11-4: as if minutes had passed for a visit (its start, arrival and entry move earlier), to test waiting and overtime. */
export const visitShift = (number: string, visit: number, minutes: number, f?: typeof fetch) =>
  api<{ number: string; start: number }>('/dev/visit-shift', { number: number.trim().toUpperCase(), index: visit - 1, minutes }, f);

export const visitSoon = (number: string, visit: number, f?: typeof fetch) =>
  api<{ number: string; date: string; start: number }>('/dev/visit-soon', { number: number.trim().toUpperCase(), index: visit - 1 }, f);
