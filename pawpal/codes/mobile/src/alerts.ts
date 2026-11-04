import type { AlertResult } from '@pawpal/shared';

/** Can this browser get push alerts? iPhone needs PawPal on the Home Screen first (iOS 16.4+). */
export type PushSupport = 'unsupported' | 'install-first' | 'blocked' | 'available';

export function pushSupport(env: { userAgent: string; standalone: boolean; hasServiceWorker: boolean; hasPush: boolean; permission: string | null }): PushSupport {
  const ios = /iPhone|iPad|iPod/.test(env.userAgent);
  if (ios && !env.standalone) return 'install-first';
  if (!env.hasServiceWorker || !env.hasPush || env.permission === null) return 'unsupported';
  if (env.permission === 'denied') return 'blocked';
  return 'available';
}

export const PUSH_HINT: Record<Exclude<PushSupport, 'available'>, string> = {
  unsupported: 'This browser cannot show alerts. Use Chrome on Android, or add PawPal to your Home Screen.',
  'install-first': 'On iPhone, add PawPal to your Home Screen first (Share → Add to Home Screen), then open it from there.',
  blocked: 'Notifications are blocked. Allow them for PawPal in your browser settings.',
};

/** VAPID key (base64url) → bytes for pushManager.subscribe. */
export function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const CHANNEL: Record<AlertResult['channel'], string> = { push: 'Push', whatsapp: 'WhatsApp', sms: 'SMS' };
const STATUS: Record<AlertResult['status'], string> = { sent: 'sent', failed: 'failed', skipped: 'off' };

/** "Push: sent · WhatsApp: sent" — one entry per channel, the best result wins (any device sent = sent). */
export function resultSummary(results: AlertResult[]): string {
  const best = new Map<AlertResult['channel'], AlertResult['status']>();
  const rank = { sent: 3, failed: 2, skipped: 1 } as const;
  for (const r of results) if (rank[r.status] > rank[best.get(r.channel) ?? 'skipped'] || !best.has(r.channel)) best.set(r.channel, r.status);
  return [...best].map(([c, s]) => `${CHANNEL[c]}: ${STATUS[s]}`).join(' · ');
}

/** Why a channel failed, one line each, for the person testing ("Push: connect ETIMEDOUT ..."). */
export const failureDetails = (results: AlertResult[]): string[] =>
  results.filter((r) => r.status === 'failed').map((r) => `${CHANNEL[r.channel]}: ${r.detail}`);
