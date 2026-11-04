import type { HealthReport } from '@pawpal/shared';

const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';

type Getter = (url: string) => Promise<{ statusCode: number; data: unknown }>;

const uniGet: Getter = (url) =>
  new Promise((resolve, reject) =>
    uni.request({ url, success: (r) => resolve({ statusCode: r.statusCode, data: r.data }), fail: reject }),
  );

export async function fetchHealth(get: Getter = uniGet): Promise<HealthReport | null> {
  try {
    const r = await get(`${API_BASE}/api/health`);
    return r.statusCode === 200 ? (r.data as HealthReport) : null;
  } catch {
    return null;
  }
}

export function healthLabel(h: HealthReport | null): string {
  if (!h) return 'Server not reachable';
  return h.status === 'ok' ? 'All systems OK' : 'Some services are down';
}
