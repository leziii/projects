import { describe, expect, it } from 'vitest';
import { actorLabel, checkReason } from './history';

describe('status history rules', () => {
  it('needs a reason for every change', () => {
    expect(checkReason({ type: 'system' }, ' Created ')).toBe('Created');
    expect(() => checkReason({ type: 'system' }, '')).toThrow('Every status change needs a reason');
    expect(() => checkReason({ type: 'gateway' }, undefined)).toThrow('Every status change needs a reason');
  });

  it('needs a real reason from an admin', () => {
    expect(() => checkReason({ type: 'admin', id: 'kf' }, 'ok')).toThrow('Admin changes need a reason (at least 5 characters)');
    expect(checkReason({ type: 'admin', id: 'kf' }, 'Owner called, refund agreed')).toBe('Owner called, refund agreed');
  });

  it('limits the reason length', () => {
    expect(() => checkReason({ type: 'system' }, 'x'.repeat(256))).toThrow('at most 255');
    expect(checkReason({ type: 'system' }, 'x'.repeat(255))).toHaveLength(255);
  });

  it('labels the actor', () => {
    expect(actorLabel('admin', 'kf')).toBe('Admin (kf)');
    expect(actorLabel('gateway', null)).toBe('Gateway');
  });
});
