import { describe, expect, it } from 'vitest';
import type { Message, User } from '@pawpal/shared';
import { actionLabel, badgeText, linkPage, roleTag, switchUrl, timeAgo } from './messages';

const user: User = { id: 1, phone: '+60123456789', caregiverStatus: 'approved', activeRole: 'owner' };
const msg = (role: Message['role']): Message => ({ id: 7, role, category: 'order', title: 't', body: 'b', link: null, createdAt: '2026-10-26 10:00:00.000', readAt: null });

describe('message centre helpers', () => {
  it('badge', () => {
    expect([0, 1, 99, 100].map(badgeText)).toEqual(['', '1', '99', '99+']);
  });

  it('time ago in Malaysia time', () => {
    const now = Date.parse('2026-10-26T10:00:00+08:00');
    expect(timeAgo('2026-10-26 10:00:00.000', now)).toBe('Just now');
    expect(timeAgo('2026-10-26 09:50:00.000', now)).toBe('10 min ago');
    expect(timeAgo('2026-10-26 07:00:00.000', now)).toBe('3 h ago');
    expect(timeAgo('2026-10-25 09:00:00.000', now)).toBe('1 day ago');
    expect(timeAgo('2026-10-23 09:00:00.000', now)).toBe('3 days ago');
    expect(timeAgo('2026-10-01 09:00:00.000', now)).toBe('2026-10-01');
  });

  it('role tag and action', () => {
    expect(roleTag(null)).toBe('');
    expect(roleTag('caregiver')).toBe('Caregiver');
    expect(actionLabel(user, msg(null))).toBe('View ›');
    expect(actionLabel(user, msg('caregiver'))).toBe('Switch to Caregiver and view ›');
    expect(actionLabel({ ...user, caregiverStatus: 'none' }, msg('caregiver'))).toBe('View ›');
  });

  it('switch link comes back to the message', () => {
    expect(switchUrl('caregiver', 7)).toBe('/pages/role/index?role=caregiver&redirect=%2Fpages%2Fmessages%2Fview%3Fid%3D7');
  });
});

describe('E3-3 message links', () => {
  it('a pet decision opens the pet status; other links stay on the message', () => {
    expect(linkPage({ type: 'pet', id: 5, gone: false })).toBe('/pages/pets/status?id=5');
    expect(linkPage({ type: 'pet', id: 5, gone: true })).toBeNull();
    expect(linkPage({ type: 'caregiver_application', id: 1, gone: false })).toBe('/pages/apply/status');
    expect(linkPage({ type: 'payment', id: 5, gone: false })).toBeNull();
    expect(linkPage({ type: 'order', id: 9, gone: false })).toBe('/pages/orders/detail?id=9');
    expect(linkPage({ type: 'request', id: 9, gone: false })).toBe('/pages/caregiver/request?id=9');
    expect(linkPage(null)).toBeNull();
  });
});
