import webpush from 'web-push';

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  /** App page to open when the notification is tapped. */
  url: string;
}

/** Outcome of one push: ok, gone (the browser removed it: forget the subscription), or failed. */
export type PushOutcome = { ok: true } | { ok: false; gone: boolean; detail: string };

/**
 * Endpoints on this host never leave the server: automated tests use them instead of a real browser push service.
 * Refused in production.
 */
export const TEST_PUSH_HOST = 'https://push.test.pawpal/';

export class PushSender {
  /** What test endpoints received, newest last (development only). */
  readonly testInbox = new Map<string, PushPayload[]>();

  constructor(
    private readonly keys: { publicKey: string; privateKey: string },
    private readonly production: boolean,
    /** e.g. http://proxy.local:8080 — for networks where the server must go through a proxy to reach the internet. */
    private readonly proxy?: string,
  ) {}

  get publicKey(): string {
    return this.keys.publicKey;
  }

  async send(target: PushTarget, payload: PushPayload): Promise<PushOutcome> {
    if (target.endpoint.startsWith(TEST_PUSH_HOST)) {
      if (this.production) return { ok: false, gone: true, detail: 'Test endpoints are not allowed in production' };
      this.testInbox.set(target.endpoint, [...(this.testInbox.get(target.endpoint) ?? []), payload]);
      return { ok: true };
    }
    try {
      await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, JSON.stringify(payload), {
        vapidDetails: { subject: 'mailto:support@pawpal.my', publicKey: this.keys.publicKey, privateKey: this.keys.privateKey },
        TTL: 30 * 60,
        urgency: 'high',
        ...(this.proxy ? { proxy: this.proxy } : {}),
      });
      return { ok: true };
    } catch (err) {
      const { statusCode: status, body } = err as { statusCode?: number; body?: string };
      const reason = String(body ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
      return {
        ok: false,
        gone: status === 404 || status === 410,
        // e.g. "Push service said 403: invalid JWT" or "connect ETIMEDOUT 142.250.4.95:443" (the server cannot reach the push service)
        detail: status ? `Push service said ${status}${reason ? `: ${reason}` : ''}` : networkError(err),
      };
    }
  }
}

/**
 * A readable reason when the push service could not be reached at all. Node reports a failed connection
 * to every address as an AggregateError with an empty message, so read its code and inner errors.
 */
export function networkError(err: unknown): string {
  const e = err as { message?: string; code?: string; errors?: { message?: string; code?: string }[] };
  const inner = (e.errors ?? []).map((x) => x.message || x.code).filter(Boolean);
  const text = [e.message, e.code, ...inner].filter(Boolean).join(' · ');
  return `Cannot reach the push service${text ? `: ${text}` : ''}`.slice(0, 250);
}

export const newVapidKeys = () => webpush.generateVAPIDKeys();
