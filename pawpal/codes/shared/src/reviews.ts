/**
 * E9-3 O21 / O08 (round 41): the owner rates the caregiver once per order, after every visit is confirmed.
 * Reviews never affect payout and never replace Confirm.
 */
import { RuleError } from './rules';
import { dayText } from './schedule';

export const REVIEW_RULES = { commentMax: 300, replyMax: 300, rateDays: 14, profileShow: 5 } as const;

export interface Review {
  id: number;
  stars: number;
  comment: string;
  /** "Tan M." */
  ownerName: string;
  /** KL "YYYY-MM-DD HH:MM:SS.mmm" */
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
}

export interface Rating {
  /** Rounded to 1 decimal; null with no reviews. */
  avg: number | null;
  count: number;
}

/** R41-1, R41-3 on O13: not yet (visits not all confirmed), open until a date, closed, or done. */
export interface OrderReview {
  state: 'not_yet' | 'open' | 'closed' | 'done';
  /** KL time the rating closes, once every visit is confirmed. */
  until: string | null;
  mine: Review | null;
}

/** O08: the average and the newest visible reviews. */
export interface CaregiverReviews {
  rating: Rating;
  reviews: Review[];
}

export interface AdminReviewRow extends Review {
  orderId: number;
  number: string;
  caregiver: string;
  hidden: boolean;
  hiddenReason: string | null;
}

/** R41-4 O08: "★ 4.8 (12 reviews)", or "New" before any review. */
export const ratingText = (r: Rating) => (r.avg === null || !r.count ? 'New' : `★ ${r.avg.toFixed(1)} (${r.count} review${r.count === 1 ? '' : 's'})`);

/** R41-4 O07: "★ 4.8 (12)" or "New". */
export const ratingShort = (r: Rating) => (r.avg === null || !r.count ? 'New' : `★ ${r.avg.toFixed(1)} (${r.count})`);

/** "★★★★☆" */
export const starsText = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** "Nov 2026" from a KL time string. */
export function monthText(kl: string): string {
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(kl.slice(5, 7)) - 1];
  return `${m} ${kl.slice(0, 4)}`;
}

/** R41-2: what still stops the review being sent; '' when it can go. */
export function reviewProblem(input: { stars?: unknown; comment?: unknown }): string {
  if (!Number.isInteger(input.stars) || (input.stars as number) < 1 || (input.stars as number) > 5) return 'Tap 1 to 5 stars';
  const text = typeof input.comment === 'string' ? input.comment.trim() : '';
  if (text.length > REVIEW_RULES.commentMax) return `Keep the comment under ${REVIEW_RULES.commentMax} characters`;
  return '';
}

export function checkReview(input: { stars?: unknown; comment?: unknown }): { stars: number; comment: string } {
  const problem = reviewProblem(input);
  if (problem) throw new RuleError('REVIEW_INVALID', problem);
  return { stars: input.stars as number, comment: typeof input.comment === 'string' ? input.comment.trim() : '' };
}

/** R41-5: the caregiver's one reply. */
export function checkReply(reply: unknown): string {
  const text = typeof reply === 'string' ? reply.trim() : '';
  if (!text) throw new RuleError('REPLY_INVALID', 'Write a reply');
  if (text.length > REVIEW_RULES.replyMax) throw new RuleError('REPLY_INVALID', `Keep the reply under ${REVIEW_RULES.replyMax} characters`);
  return text;
}

/** R41-6: admin hides with a reason. */
export function checkHideReason(reason: unknown): string {
  const text = typeof reason === 'string' ? reason.trim() : '';
  if (text.length < 3) throw new RuleError('REASON_REQUIRED', 'Give a reason (at least 3 characters)');
  return text.slice(0, 200);
}

/** "Tan Mei Ling" → "Tan M."; one word stays as it is. */
export function ownerShortName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'Owner';
  return words.length > 1 ? `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.` : words[0];
}

/** R41-3 O13: "You can rate until Thu 19 Nov" */
export const rateUntilText = (until: string) => `You can rate until ${dayText(until.slice(0, 10))}`;
