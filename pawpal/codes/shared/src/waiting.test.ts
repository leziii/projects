import { describe, expect, it } from 'vitest';
import { WAITING_RULE_TEXT, canRequestWaiting, waitingFeeSen, waitingState, waitingText } from './waiting';

describe('E11-1 waiting', () => {
  it('charges per started 10 min after 10 free, capped at RM25 (R45-3)', () => {
    expect([0, 10, 11, 20, 21, 59, 60, 75].map(waitingFeeSen)).toEqual([0, 0, 500, 500, 1000, 2500, 2500, 2500]);
    expect(WAITING_RULE_TEXT).toBe('First 10 min free, then RM5 per started 10 min, up to 60 min / RM25.');
  });

  // Visit at 9:00 am KL on 10 Nov = 01:00 UTC.
  const v = { date: '2026-11-10', start: 540, arrivedAt: '2026-11-10 08:50:00.000', enteredAt: null as string | null };
  const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00+08:00`);

  it('counts from the booked start when early, from arrival when late (R45-2)', () => {
    expect(waitingText(waitingState(v, at('08:55')))).toBe('Waiting starts at 9:00 am, the booked start');
    expect(waitingText(waitingState(v, at('09:06')))).toBe('Waiting 6 min · free for the first 10 min');
    expect(waitingText(waitingState(v, at('09:11')))).toBe('Waiting 11 min · RM5 so far');
    expect(waitingText(waitingState(v, at('10:15')))).toBe('Waiting limit reached · 60 min · RM25');
    const late = { ...v, arrivedAt: '2026-11-10 09:20:00.000' };
    expect(waitingState(late, at('09:31')).minutes).toBe(11);
  });

  it('stops when the caregiver is let in (R45-2)', () => {
    const s = waitingState({ ...v, enteredAt: '2026-11-10 09:14:30.000' }, at('11:00'));
    expect(waitingText(s)).toBe('Waited 14 min · RM5');
    // Let in before the booked start: nothing to pay.
    expect(waitingText(waitingState({ ...v, enteredAt: '2026-11-10 08:58:00.000' }, at('11:00')))).toBe('Waited 0 min · free');
  });

  it('only after arriving and once (R45-1)', () => {
    expect(canRequestWaiting({ status: 'arrived', waitingAt: null })).toBe(true);
    expect(canRequestWaiting({ status: 'arrived', waitingAt: '2026-11-10 09:01:00' })).toBe(false);
    expect(canRequestWaiting({ status: 'todo', waitingAt: null })).toBe(false);
    expect(canRequestWaiting({ status: 'in_service', waitingAt: null })).toBe(false);
  });
});
