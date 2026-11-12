import { describe, expect, it } from 'vitest';
import { creditBackText, dayMonthText, refundReason, refundStateText, refundSummaryText, refundTotals, type RefundLine } from './refunds';

describe('E10-3 track refunds', () => {
  const line = (amountSen: number, state: RefundLine['state']): RefundLine => ({ key: 'v0', reason: 'Visit 1 cancelled', amountSen, state, doneAt: state === 'refunded' ? '2026-11-08 13:20:00.000' : null });

  it('shows each refund without ever saying failed (R44-3)', () => {
    expect(refundStateText(line(100, 'on_its_way'))).toBe('On its way');
    expect(refundStateText(line(100, 'refunded'))).toBe('Refunded 8 Nov');
    expect(refundStateText(line(100, 'processing'))).toBe('Being processed');
    expect(dayMonthText('2026-01-31 00:00:00')).toBe('31 Jan');
  });

  it('names why the money comes back (R44-3)', () => {
    expect(refundReason('v0', 'cancelled')).toBe('Visit 1 cancelled');
    expect(refundReason('v2', null)).toBe('Visit 3 cancelled');
    expect(refundReason('full-5', 'withdrawn')).toBe('Withdrawn');
    expect(refundReason('full-5', 'rejected')).toBe('Not accepted');
    expect(refundReason('full-5', 'timeout')).toBe('Not accepted');
    expect(refundReason('full-5', 'late_payment')).toBe('Could not go ahead');
  });

  it('adds up due, refunded and on its way; credit apart (R44-2)', () => {
    const t = refundTotals([line(2000, 'refunded'), line(1500, 'on_its_way'), line(500, 'processing')]);
    expect(t).toEqual({ dueSen: 4000, refundedSen: 2000, onItsWaySen: 2000 });
    expect(refundSummaryText(t)).toBe('Due RM40 · Refunded RM20 · On its way RM20');
    expect(creditBackText(1000)).toBe('RM10 came back as credit.');
    expect(creditBackText(0)).toBeNull();
  });
});
