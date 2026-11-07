import { describe, expect, it } from 'vitest';
import { checkHideReason, checkReply, checkReview, monthText, ownerShortName, ratingShort, ratingText, rateUntilText, reviewProblem, starsText } from './reviews';

describe('E9-3 reviews', () => {
  it('needs 1 to 5 stars and a comment up to 300 (R41-2)', () => {
    expect(reviewProblem({})).toBe('Tap 1 to 5 stars');
    expect(reviewProblem({ stars: 6 })).toBe('Tap 1 to 5 stars');
    expect(reviewProblem({ stars: 4, comment: 'x'.repeat(301) })).toBe('Keep the comment under 300 characters');
    expect(checkReview({ stars: 5, comment: ' Great ' })).toEqual({ stars: 5, comment: 'Great' });
    expect(checkReview({ stars: 3 })).toEqual({ stars: 3, comment: '' });
    expect(() => checkReply(' ')).toThrow('Write a reply');
    expect(() => checkHideReason('x')).toThrow('Give a reason');
  });

  it('shows the rating and names (R41-4)', () => {
    expect(ratingText({ avg: null, count: 0 })).toBe('New');
    expect(ratingText({ avg: 4.8, count: 12 })).toBe('★ 4.8 (12 reviews)');
    expect(ratingText({ avg: 5, count: 1 })).toBe('★ 5.0 (1 review)');
    expect(ratingShort({ avg: 4.75, count: 4 })).toBe('★ 4.8 (4)');
    expect(ratingShort({ avg: null, count: 0 })).toBe('New');
    expect(starsText(4)).toBe('★★★★☆');
    expect(monthText('2026-11-06 10:00:00.000')).toBe('Nov 2026');
    expect(ownerShortName('Tan Mei Ling')).toBe('Tan L.');
    expect(ownerShortName('Ali')).toBe('Ali');
    expect(rateUntilText('2026-11-19 10:00:00.000')).toBe('You can rate until Thu 19 Nov');
  });
});
