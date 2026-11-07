import { openCheck, type LinkState, type Message, type MessageCategory, type Role, type User } from '@pawpal/shared';
import { ROLE_LABEL } from './roles';

/** C02 tabs. Account messages appear under All. */
export const MESSAGE_TABS: { key: MessageCategory | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'order', label: 'Orders' },
  { key: 'refund', label: 'Refunds' },
  { key: 'dispute', label: 'Disputes' },
];

/** Unread badge: nothing at 0, "99+" above 99. */
export const badgeText = (unread: number) => (unread <= 0 ? '' : unread > 99 ? '99+' : String(unread));

/** "Just now", "10 min ago", "3 h ago", "2 days ago", then the date. Server times are Malaysia time. */
export function timeAgo(createdAt: string, now = Date.now()): string {
  const at = Date.parse(`${createdAt.replace(' ', 'T')}+08:00`);
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  if (min < 7 * 24 * 60) return `${Math.floor(min / 1440)} days ago`.replace(/^1 days/, '1 day');
  return createdAt.slice(0, 10);
}

/** Role tag on a message ("" when either role can open it). */
export const roleTag = (role: Role | null) => (role ? ROLE_LABEL[role] : '');

/** The action on a list row: open, or switch role first. */
export const actionLabel = (user: User, m: Message) => (openCheck(user, m) === 'switch' ? `Switch to ${ROLE_LABEL[m.role as Role]} and view ›` : 'View ›');

export const messageUrl = (id: number) => `/pages/messages/view?id=${id}`;

/** C04 with the needed role picked; after switching it comes back to the message. */
export const switchUrl = (role: Role, id: number) => `/pages/role/index?role=${role}&redirect=${encodeURIComponent(messageUrl(id))}`;

/** Page that shows the linked item, when the app has one (E3-3: pet decisions open the pet's status; E5-5: orders open the payment result). */
export function linkPage(latest: Pick<LinkState, 'type' | 'id' | 'gone'> | null): string | null {
  if (!latest || latest.gone) return null;
  if (latest.type === 'pet') return `/pages/pets/status?id=${latest.id}`;
  if (latest.type === 'order') return `/pages/orders/detail?id=${latest.id}`;
  if (latest.type === 'request') return `/pages/caregiver/request?id=${latest.id}`;
  if (latest.type === 'report') return `/pages/orders/report?run=${latest.id}`;
  return latest.type === 'caregiver_application' ? '/pages/apply/status' : null;
}
