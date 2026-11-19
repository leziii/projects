import { describe, expect, it } from 'vitest';
import { checkDecision, decisionProblem, decisionRefundSen, decisionText, defaultRefundPercent, maxRefundPercent } from './exceptions';
import { refundReason } from './refunds';

describe('E12-3 admin decides a visit problem', () => {
  it('fills in a refund per fault; the admin may lower it (R51-3)', () => {
    expect([defaultRefundPercent('owner'), defaultRefundPercent('caregiver'), defaultRefundPercent('none'), defaultRefundPercent('mismatch')]).toEqual([0, 100, 100, 50]);
    expect(maxRefundPercent('mismatch')).toBe(100);
    expect(decisionProblem({ fault: 'caregiver', refundPercent: 100, reason: '' })).toBe('Write the reason for this decision');
    expect(decisionProblem({})).toBe('Choose who is at fault');
    expect(decisionProblem({ fault: 'owner', refundPercent: 10, reason: 'Code wrong' })).toBe('Refund can be at most 0% for this decision');
    expect(decisionProblem({ fault: 'none', refundPercent: 12.5, reason: 'Storm' })).toBe('Refund must be a whole percent');
    expect(checkDecision({ fault: 'mismatch', refundPercent: 80, reason: '  Two dogs, not one  ' })).toEqual({ fault: 'mismatch', refundPercent: 80, reason: 'Two dogs, not one' });
    expect(() => checkDecision({ fault: 'none', refundPercent: 100, reason: 'ok' })).toThrow('Write the reason');
    expect(decisionRefundSen(4000, 33)).toBe(1320);
  });

  it('says the decision in words for both sides (R51-5)', () => {
    expect(decisionText({ fault: 'owner', refundSen: 0, reason: 'Door code was wrong' })).toBe('Owner at fault (no handover) · no refund · visit fee split 50/50 with the caregiver. Reason: Door code was wrong');
    expect(decisionText({ fault: 'caregiver', refundSen: 4000, reason: 'Did not come' })).toBe('Caregiver at fault · RM40 refunded to the owner. Reason: Did not come');
    expect(refundReason('x0', null)).toBe('Visit 1: problem decision');
  });
});
