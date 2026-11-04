import { describe, expect, it } from 'vitest';
import { landingPath, menuFor, routeDecision } from './session';

describe('admin session and page permissions', () => {
  const all = { pages: ['dashboard', 'caregivers', 'pets', 'rules', 'payments', 'test-tools'] as const };
  const rulesOnly = { pages: ['rules'] as ('rules')[] };

  it('menu shows only allowed pages, in order', () => {
    expect(menuFor({ pages: [...all.pages] }).map((m) => m.label)).toEqual(['Dashboard', 'Caregiver review', 'Pet check', 'Rules', 'Payments (test)', 'Test tools']);
    expect(menuFor(rulesOnly)).toEqual([{ page: 'rules', path: '/rules', label: 'Rules' }]);
  });

  it('route decision', () => {
    expect(routeDecision(null, 'rules')).toBe('login');
    expect(routeDecision(rulesOnly, 'rules')).toBe('ok');
    expect(routeDecision(rulesOnly, 'payments')).toBe('no-access');
    expect(routeDecision(rulesOnly, undefined)).toBe('ok');
  });

  it('lands on the page asked for, if allowed', () => {
    expect(landingPath({ pages: [...all.pages] }, '/payments')).toBe('/payments');
    expect(landingPath(rulesOnly, '/payments')).toBe('/rules');
    expect(landingPath(rulesOnly, undefined)).toBe('/rules');
    expect(landingPath(rulesOnly, 'https://evil.example')).toBe('/rules');
    expect(landingPath(rulesOnly, '/login')).toBe('/rules');
    expect(landingPath({ pages: [] }, undefined)).toBe('/no-access');
  });
});
