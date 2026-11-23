import { describe, expect, it } from 'vitest';
import { expectedIncome, expectedSettlement, lineMath, settleBlocker, settleOrder, settlementStatusText, visitCountText, type SettleVisit } from './settlements';

const v = (status: SettleVisit['status'], extra: Partial<SettleVisit> = {}): SettleVisit => ({ priceSen: 4000, status, cancelPercent: null, decision: null, ...extra });

describe('E13-1 settlement', () => {
  it('pays 85% of the full price, 100% of waiting, 85% of overtime used (R53-2)', () => {
    const s = settleOrder([v('confirmed'), v('confirmed', { priceSen: 5000 })], [
      { index: 0, kind: 'waiting', usedSen: 1000 },
      { index: 1, kind: 'overtime', usedSen: 1500 },
      { index: 1, kind: 'overtime', usedSen: 0 },
    ]);
    expect(s.lines.map((l) => [l.label, l.grossSen, l.caregiverSen])).toEqual([
      ['Visit 1 service', 4000, 3400],
      ['Visit 2 service', 5000, 4250],
      ['Visit 1 waiting fee', 1000, 1000],
      ['Visit 2 overtime', 1500, 1275],
    ]);
    expect(s).toMatchObject({ grossSen: 11500, caregiverSen: 9925 });
  });

  it('cancelled, decided and moved visits (R53-2, R53-3)', () => {
    const s = settleOrder(
      [
        v('cancelled', { cancelPercent: 80 }),
        v('cancelled', { cancelPercent: 100 }),
        v('closed', { decision: { fault: 'owner', refundPercent: 0 } }),
        v('closed', { decision: { fault: 'caregiver', refundPercent: 100 } }),
        v('closed', { decision: { fault: 'mismatch', refundPercent: 50 } }),
        v('closed', { decision: { fault: 'no_substitute', refundPercent: 100 } }),
        v('moved'),
      ],
      [],
    );
    expect(s.lines.map((l) => [l.kind, l.grossSen, l.caregiverSen])).toEqual([
      ['cancel_kept', 800, 680],
      ['cancel_kept', 0, 0],
      ['no_handover', 4000, 2000],
      ['caregiver_fault', 0, 0],
      ['decision', 2000, 1700],
      ['caregiver_fault', 0, 0],
      ['moved', 0, 0],
    ]);
    expect(s.caregiverSen).toBe(4380);
    expect(() => settleOrder([v('report_sent')], [])).toThrow('Visit 1 is not final');
  });

  it('says why an order cannot settle yet (R53-1)', () => {
    const ok = { statuses: ['confirmed', 'cancelled'] as SettleVisit['status'][], openProblem: false, openFee: false, refundsDone: true };
    expect(settleBlocker(ok)).toBeNull();
    expect(settleBlocker({ ...ok, statuses: ['confirmed', 'disputed'] })).toEqual({ state: 'frozen', reason: 'A problem or dispute is still open' });
    expect(settleBlocker({ ...ok, openProblem: true })?.state).toBe('frozen');
    expect(settleBlocker({ ...ok, statuses: ['confirmed', 'report_sent'] })).toEqual({ state: 'pending', reason: 'Visit 2 is not final yet' });
    expect(settleBlocker({ ...ok, openFee: true })?.reason).toBe('An extra fee is still waiting for the owner');
    expect(settleBlocker({ ...ok, refundsDone: false })?.reason).toBe('A refund has not landed yet');
  });
});

describe('E13-2 income', () => {
  it('expects 85% of visits still on and the settled value of final ones (R54-2)', () => {
    expect(expectedIncome([v('todo'), v('report_sent'), v('cancelled', { cancelPercent: 100 })], [{ index: 0, kind: 'waiting', usedSen: 500 }])).toBe(3400 + 3400 + 0 + 500);
    expect(visitCountText(1)).toBe('1 visit');
    expect(visitCountText(3)).toBe('3 visits');
  });
});

describe('E13-3 detail', () => {
  it('shows the sum of each line and the status (R55-2, R55-3)', () => {
    expect(lineMath({ kind: 'service', grossSen: 4000, caregiverSen: 3400 })).toBe('RM40 × 85% = RM34');
    expect(lineMath({ kind: 'no_handover', grossSen: 4000, caregiverSen: 2000 })).toBe('RM40 × 50% = RM20');
    expect(lineMath({ kind: 'waiting', grossSen: 1000, caregiverSen: 1000 })).toBe('RM10 (100%)');
    expect(lineMath({ kind: 'moved', grossSen: 0, caregiverSen: 0 })).toBe('no income');
    expect(expectedSettlement([v('todo'), v('cancelled', { cancelPercent: 100 })], []).lines.map((l) => l.label)).toEqual(['Visit 1 service', 'Visit 2 cancelled · kept part']);
    expect(settlementStatusText({ state: 'pending', reason: 'Visit 2 is not final yet', payout: null })).toBe('Pending: Visit 2 is not final yet');
    expect(settlementStatusText({ state: 'frozen', reason: null, payout: null })).toBe('Frozen: a problem is open');
    expect(settlementStatusText({ state: 'paid', reason: null, payout: { amountSen: 3400, state: 'paid', at: '2026-11-20 10:00:00.000' } })).toBe('Paid Fri 20 Nov');
    expect(settlementStatusText({ state: 'failed', reason: null, payout: null })).toBe('Payout failed · we are fixing it');
  });
});
