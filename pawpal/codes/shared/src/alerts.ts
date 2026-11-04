/**
 * Urgent alerts (E2-5, rule R4-1): a new booking request reaches the caregiver by web push AND by WhatsApp
 * (SMS when WhatsApp fails), plus a reminder 10 minutes before the deadline. Alerts never contain an address;
 * each one also lands in the message centre (C02), which links to the latest state.
 */
import { checkMessageText } from './messages';

export type AlertChannel = 'push' | 'whatsapp' | 'sms';
export type AlertKind = 'new_request' | 'deadline_reminder' | 'test';
export type AlertStatus = 'sent' | 'failed' | 'skipped';

export const ALERT_RULES = {
  /** Reminder this many minutes before the request's deadline. */
  reminderMinutesBefore: 10,
  /** New-request alerts must go out within this time (story test). */
  sendWithinSeconds: 60,
  /** How often the server looks for due reminders. */
  workerEverySeconds: 15,
} as const;

export interface AlertResult {
  channel: AlertChannel;
  status: AlertStatus;
  detail: string;
}

export interface AlertSent {
  messageId: number;
  results: AlertResult[];
  reminderAt: string | null;
}

export interface AlertLogRow extends AlertResult {
  id: number;
  phone: string;
  kind: AlertKind;
  text: string;
  createdAt: string;
}

export interface AlertSettings {
  /** VAPID public key the browser needs to subscribe to push. */
  vapidPublicKey: string;
  /** Browsers/phones of this account with push turned on. */
  pushDevices: number;
  /** WhatsApp/SMS alerts to the account's phone. */
  textAlerts: boolean;
}

/** A booking request as an alert describes it: no address, only the area. */
export interface RequestAlert {
  urgent: boolean;
  minutesLeft: number;
  /** "10/28 09:00" */
  firstVisit: string;
  visits: number;
  /** Neighbourhood only, e.g. "Mont Kiara". */
  area: string;
}

const left = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);

/** Title and text for a new request (S06 wording). Checked like every message: short and without an address. */
export function requestAlertText(r: RequestAlert): { title: string; body: string } {
  if (!Number.isInteger(r.minutesLeft) || r.minutesLeft < 1) throw new Error('minutesLeft must be a whole number ≥ 1');
  return checkMessageText({
    title: `${r.urgent ? 'Urgent' : 'New'} booking request · ${left(r.minutesLeft)} left`,
    body: `First visit ${r.firstVisit}, ${r.visits} ${r.visits === 1 ? 'visit' : 'visits'}, ${r.area}. Open PawPal to accept.`,
  });
}

export function reminderAlertText(minutesLeft: number = ALERT_RULES.reminderMinutesBefore): { title: string; body: string } {
  return checkMessageText({ title: `Request closes in ${minutesLeft} min`, body: 'A booking request is still waiting for you. Open PawPal to accept.' });
}

/** When the reminder goes out; null when the deadline is too close for one. */
export function reminderAt(deadline: Date, now: Date = new Date()): Date | null {
  const at = new Date(deadline.getTime() - ALERT_RULES.reminderMinutesBefore * 60_000);
  return at.getTime() > now.getTime() ? at : null;
}

/** Text for WhatsApp/SMS: one line, title then text. */
export const textAlert = (m: { title: string; body: string }) => `PawPal: ${m.title}. ${m.body}`;
