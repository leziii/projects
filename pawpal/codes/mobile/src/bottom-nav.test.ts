import { describe, expect, it } from 'vitest';
import { navTabs } from './bottom-nav';

describe('bottom navigation', () => {
  it('owner: home, orders, messages, me', () => {
    expect(navTabs('owner').map((t) => t.url)).toEqual(['/pages/index/index', '/pages/orders/index', '/pages/messages/index', '/pages/me/index']);
  });

  it('caregiver: dashboard, tasks, messages, me', () => {
    expect(navTabs('caregiver').map((t) => t.url)).toEqual(['/pages/caregiver/index', '/pages/caregiver/tasks', '/pages/messages/index', '/pages/me/index']);
  });
});
