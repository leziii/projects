import { describe, expect, it } from 'vitest';
import { arriveFromText, arrivedText, canArrive, enteredText, entryFromOf, entryFromText, entryLockedText, entryOpen, taskDates, taskGap, taskPets, taskTime, visitServiceText, type Task } from './tasks';

const t = (start: number, minutes = 45, status: Task['status'] = 'todo'): Task => ({ orderId: 1, index: 0, number: 'P1', date: '2026-11-04', start, minutes, area: 'Bangsar', pets: [{ name: 'Mimi', kind: 'cat' }, { name: 'Bobo', kind: 'dog' }], status, arrivedAt: null, enteredAt: null, enteredBy: null });

describe('E8-1 my tasks', () => {
  it('lists 14 days from today in KL (R33-2)', () => {
    const days = taskDates(new Date('2026-11-03T17:00:00Z')); // 1 am on 4 Nov in KL
    expect(days).toHaveLength(14);
    expect(days[0]).toBe('2026-11-04');
    expect(days[13]).toBe('2026-11-17');
  });

  it('shows time and pets (R33-3)', () => {
    expect(taskTime(t(540))).toBe('9:00 – 9:45 am');
    expect(taskTime(t(690))).toBe('11:30 am – 12:15 pm');
    expect(taskPets(t(540))).toBe('Mimi, Bobo · 1 dog, 1 cat');
  });

  it('shows the gap, red when under the buffer (R33-4)', () => {
    expect(taskGap(t(540), t(615), 30)).toEqual({ text: '30 min gap', tight: false });
    expect(taskGap(t(540), t(840), 30)).toEqual({ text: '4 h 15 min gap', tight: false });
    expect(taskGap(t(540), t(645), 30)).toEqual({ text: '1 h gap', tight: false });
    expect(taskGap(t(540), t(605), 30)).toEqual({ text: 'Tight: 20 min', tight: true });
    expect(taskGap(t(540), t(570), 30)).toEqual({ text: 'Tight: 15 min overlap', tight: true });
    expect(taskGap(t(540), t(615, 45, 'cancelled'), 30)).toBeNull();
  });
});

describe('E8-2 visit details', () => {
  // 9:00 am on 4 Nov in KL = 01:00 UTC.
  const v = t(540);
  it('opens entry instructions 2 h before until the visit ends, never when cancelled (R34-4)', () => {
    expect(entryOpen(v, new Date('2026-11-03T22:59:00Z'))).toBe(false);
    expect(entryOpen(v, new Date('2026-11-03T23:00:00Z'))).toBe(true);
    expect(entryOpen(v, new Date('2026-11-04T01:45:00Z'))).toBe(true);
    expect(entryOpen(v, new Date('2026-11-04T01:46:00Z'))).toBe(false);
    expect(entryOpen({ ...v, status: 'cancelled' }, new Date('2026-11-04T01:00:00Z'))).toBe(false);
  });

  it('says when they open (R34-4)', () => {
    expect(entryFromOf(v)).toBe('2026-11-04 07:00');
    expect(entryFromText('2026-11-04 07:00', new Date('2026-11-03T20:00:00Z'))).toBe('Shown from 7:00 am');
    expect(entryFromText('2026-11-05 07:00', new Date('2026-11-03T20:00:00Z'))).toBe('Shown from 7:00 am, Thu 5 Nov');
    // KF hand test: after the visit it no longer says "Shown from".
    const locked = { ...v, entryFrom: '2026-11-04 07:00' };
    expect(entryLockedText(locked, new Date('2026-11-03T20:00:00Z'))).toBe('Shown from 7:00 am');
    expect(entryLockedText(locked, new Date('2026-11-04T05:00:00Z'))).toBe('Hidden: the visit time has passed');
    expect(visitServiceText({ level: 'basic', minMinutes: 45 })).toBe('Basic care · at least 45 min');
  });
});

describe('E8-3 confirm entry', () => {
  const v = t(540); // 9:00 am on 4 Nov in KL = 01:00 UTC
  it('lets the caregiver arrive from 30 min before until the planned end (R35-2)', () => {
    expect(canArrive(v, new Date('2026-11-04T00:29:00Z'))).toBe(false);
    expect(canArrive(v, new Date('2026-11-04T00:30:00Z'))).toBe(true);
    expect(canArrive(v, new Date('2026-11-04T01:45:00Z'))).toBe(true);
    expect(canArrive(v, new Date('2026-11-04T01:46:00Z'))).toBe(false);
    expect(canArrive({ ...v, status: 'arrived' }, new Date('2026-11-04T01:00:00Z'))).toBe(false);
    expect(arriveFromText(v)).toBe('From 8:30 am');
  });

  it('shows arrival and entry times and who confirmed (R35-5)', () => {
    expect(arrivedText('2026-11-04 08:58:12.000')).toBe('Arrived 8:58 am');
    expect(enteredText('2026-11-04 09:02:00.000', 'owner', 'owner')).toBe('Entered 9:02 am (confirmed by you)');
    expect(enteredText('2026-11-04 09:02:00.000', 'caregiver', 'owner')).toBe('Entered 9:02 am (confirmed by the caregiver)');
    expect(enteredText('2026-11-04 09:02:00.000', 'owner', 'caregiver')).toBe('Entered 9:02 am (confirmed by the owner)');
  });
});
