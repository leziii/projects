import type { App } from 'vue';
import * as Sentry from '@sentry/vue';
import { scrubEvent } from '@pawpal/shared';

/** E15-3 (R61-1): what the app sends to Sentry. No user, no request bodies; phone, address and IC numbers taken out. */
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

/** Off unless VITE_SENTRY_DSN is set when the app is built. */
export function initSentry(app: App, dsn: string | undefined): boolean {
  if (!dsn?.trim() || typeof window === 'undefined') return false;
  Sentry.init({ app, ...sentryOptions(dsn.trim()) });
  return true;
}
