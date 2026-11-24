import { Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';
import { scrubEvent } from '@pawpal/shared';

const log = new Logger('Sentry');
let enabled = false;

/**
 * E15-3 (R61-1): error tracking. Off unless SENTRY_DSN is set. Every report goes through scrubEvent,
 * so phone numbers, addresses and IC numbers are never sent; request bodies, cookies and IPs are not sent at all.
 */
export function initSentry(dsn: string | undefined, environment: string | undefined): boolean {
  if (!dsn?.trim()) return false;
  Sentry.init({
    dsn: dsn.trim(),
    environment: environment || 'development',
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    beforeSend: (event) => {
      if (event.request) event.request = { method: event.request.method, url: event.request.url?.split('?')[0] };
      delete event.user;
      return scrubEvent(event);
    },
    beforeBreadcrumb: (b) => scrubEvent(b),
  });
  enabled = true;
  log.log('Error tracking is on');
  return true;
}

export const sentryEnabled = () => enabled;

/** Sends the error to Sentry when it is on; always writes it to the server log. Returns the Sentry event id. */
export function captureError(err: unknown): string | null {
  const e = err instanceof Error ? err : new Error(String(err));
  log.error(e.message, e.stack);
  return enabled ? Sentry.captureException(e) : null;
}

/** Waits for reports in flight (the test error) to leave. */
export const flushSentry = () => (enabled ? Sentry.flush(3000) : Promise.resolve(true));
