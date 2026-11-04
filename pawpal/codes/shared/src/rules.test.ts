import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES as R,
  RuleError,
  acceptWindow,
  canAccept,
  cancelRefund,
  caregiverShare,
  checkBookingPlan,
  formatRM,
  priceList,
  quoteVisit,
  reportConfirmDeadline,
  unusedOvertimeRefund,
  waitingFee,
} from './rules';

const H = 3_600_000;
const M = 60_000;
const at = (iso: string) => new Date(iso);

describe('E1-2 pricing (Brief 2.4: Price, Mixed, Extras)', () => {
  it('cat only: RM40, 30 min, one level', () => {
    expect(quoteVisit(['cat'], 'basic')).toMatchObject({ total: 4000, minMinutes: 30, serviceKind: 'cat' });
    expect(quoteVisit(['cat'], 'upgrade').total).toBe(4000);
  });
  it('dog basic RM60 / 20 min, upgrade RM70 / 60 min', () => {
    expect(quoteVisit(['dog'], 'basic')).toMatchObject({ total: 6000, minMinutes: 20 });
    expect(quoteVisit(['dog'], 'upgrade')).toMatchObject({ total: 7000, minMinutes: 60 });
  });
  it('mixed: dog price + RM10 per cat; basic 45 min, upgrade 60 min', () => {
    expect(quoteVisit(['dog', 'cat'], 'basic')).toMatchObject({ total: 7000, minMinutes: 45, serviceKind: 'mixed' });
    expect(quoteVisit(['dog', 'cat', 'cat'], 'upgrade')).toMatchObject({ total: 9000, minMinutes: 60 });
  });
  it('2nd dog +RM10; extra cats in cat-only +RM10 each', () => {
    expect(quoteVisit(['dog', 'dog'], 'basic').total).toBe(7000);
    expect(quoteVisit(['dog', 'dog', 'cat'], 'basic').total).toBe(8000);
    expect(quoteVisit(['cat', 'cat', 'cat'], 'basic').total).toBe(6000);
  });
  it('extra pets do not extend minimum time', () => {
    expect(quoteVisit(['cat', 'cat', 'cat'], 'basic').minMinutes).toBe(30);
    expect(quoteVisit(['dog', 'dog'], 'upgrade').minMinutes).toBe(60);
  });
  it('overtime RM10 per 15 min, adds time', () => {
    expect(quoteVisit(['cat'], 'basic', 2)).toMatchObject({ overtimeFee: 2000, total: 6000, totalMinutes: 60 });
    expect(() => quoteVisit(['cat'], 'basic', 1.5)).toThrow(RuleError);
    expect(() => quoteVisit(['cat'], 'basic', -1)).toThrow(RuleError);
  });
});

describe('E1-2 capacity', () => {
  it('max 3 pets, max 2 dogs, at least 1 pet', () => {
    expect(() => quoteVisit(['cat', 'cat', 'cat', 'cat'], 'basic')).toThrow('At most 3 pets');
    expect(() => quoteVisit(['dog', 'dog', 'dog'], 'basic')).toThrow('At most 2 dogs');
    expect(() => quoteVisit([], 'basic')).toThrow(RuleError);
  });
});

describe('E1-2 accept window', () => {
  const paid = at('2026-11-01T08:00:00+08:00');
  const lead = (h: number, min = 0) => new Date(paid.getTime() + h * H + min * M);
  it('first visit < 3 h away: fail', () => {
    expect(acceptWindow(paid, lead(2, 59)).kind).toBe('fail');
  });
  it('exactly 3 h to < 6 h: urgent, 30 min', () => {
    expect(acceptWindow(paid, lead(3))).toEqual({ kind: 'urgent', deadline: new Date(paid.getTime() + 30 * M) });
    expect(acceptWindow(paid, lead(5, 59)).kind).toBe('urgent');
  });
  it('≥ 6 h: normal, 3 h', () => {
    expect(acceptWindow(paid, lead(6))).toEqual({ kind: 'normal', deadline: new Date(paid.getTime() + 3 * H) });
  });
  it('deadline wins at the same second', () => {
    const deadline = new Date(paid.getTime() + 30 * M);
    expect(canAccept(new Date(deadline.getTime() - 1000), deadline)).toBe(true);
    expect(canAccept(deadline, deadline)).toBe(false);
  });
});

describe('E1-2 cancel refund (from submit time)', () => {
  const start = at('2026-11-02T09:00:00+08:00');
  const before = (h: number, min = 0) => new Date(start.getTime() - h * H - min * M);
  it('exactly 24 h → 100%', () => expect(cancelRefund(start, before(24), 7000)).toEqual({ percent: 100, refund: 7000 }));
  it('23 h 59 m → 80%', () => expect(cancelRefund(start, before(23, 59), 7000)).toEqual({ percent: 80, refund: 5600 }));
  it('exactly 1 h → 80%', () => expect(cancelRefund(start, before(1), 7000).percent).toBe(80));
  it('59 m → 0%', () => expect(cancelRefund(start, before(0, 59), 7000)).toEqual({ percent: 0, refund: 0 }));
  it('started visit cannot use normal cancel', () => expect(() => cancelRefund(start, start, 7000)).toThrow(RuleError));
  it('booked overtime refunded at the same %', () => {
    const paidWithOvertime = quoteVisit(['dog'], 'upgrade', 2).total; // 9000
    expect(cancelRefund(start, before(10), paidWithOvertime).refund).toBe(7200);
  });
  it('rounds to the nearest sen', () => expect(cancelRefund(start, before(10), 4001).refund).toBe(3201));
});

