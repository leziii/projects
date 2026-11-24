import type { App } from 'vue';
import * as Sentry from '@sentry/vue';
import { scrubEvent } from '@pawpal/shared';

/** E15-3 (R61-1): what admin sends to Sentry. No user, no request bodies; phone, address and IC numbers taken out. */
export function sentryOptions(dsn: string) {
  return {
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: <E extends { user?: unknown }>(event: E): E => {
      delete event.user;
      return scrubEvent(event);
    },
    beforeBreadcrumb: <B>(b: B): B => scrubEvent(b),
  };
}

let on = false;

/** Off unless VITE_SENTRY_DSN is set when admin is built. */
export function initSentry(app: App, dsn: string | undefined): boolean {
  if (!dsn?.trim()) return false;
  Sentry.init({ app, ...sentryOptions(dsn.trim()) });
  on = true;
  return true;
}

export const sentryOn = () => on;

/** R61-5: a test error from this browser, when Sentry is on. */
export const sendBrowserTestError = (message: string) => (on ? Sentry.captureException(new Error(`${message} (admin)`)) : null);
