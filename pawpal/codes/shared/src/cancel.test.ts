import { describe, expect, it } from 'vitest';
import { canCancelVisit, cancelConfirmText, cancelLineText, cancelledResultText, cancelledText, notCancelledText, cancelLines, creditShares, refundSplitText } from './cancel';
import { NOT_STARTED } from './tasks';

// Visits on 10 Nov 2026 at 9:00 am and 6:00 pm KL; 9 am KL = 01:00 UTC.
const visits = [
  { date: '2026-11-10', start: 540, paidSen: 7000 },
  { date: '2026-11-10', start: 1080, paidSen: 7000 },
  { date: '2026-11-11', start: 540, paidSen: 7000 },
];
const at = (iso: string) => new Date(iso);

describe('E10-1 cancel visits (round 42)', () => {
  it('100 / 80 / 0 % by submit time; started or cancelled visits are blocked (R42-1, R42-3)', () => {
    const runs = [NOT_STARTED, NOT_STARTED, NOT_STARTED];
    // 9 Nov 1:00 am KL: visit 1 is 32 h away, visit 2 41 h.
    expect(cancelLines(visits, 0, runs, at('2026-11-08T17:00:00Z')).map((l) => l.percent)).toEqual([100, 100, 100]);
    // 10 Nov 8:30 am KL: 30 min, 9 h 30, 24 h 30.
    const l = cancelLines(visits, 0, runs, at('2026-11-10T00:30:00Z'));
    expect(l.map((x) => [x.percent, x.refundSen])).toEqual([[0, 0], [80, 5600], [100, 7000]]);
    expect(l.map(cancelLineText)).toEqual(['No refund (under 1 h)', '80% back = RM56', 'Full refund RM70']);
    // Exactly 24 h before visit 3 → 100%.
    expect(cancelLines(visits, 0, runs, at('2026-11-10T01:00:00Z'))[2].percent).toBe(100);
    // Visit 1 time has come: blocked even without "Arrived".
    expect(cancelLines(visits, 0, runs, at('2026-11-10T01:00:00Z'))[0]).toMatchObject({ percent: null, blocked: 'Time has started' });
    const started = cancelLines(visits, 0, [{ status: 'arrived' }, { status: 'cancelled' }, { status: 'confirmed' }], at('2026-11-08T17:00:00Z'));
    expect(started.map((x) => x.blocked)).toEqual(['Caregiver already arrived', 'Cancelled', 'Already done']);
    expect(started.map((x) => notCancelledText(x.blocked!))).toEqual(['Not cancelled: the caregiver has already arrived', 'Not cancelled: it was already cancelled', 'Not cancelled: it has already happened']);
    expect(notCancelledText('Time has started')).toBe('Not cancelled: its time has started');
  });

  it('credit used comes back as credit, in proportion (R42-3)', () => {
    expect(creditShares([7000, 7000, 7000], 1000)).toEqual([334, 333, 333]);
    const l = cancelLines(visits, 1000, [NOT_STARTED, NOT_STARTED, NOT_STARTED], at('2026-11-10T00:30:00Z'));
    expect(l.map((x) => [x.refundSen, x.creditSen])).toEqual([[0, 0], [5600, 266], [7000, 333]]);
    expect(refundSplitText(12600, 599)).toBe('RM120.01 back to how you paid · RM5.99 back as credit');
    expect(refundSplitText(5600, 0)).toBe('RM56 back to how you paid');
    expect(refundSplitText(0, 0)).toBe('No refund');
  });

  it('confirm popup (R42-7)', () => {
    expect(cancelConfirmText(2, 5600)).toBe("Cancel 2 visits? RM56 will be refunded. This can't be undone.");
    expect(cancelConfirmText(1, 0)).toBe("Cancel 1 visit? Nothing will be refunded. This can't be undone.");
  });

  it('cancel button and cancelled line (R42-1, R42-2)', () => {
    const v = visits[0];
    expect(canCancelVisit('accepted', undefined, v, at('2026-11-10T00:59:00Z'))).toBe(true);
    expect(canCancelVisit('accepted', { status: 'arrived' }, v, at('2026-11-09T00:00:00Z'))).toBe(false);
    expect(canCancelVisit('accepted', undefined, v, at('2026-11-10T01:00:00Z'))).toBe(false);
    expect(canCancelVisit('pending_accept', undefined, v, at('2026-11-09T00:00:00Z'))).toBe(false);
    expect(cancelledText({ at: '', percent: 80, refundSen: 5600, creditSen: 0 })).toBe('Cancelled · 80% back = RM56');
    expect(cancelledText({ at: '', percent: 100, refundSen: 7000, creditSen: 0 })).toBe('Cancelled · full refund RM70');
    expect(cancelledText({ at: '', percent: 0, refundSen: 0, creditSen: 0 })).toBe('Cancelled · no refund');
  });

  it('result lines (R43-2, R43-4)', () => {
    const c = { index: 0, percent: 80, refundSen: 5600, creditSen: 0 };
    expect(cancelledResultText({ ...c, refund: 'started' })).toBe('Cancelled · RM56 back');
    expect(cancelledResultText({ ...c, refund: 'processing' })).toBe('Cancelled · RM56 refund being processed');
    expect(cancelledResultText({ ...c, refundSen: 0, refund: 'none' })).toBe('Cancelled · no refund');
  });
});