describe('E1-2 waiting fee', () => {
  it.each([
    [0, 0],
    [10, 0],
    [11, 500],
    [20, 500],
    [21, 1000],
    [60, 2500],
    [75, 2500],
  ])('%i min → %i sen', (min, fee) => expect(waitingFee(min)).toBe(fee));
});

describe('E1-2 splits', () => {
  it('service and overtime 85% to caregiver', () => {
    expect(caregiverShare('service', 7000)).toBe(5950);
    expect(caregiverShare('overtime', 2000)).toBe(1700);
  });
  it('waiting 100%, owner-fault no-handover 50%', () => {
    expect(caregiverShare('waiting', 2500)).toBe(2500);
    expect(caregiverShare('no_handover', 7000)).toBe(3500);
  });
  it('caregiver fault: caregiver gets nothing', () => expect(caregiverShare('caregiver_fault', 7000)).toBe(0));
  it('rounds to nearest sen', () => expect(caregiverShare('service', 4001)).toBe(3401));
});

describe('E1-2 overtime and report', () => {
  it('unused 15-min overtime units are refunded', () => {
    expect(unusedOvertimeRefund(4, 25)).toBe(2000); // 25 min used → 2 units used, 2 refunded
    expect(unusedOvertimeRefund(2, 0)).toBe(2000);
    expect(unusedOvertimeRefund(2, 40)).toBe(0);
  });
  it('report confirm window is 12 h', () => {
    const t = at('2026-11-02T09:51:00+08:00');
    expect(reportConfirmDeadline(t).getTime() - t.getTime()).toBe(12 * H);
  });
  it('report needs at least 3 photos', () => expect(R.report.minPhotos).toBe(3));
});

describe('E1-2 booking plan limits', () => {
  const now = at('2026-11-01T08:00:00+08:00');
  const v = (iso: string) => at(iso);
  it('valid plan passes', () => {
    expect(() => checkBookingPlan(now, [v('2026-11-02T09:00:00+08:00'), v('2026-11-02T18:00:00+08:00')])).not.toThrow();
  });
  it('visits only 7:00 am – 10:00 pm', () => {
    expect(() => checkBookingPlan(now, [v('2026-11-02T06:59:00+08:00')])).toThrow('7:00');
    expect(() => checkBookingPlan(now, [v('2026-11-02T22:00:00+08:00')])).not.toThrow();
    expect(() => checkBookingPlan(now, [v('2026-11-02T22:01:00+08:00')])).toThrow('7:00');
  });
  it('first visit at least 3 h away', () => {
    expect(() => checkBookingPlan(now, [v('2026-11-01T10:59:00+08:00')])).toThrow(RuleError);
  });
  it('up to 60 days ahead', () => {
    expect(() => checkBookingPlan(now, [v('2026-12-31T09:00:00+08:00')])).not.toThrow();
    expect(() => checkBookingPlan(now, [v('2027-01-01T09:00:00+08:00')])).toThrow('60 days');
  });
  it('max 20 days per order', () => {
    expect(() => checkBookingPlan(now, [v('2026-11-02T09:00:00+08:00'), v('2026-11-21T09:00:00+08:00')])).not.toThrow();
    expect(() => checkBookingPlan(now, [v('2026-11-02T09:00:00+08:00'), v('2026-11-22T09:00:00+08:00')])).toThrow('20 days');
  });
  it('max 3 visits per day', () => {
    const day = ['09:00', '12:00', '15:00', '18:00'].map((t) => v(`2026-11-02T${t}:00+08:00`));
    expect(() => checkBookingPlan(now, day.slice(0, 3))).not.toThrow();
    expect(() => checkBookingPlan(now, day)).toThrow('3 visits');
  });
  it('needs at least one visit', () => expect(() => checkBookingPlan(now, [])).toThrow(RuleError));
});

describe('E1-2 display', () => {
  it('formats sen as RM', () => {
    expect(formatRM(4000)).toBe('RM40');
    expect(formatRM(5950)).toBe('RM59.50');
    expect(formatRM(17850)).toBe('RM178.50');
  });
});

describe('E1-2 price list for screens', () => {
  it('lists every service with price and minimum time', () => {
    expect(priceList()).toEqual([
      { service: 'Cat', price: 'RM40', minMinutes: 30 },
      { service: 'Dog basic', price: 'RM60', minMinutes: 20 },
      { service: 'Dog upgrade', price: 'RM70', minMinutes: 60 },
      { service: 'Mixed basic', price: 'Dog price + RM10 per cat', minMinutes: 45 },
      { service: 'Mixed upgrade', price: 'Dog price + RM10 per cat', minMinutes: 60 },
      { service: 'Extra pet', price: 'RM10 each', minMinutes: 0 },
      { service: 'Overtime', price: 'RM10 per 15 min', minMinutes: 0 },
    ]);
  });
});
