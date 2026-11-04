import { describe, expect, it } from 'vitest';
import { emptyPromoForm, limitsText, promoBody, promoFormBlock, usesText } from './promos';

const ready = { ...emptyPromoForm('2026-11-01'), code: 'welcome10', amountRM: '10', endsOn: '2026-11-30', reason: 'Launch offer' };

describe('admin Promo codes page (E5-6)', () => {
  it('turns RM into sen and blank into no limit', () => {
    expect(promoBody(ready)).toMatchObject({ code: 'welcome10', kind: 'amount', amountSen: 1000, percent: null, maxSen: null, minSpendSen: 0, totalUses: null, oncePerOwner: true });
    expect(promoBody({ ...ready, kind: 'percent', percent: '20', maxRM: '30.50', minSpendRM: '80', totalUses: '100' })).toMatchObject({ amountSen: null, percent: 20, maxSen: 3050, minSpendSen: 8000, totalUses: 100 });
  });

  it('says why Create is off', () => {
    expect(promoFormBlock(ready)).toBe('');
    expect(promoFormBlock({ ...ready, code: 'ab' })).toBe('Code: 4–16 letters or numbers');
    expect(promoFormBlock({ ...ready, amountRM: 'ten' })).toBe('RM off: from RM1 to RM1,000');
    expect(promoFormBlock({ ...ready, endsOn: '' })).toBe('Choose a start and an end date');
    expect(promoFormBlock({ ...ready, totalUses: '0' })).toBe('Total uses: 1 or more, or leave empty for no limit');
    expect(promoFormBlock({ ...ready, reason: 'x' })).toBe('Give a reason (at least 5 characters)');
  });

  it('shows uses and limits', () => {
    expect(usesText({ used: 3, totalUses: 50 })).toBe('3 / 50 used');
    expect(usesText({ used: 3, totalUses: null })).toBe('3 used · no limit');
    expect(limitsText({ startsOn: '2026-11-01', endsOn: '2026-11-30', oncePerOwner: true, firstOrderOnly: true })).toMatch(/ · once per owner · first order only$/);
  });
});
