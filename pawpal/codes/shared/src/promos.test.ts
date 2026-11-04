import { describe, expect, it } from 'vitest';
import { checkPromo, normalizeCode, promoDiscount, promoProblem, promoText, splitDiscount, type Promo } from './promos';

const input = { code: ' welcome10 ', kind: 'amount', amountSen: 1000, minSpendSen: 0, startsOn: '2026-11-01', endsOn: '2026-11-30' };
const promo = (p: Partial<Promo> = {}): Promo => ({ ...checkPromo(input), id: 1, active: true, used: 0, createdAt: '', ...p });
const check = { today: '2026-11-10', totalSen: 8000, usedTotal: 0, usedByOwner: 0, ownerPaidOrders: 0 };

describe('promo codes (E5-6)', () => {
  it('checks what the admin types', () => {
    expect(checkPromo(input)).toEqual({ ...input, code: 'WELCOME10', percent: null, maxSen: null, totalUses: null, oncePerOwner: false, firstOrderOnly: false });
    expect(normalizeCode(' ab12 ')).toBe('AB12');
    const bad = (p: object) => () => checkPromo({ ...input, ...p });
    expect(bad({ code: 'AB' })).toThrow('Code: 4–16 letters or numbers');
    expect(bad({ code: 'AB-12' })).toThrow('Code: 4–16 letters or numbers');
    expect(bad({ kind: 'free' })).toThrow('Choose RM off or % off');
    expect(bad({ amountSen: 50 })).toThrow('RM off: from RM1 to RM1,000');
    expect(bad({ kind: 'percent', percent: 100 })).toThrow('% off: from 1 to 99');
    expect(bad({ kind: 'percent', percent: 20, maxSen: 0 })).toThrow('Maximum discount');
    expect(bad({ endsOn: '2026-10-01' })).toThrow('The end date must be on or after the start date');
    expect(bad({ totalUses: 0 })).toThrow('Total uses');
    expect(checkPromo({ ...input, kind: 'percent', percent: 20, maxSen: 3000, totalUses: 50, oncePerOwner: true })).toMatchObject({ amountSen: null, percent: 20, maxSen: 3000, totalUses: 50, oncePerOwner: true });
  });

  it('works out the discount; the owner always pays at least RM1', () => {
    expect(promoDiscount({ kind: 'amount', amountSen: 1000, percent: null, maxSen: null }, 8000)).toBe(1000);
    expect(promoDiscount({ kind: 'amount', amountSen: 5000, percent: null, maxSen: null }, 4000)).toBe(3900);
    expect(promoDiscount({ kind: 'percent', amountSen: null, percent: 20, maxSen: null }, 21000)).toBe(4200);
    expect(promoDiscount({ kind: 'percent', amountSen: null, percent: 20, maxSen: 3000 }, 21000)).toBe(3000);
    expect(promoDiscount({ kind: 'percent', amountSen: null, percent: 15, maxSen: null }, 4333)).toBe(649);
  });

  it('says why a code cannot be used', () => {
    expect(promoProblem(promo(), check)).toBeNull();
    expect(promoProblem(null, check)).toBe('There is no such code');
    expect(promoProblem(promo({ active: false }), check)).toBe('This code is turned off');
    expect(promoProblem(promo(), { ...check, today: '2026-10-31' })).toMatch(/^This code starts on /);
    expect(promoProblem(promo(), { ...check, today: '2026-12-01' })).toMatch(/^This code ended on /);
    expect(promoProblem(promo({ totalUses: 3 }), { ...check, usedTotal: 3 })).toBe('This code has been fully used');
    expect(promoProblem(promo({ oncePerOwner: true }), { ...check, usedByOwner: 1 })).toBe('You have already used this code');
    expect(promoProblem(promo({ oncePerOwner: false }), { ...check, usedByOwner: 1 })).toBeNull();
    expect(promoProblem(promo({ firstOrderOnly: true }), { ...check, ownerPaidOrders: 1 })).toBe('This code is for a first order only');
    expect(promoProblem(promo({ minSpendSen: 10000 }), check)).toBe('Spend at least RM100 to use this code');
  });

  it('shares the discount across visits (R23-5)', () => {
    expect(splitDiscount([4000, 4000], 1000)).toEqual([3500, 3500]);
    expect(splitDiscount([4000, 4000, 4000], 1000)).toEqual([3666, 3667, 3667]); // the left-over sen goes to the first visit
    expect(splitDiscount([7000, 4000], 1100)).toEqual([6300, 3600]);
    expect(splitDiscount([4000], 0)).toEqual([4000]);
    const paid = splitDiscount([4000, 4000, 4000], 1000);
    expect(paid.reduce((s, v) => s + v, 0)).toBe(11000);
  });

  it('describes a code', () => {
    expect(promoText({ kind: 'amount', amountSen: 1000, percent: null, maxSen: null, minSpendSen: 0 })).toBe('RM10 off');
    expect(promoText({ kind: 'percent', amountSen: null, percent: 20, maxSen: 3000, minSpendSen: 8000 })).toBe('20% off, up to RM30 · min spend RM80');
  });
});
