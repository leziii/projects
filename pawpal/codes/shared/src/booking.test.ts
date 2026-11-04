import { describe, expect, it } from 'vitest';
import { availabilityText, bookingDates, bookingNeeds, checkBookingDraft, checkEntry, clashingVisits, fitsBooking, sortOptions, startOptions, summarizeDraft, visitTime, type DraftContext, type DraftInput } from './booking';

// 30 Oct 2026, 8:00 am in Kuala Lumpur.
const now = new Date('2026-10-30T00:00:00Z');
const ctx: DraftContext = {
  pets: [
    { id: 1, kind: 'cat', status: 'approved', name: 'Mimi' },
    { id: 2, kind: 'dog', status: 'approved', name: 'Wangcai' },
    { id: 3, kind: 'dog', status: 'pending', name: 'Lucky' },
    { id: 4, kind: 'dog', status: 'approved', name: 'Max' },
    { id: 5, kind: 'cat', status: 'rejected', name: 'Tom' },
  ],
  addressIds: [9],
  now,
};
const draft = (d: Partial<DraftInput>): DraftInput => ({ petIds: [1, 2], level: 'basic', overtimeUnits: 0, addressId: 9, visits: [{ date: '2026-10-31', start: 540 }], ...d });
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code: string }).code;
  }
  return 'none';
};

describe('booking setup (E5-1)', () => {
  it('start times and dates', () => {
    const s = startOptions();
    expect([s[0], s[1], s.at(-1), s.length]).toEqual([420, 450, 1320, 31]);
    const d = bookingDates(now);
    expect([d[0], d.at(-1), d.length]).toEqual(['2026-10-30', '2026-12-29', 61]);
    expect(visitTime({ date: '2026-10-31', start: 540 }).toISOString()).toBe('2026-10-31T01:00:00.000Z');
  });

  it('checks the shape and sorts visits', () => {
    expect(checkBookingDraft({})).toEqual({ petIds: [], level: 'basic', overtimeUnits: 0, addressId: null, visits: [] });
    const d = checkBookingDraft({ petIds: [2, 2, 1], level: 'upgrade', overtimeUnits: 4, addressId: 9, visits: [{ date: '2026-11-02', start: 600 }, { date: '2026-11-01', start: 1320 }] });
    expect(d.petIds).toEqual([2, 1]);
    expect(d.visits.map((v) => v.date)).toEqual(['2026-11-01', '2026-11-02']);
    expect(code(() => checkBookingDraft({ level: 'gold' }))).toBe('BOOKING_LEVEL');
    expect(code(() => checkBookingDraft({ overtimeUnits: 5 }))).toBe('BOOKING_OVERTIME');
    expect(code(() => checkBookingDraft({ visits: [{ date: '2026-11-01', start: 400 }] }))).toBe('BOOKING_VISIT');
    expect(code(() => checkBookingDraft({ visits: [{ date: '2026-11-01', start: 1350 }] }))).toBe('BOOKING_VISIT');
    expect(code(() => checkBookingDraft({ visits: [{ date: '2026-02-30', start: 600 }] }))).toBe('BOOKING_VISIT');
    expect(code(() => checkBookingDraft({ petIds: ['x'] }))).toBe('BOOKING_PETS');
  });

  it('prices each visit: mixed, upgrade, overtime, extra dog', () => {
    const s = summarizeDraft(draft({ visits: [{ date: '2026-10-31', start: 540 }, { date: '2026-11-01', start: 540 }] }), ctx);
    expect(s.blocks).toEqual([]);
    expect(s.lines.map((l) => [l.label, l.quote.total, l.quote.totalMinutes])).toEqual([
      ['Sat 31 Oct · 9:00 am', 7000, 45],
      ['Sun 1 Nov · 9:00 am', 7000, 45],
    ]);
    expect(s.total).toBe(14000);
    const up = summarizeDraft(draft({ petIds: [1, 2, 4], level: 'upgrade', overtimeUnits: 2 }), ctx);
    expect([up.lines[0].quote.total, up.lines[0].quote.totalMinutes]).toEqual([7000 + 1000 + 1000 + 2000, 90]);
    // Cats only: one level, the upgrade choice is ignored.
    expect(summarizeDraft(draft({ petIds: [1], level: 'upgrade' }), ctx).lines[0].quote.total).toBe(4000);
  });

  it('lists what stops Next', () => {
    expect(summarizeDraft(draft({ petIds: [], addressId: null, visits: [] }), ctx).blocks).toEqual(['Choose at least one pet', 'Add at least one visit', 'Choose an address']);
    expect(summarizeDraft(draft({ petIds: [2, 3, 4] }), ctx).blocks).toEqual(['At most 2 dogs per booking']);
    expect(summarizeDraft(draft({ petIds: [5] }), ctx).blocks).toContain('A chosen pet cannot be booked');
    expect(summarizeDraft(draft({ visits: [{ date: '2026-10-30', start: 600 }] }), ctx).blocks).toEqual(['The first visit must be at least 3 hours from now']);
    expect(summarizeDraft(draft({ visits: [{ date: '2026-10-30', start: 660 }] }), ctx).blocks).toEqual([]);
    expect(summarizeDraft(draft({ visits: [{ date: '2026-12-30', start: 600 }] }), ctx).blocks).toEqual(['Dates must be from today to Tue 29 Dec']);
    const four = [480, 600, 720, 840].map((start) => ({ date: '2026-11-01', start }));
    expect(summarizeDraft(draft({ visits: four }), ctx).blocks).toEqual(['Sun 1 Nov: at most 3 visits a day']);
    expect(summarizeDraft(draft({ visits: [{ date: '2026-11-01', start: 540 }, { date: '2026-11-01', start: 570 }] }), ctx).blocks).toEqual(['Sun 1 Nov: visits overlap']);
    const many = Array.from({ length: 21 }, (_, i) => ({ date: `2026-11-${String(i + 1).padStart(2, '0')}`, start: 600 }));
    expect(summarizeDraft(draft({ visits: many }), ctx).blocks).toEqual(['At most 20 dates per booking']);
    expect(summarizeDraft(draft({ addressId: 8 }), ctx).blocks).toEqual(['Choose an address']);
  });

  it('pets still being checked may be chosen; payment waits', () => {
    const s = summarizeDraft(draft({ petIds: [1, 3] }), ctx);
    expect(s.blocks).toEqual([]);
    expect(s.waitsForCheck).toEqual(['Lucky']);
  });
});

