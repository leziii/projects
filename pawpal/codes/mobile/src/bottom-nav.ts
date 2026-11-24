import type { Role } from '@pawpal/shared';
import type { IconName } from '@pawpal/shared';

export interface NavTab {
  key: 'home' | 'orders' | 'tasks' | 'messages' | 'me';
  label: string;
  icon: IconName;
  url: string;
}

/** The bottom navigation bar: four tabs, the first two depend on the role in use. */
export function navTabs(role: Role): NavTab[] {
  const first: NavTab[] =
    role === 'caregiver'
      ? [
          { key: 'home', label: 'Home', icon: 'grid', url: '/pages/caregiver/index' },
          { key: 'tasks', label: 'Tasks', icon: 'calendar', url: '/pages/caregiver/tasks' },
        ]
      : [
          { key: 'home', label: 'Home', icon: 'home', url: '/pages/index/index' },
          { key: 'orders', label: 'Orders', icon: 'orders', url: '/pages/orders/index' },
        ];
  return [...first, { key: 'messages', label: 'Messages', icon: 'messages', url: '/pages/messages/index' }, { key: 'me', label: 'Me', icon: 'me', url: '/pages/me/index' }];
}
