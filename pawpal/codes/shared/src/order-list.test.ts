import { describe, expect, it } from 'vitest';
import { isOrderFilter, orderLine, orderTag, plannedTime, refundLine, serviceText, visitPriceLines, visitStatus, type OrderListRow } from './order-list';

const now = new Date('2026-10-31T02:00:00Z'); // 10:00 am in KL
const base: OrderListRow = { id: 1, number: 'P1', status: 'pending_accept', endReason: null, visits: 2, firstVisit: { date: '2026-11-02', start: 540 }, paySen: 4000, refundSen: 0, acceptDeadline: '2026-10-31 13:20:00.000' };

describe('E7-1 order list', () => {
  it('tags each order by how it stands (R30-4)', () => {
    expect(orderTag(base)).toBe('Waiting');
    expect(orderTag({ status: 'accepted', endReason: null })).toBe('Booked');
    expect(orderTag({ status: 'failed', endReason: 'timeout' })).toBe('Not accepted');
    expect(orderTag({ status: 'failed', endReason: 'rejected' })).toBe('Not accepted');
    expect(orderTag({ status: 'failed', endReason: 'too_late' })).toBe('Failed');
    expect(orderTag({ status: 'cancelled', endReason: 'withdrawn' })).toBe('Withdrawn');
  });

  it('shows one line that fits the status (R30-4)', () => {
    expect(orderLine(base, now)).toBe('Accept by 1:20 pm today');
    expect(orderLine({ ...base, status: 'accepted', acceptDeadline: null }, now)).toBe('First visit Mon 2 Nov · 9:00 am');
    expect(orderLine({ ...base, status: 'failed', endReason: 'timeout', refundSen: 4000 }, now)).toBe('RM40 refunded in full');
    expect(orderLine({ ...base, status: 'cancelled', endReason: 'withdrawn' }, now)).toBe('Full refund on its way');
  });

  it('knows the four filters (R30-2)', () => {
    expect(['all', 'waiting', 'booked', 'ended'].every(isOrderFilter)).toBe(true);
    expect(isOrderFilter('unpaid')).toBe(false);
  });
});

describe('E7-2 order detail', () => {
  it('gives each visit the order\'s status (R31-3)', () => {
    expect(visitStatus({ status: 'pending_accept' })).toBe('Waiting for caregiver');
    expect(visitStatus({ status: 'accepted' })).toBe('Booked');
    expect(visitStatus({ status: 'accepted' }, { status: 'arrived' })).toBe('Caregiver arrived');
    expect(visitStatus({ status: 'accepted' }, { status: 'in_service' })).toBe('In service');
    expect(visitStatus({ status: 'failed' })).toBe('Not going ahead');
    expect(visitStatus({ status: 'cancelled' })).toBe('Not going ahead');
  });

  it('says refunded only once the bank confirms (R31-4)', () => {
    expect(refundLine({ refundSen: 0, refundDoneSen: 0 })).toBeNull();
    expect(refundLine({ refundSen: 4000, refundDoneSen: 0 })).toBe('Refund on its way RM40');
    expect(refundLine({ refundSen: 4000, refundDoneSen: 4000 })).toBe('Refunded RM40');
    expect(refundLine({ refundSen: 4000, refundDoneSen: 1000 })).toBe('Refunded RM10 · on its way RM30');
  });
});

describe('E7-3 visit detail', () => {
  const quote = { serviceKind: 'cat' as const, basePrice: 4000, extraPetFee: 1000, overtimeFee: 0, total: 5000, minMinutes: 45, totalMinutes: 45 };
  it('shows the planned time, service and price lines (R32-2)', () => {
    expect(plannedTime({ start: 540, quote })).toBe('9:00 – 9:45 am');
    expect(plannedTime({ start: 690, quote })).toBe('11:30 am – 12:15 pm');
    expect(serviceText('basic', quote)).toBe('Basic care · cats');
    expect(serviceText('upgrade', { serviceKind: 'mixed' })).toBe('Upgrade care · dogs + cats');
    expect(visitPriceLines({ quote, paidSen: 4500 })).toEqual([{ label: 'Base price', sen: 4000 }, { label: 'Extra pet', sen: 1000 }]);
  });
});