describe('choosing a caregiver (E5-2)', () => {
  const siti = { areas: ['Bangsar' as const], cats: true, dogs: true, maxDogSize: 'small' as const, overtimeMaxMin: 30 };
  const needs = { area: 'Bangsar' as const, cats: true, dogWeights: [8], overtimeMin: 15 };

  it('who fits', () => {
    expect(bookingNeeds(draft({ petIds: [1, 2], overtimeUnits: 2 }), { pets: [ctx.pets[0], { ...ctx.pets[1], weightKg: 12 }] }, 'KLCC')).toEqual({ area: 'KLCC', cats: true, dogWeights: [12], overtimeMin: 30 });
    expect(fitsBooking(siti, needs)).toBe(true);
    expect(fitsBooking(siti, { ...needs, area: 'KLCC' })).toBe(false);
    expect(fitsBooking({ ...siti, cats: false }, needs)).toBe(false);
    expect(fitsBooking(siti, { ...needs, dogWeights: [8, 12] })).toBe(false);
    expect(fitsBooking({ ...siti, maxDogSize: 'medium' }, { ...needs, dogWeights: [8, 12] })).toBe(true);
    expect(fitsBooking({ ...siti, dogs: false, maxDogSize: null }, { ...needs, dogWeights: [] })).toBe(true);
    expect(fitsBooking(siti, { ...needs, overtimeMin: 45 })).toBe(false);
  });

  it('availability from blocks, booked visits and buffer', () => {
    const s = {
      settings: { travelBufferMin: 30, overtimeMaxMin: 30 },
      blocks: [{ id: 1, kind: 'weekly' as const, date: null, weekday: 0, start: 420, end: 1320 }],
      visits: [{ id: 1, date: '2026-11-02', start: 600, minutes: 45, label: 'Test visit' }],
    };
    const want = [
      { date: '2026-11-01', start: 540 }, // Sunday: blocked all day
      { date: '2026-11-02', start: 540 }, // 9:00–9:45 runs into the 9:30 buffer
      { date: '2026-11-02', start: 720 }, // free
    ];
    const clash = clashingVisits(want, 45, s);
    expect(clash).toEqual(want.slice(0, 2));
    expect(availabilityText(3, clash)).toBe('May clash: Sun 1 Nov 9:00 am, Mon 2 Nov 9:00 am');
    expect(availabilityText(3, [])).toBe('All 3 visits look free');
    expect(availabilityText(1, [])).toBe('Your visit looks free');
  });

  it('free first, then most experience', () => {
    const opt = (id: number, free: boolean, years: number) => ({ card: { id, experienceYears: years } as never, free, availability: '' });
    expect(sortOptions([opt(1, false, 9), opt(2, true, 1), opt(3, true, 5)]).map((o) => o.card.id)).toEqual([3, 2, 1]);
  });
});

describe('entry method (E5-3)', () => {
  it('pre-authorised needs the key or lock box; live confirm needs nothing; each box ≤ 300', () => {
    expect(checkEntry({ method: 'pre_authorised', keyLock: ' Code 1234# ', guard: '', notes: 'Cat hides under the bed' })).toEqual({ method: 'pre_authorised', keyLock: 'Code 1234#', guard: '', notes: 'Cat hides under the bed' });
    expect(checkEntry({ method: 'live_confirm' })).toEqual({ method: 'live_confirm', keyLock: '', guard: '', notes: '' });
    expect(code(() => checkEntry({ method: 'pre_authorised', keyLock: '  ' }))).toBe('ENTRY_KEY_NEEDED');
    expect(code(() => checkEntry({ method: 'window' }))).toBe('ENTRY_METHOD');
    expect(code(() => checkEntry({ method: 'live_confirm', notes: 'x'.repeat(301) }))).toBe('ENTRY_TOO_LONG');
  });
});
