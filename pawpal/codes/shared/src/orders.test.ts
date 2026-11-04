import { describe, expect, it } from 'vitest';
import type { BookingDraft } from './booking';
import { cancelPolicyText, deadlineText, orderNumber, payProblems, payResult, rebookNote, canRebook, withdrawConfirmText } from './orders';

const ready = {
  summary: { lines: [], total: 4000, blocks: [], waitsForCheck: [] },
  caregiver: { id: 3, displayName: 'Siti A.' },
  caregiverNote: null,
  entry: { method: 'pre_authorised', keyLock: 'Code 1', guard: '', notes: '' },
} as unknown as BookingDraft;

describe('confirm and pay (E5-4)', () => {
  it('order number and cancel policy', () => {
    expect(orderNumber(new Date('2026-10-31T17:00:00Z'), 7)).toBe('P20261101007');
    expect(cancelPolicyText()).toEqual(['24 h or more before a visit: 100% back', '1 h to under 24 h: 80% back', 'Under 1 h: no refund']);
  });

  it('what stops payment', () => {
    expect(payProblems(ready)).toEqual([]);
    expect(payProblems({ ...ready, summary: { ...ready.summary, waitsForCheck: ['Rex'] } })).toEqual([{ text: 'Rex: still being checked. You can pay once approved', fix: 'pets' }]);
    expect(payProblems({ ...ready, caregiver: null, entry: null }).map((p) => p.fix)).toEqual(['caregiver', 'entry']);
    expect(payProblems({ ...ready, summary: { ...ready.summary, blocks: ['Add at least one visit'] } })[0]).toEqual({ text: 'Add at least one visit', fix: 'setup' });
  });

  it('result after paying (O11)', () => {
    const now = new Date('2026-10-31T02:00:00Z'); // 10:00 am in KL
    const base = { paySen: 9000, refundSen: 0, acceptDeadline: null, caregiver: { displayName: 'Siti A.' }, payment: null };
    const paid = payResult({ ...base, status: 'pending_accept', acceptDeadline: '2026-10-31 13:00:00.000' }, now);
    expect(paid).toMatchObject({ title: 'Paid RM90', tone: 'ok', retry: false, polling: false });
    // R27-4: a live countdown, with the time it ends.
    expect(paid.body).toBe('Siti A. has 3 h 0 min left to accept (until 1:00 pm today). Paid is not accepted. The caregiver must accept the whole order in time.');
    expect(payResult({ ...base, status: 'pending_accept', acceptDeadline: '2026-10-31 10:24:00.000' }, now).body).toMatch(/^Siti A\. has 24 min left to accept/);
    // At 0 the server fails and refunds within 30 s: keep asking.
    expect(payResult({ ...base, status: 'pending_accept', acceptDeadline: '2026-10-31 10:00:00.000' }, now)).toMatchObject({ body: "Siti A.'s time to accept is up. Checking…", polling: true, tone: 'wait' });
    expect(payResult({ ...base, status: 'failed', endReason: 'timeout', refundSen: 9000 }, now)).toMatchObject({
      title: 'Not accepted',
      body: 'Siti A. did not answer in time. RM90 is refunded in full. You can book again with another caregiver.',
    });
    // R28-5: withdrawn by the owner, with or without the refund showing yet.
    expect(payResult({ ...base, status: 'cancelled', endReason: 'withdrawn', refundSen: 9000 }, now)).toEqual({ title: 'Booking withdrawn', body: 'You withdrew this booking. RM90 is refunded in full.', tone: 'bad', retry: false, polling: false });
    expect(payResult({ ...base, status: 'cancelled', endReason: 'withdrawn', refundSen: 0 }, now).body).toBe('You withdrew this booking. A full refund is on its way.');
    expect(withdrawConfirmText(9000)).toBe('Withdraw this booking? RM90 will be refunded in full.');
    const failedPay = payResult({ ...base, status: 'awaiting_payment', payment: { id: 1, status: 'failed', method: 'tng', failureReason: 'Card declined' } }, now);
    expect(failedPay).toEqual({ title: 'Payment failed', body: 'Card declined. Nothing was charged. You can try again.', tone: 'bad', retry: true, polling: false });
    const checking = { ...base, status: 'awaiting_payment' as const, payment: { id: 1, status: 'checking' as const, method: 'tng' as const, failureReason: null } };
    expect(payResult(checking, now)).toMatchObject({ title: 'Checking your payment', polling: true });
    expect(payResult(checking, now, true)).toMatchObject({ title: 'Still checking', polling: false, body: 'Still checking. We will message you when we know. Pull down to check again.' });
    expect(payResult({ ...base, status: 'accepted' }, now)).toMatchObject({ title: 'Booked', tone: 'ok', body: 'Siti A. accepted your booking. You will find the visits in your orders.' });
    expect(payResult({ ...base, status: 'failed', endReason: 'rejected', refundSen: 9000 }, now)).toMatchObject({
      title: 'Not accepted',
      tone: 'bad',
      body: 'Siti A. could not take this booking. RM90 is refunded in full. You can book again with another caregiver.',
    });
    expect(payResult({ ...base, status: 'failed', refundSen: 9000 }, now).body).toBe('The payment came in when your first visit was less than 3 hours away, so there is no time to accept. RM90 is refunded in full.');
    expect(payResult({ ...base, status: 'cancelled', refundSen: 9000 }, now).body).toBe('This order was replaced when the booking changed. RM90 is refunded in full.');
  });

  it('deadline text', () => {
    const now = new Date('2026-10-31T15:30:00Z'); // 11:30 pm in KL
    expect(deadlineText('2026-10-31 23:59:00.000', now)).toBe('11:59 pm today');
    expect(deadlineText('2026-11-01 02:30:00.000', now)).toBe('2:30 am tomorrow');
    expect(deadlineText('2026-11-03 09:00:00.000', now)).toMatch(/^9:00 am, /);
  });
});

describe('E6-5 book again', () => {
  it('is offered only after a failed, refused, timed-out or withdrawn order (R29-1)', () => {
    expect(canRebook({ status: 'failed', endReason: 'timeout' })).toBe(true);
    expect(canRebook({ status: 'failed', endReason: 'rejected' })).toBe(true);
    expect(canRebook({ status: 'failed', endReason: 'too_late' })).toBe(true);
    expect(canRebook({ status: 'cancelled', endReason: 'withdrawn' })).toBe(true);
    expect(canRebook({ status: 'cancelled', endReason: null })).toBe(false);
    expect(canRebook({ status: 'accepted', endReason: null })).toBe(false);
    expect(canRebook({ status: 'pending_accept', endReason: null })).toBe(false);
  });

  it('says what was copied and what was left out (R29-4)', () => {
    expect(rebookNote('P1', 0, 2)).toBe('Copied from order P1. Choose a caregiver again.');
    expect(rebookNote('P1', 1, 1)).toBe('Copied from order P1. 1 visit was in the past and was removed. Choose a caregiver again.');
    expect(rebookNote('P1', 2, 1)).toBe('Copied from order P1. 2 visits were in the past and were removed. Choose a caregiver again.');
    expect(rebookNote('P1', 2, 0)).toBe('Copied from order P1. All the visits were in the past, so pick new dates. Choose a caregiver again.');
  });
});
