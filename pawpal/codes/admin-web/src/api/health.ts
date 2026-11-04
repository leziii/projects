import type { HealthReport } from '@pawpal/shared';

export async function fetchHealth(fetcher: typeof fetch = fetch): Promise<HealthReport | null> {
  try {
    const res = await fetcher('/api/health');
    return res.ok ? ((await res.json()) as HealthReport) : null;
  } catch {
    return null;
  }
}

export function healthLabel(h: HealthReport | null): string {
  if (!h) return 'Server not reachable';
  return h.status === 'ok' ? 'All systems OK' : `Degraded (database ${h.database}, Redis ${h.redis})`;
}
