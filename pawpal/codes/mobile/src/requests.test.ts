import { describe, expect, it } from 'vitest';
import { anyExpired, historyText, incomeText, leftText, requestUrl, tagText, visitsText, whereText } from './requests';

const card = { urgent: true, deadline: '2026-11-02 13:45:00.000', firstVisit: { date: '2026-11-03', start: 540 }, visits: 2, area: 'Setapak', pets: '1 dog, 1 cat', incomeSen: 11900 };

describe('E6-1 request cards', () => {
  it('shows the tag, visits, area, pets and income (R25-3)', () => {
    expect(tagText(card)).toBe('Urgent');
    expect(tagText({ urgent: false })).toBe('Normal');
    expect(visitsText(card)).toBe('First visit Tue 3 Nov · 9:00 am · 2 visits');
    expect(visitsText({ ...card, visits: 1 })).toBe('First visit Tue 3 Nov · 9:00 am · 1 visit');
    expect(whereText(card)).toBe('Setapak · 1 dog, 1 cat');
    expect(incomeText(card)).toBe('You earn RM119');
    expect(requestUrl(5)).toBe('/pages/caregiver/request?id=5');
  });

  it('counts down and says Expired at 0 (R25-5)', () => {
    expect(leftText(card, new Date('2026-11-02T05:21:00Z'))).toBe('24 min left');
    expect(leftText(card, new Date('2026-11-02T05:45:00Z'))).toBe('Expired');
    expect(anyExpired([card], new Date('2026-11-02T05:44:00Z'))).toBe(false);
    expect(anyExpired([card], new Date('2026-11-02T05:46:00Z'))).toBe(true);
  });

  it('history rows say why they ended', () => {
    expect(historyText({ number: 'P20261102001', end: 'expired' })).toBe('P20261102001 · Expired');
    expect(historyText({ number: 'P20261102001', end: 'withdrawn' })).toBe('P20261102001 · Owner withdrew');
  });
});
