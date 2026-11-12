import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { INVITE_ALPHABET, REFERRAL_RULES, RuleError, addDays, formatRM, klDate, type CreditBalance, type InviteInfo, type User } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';
import { DbService, isDuplicate } from '../db/db.service';
import { MessagesService } from '../messages/messages.service';

/** Invite friends and credit (E5-7, round 24). PawPal pays the credit; caregivers are paid on the full price. */
@Injectable()
export class ReferralsService {
  constructor(
    private readonly db: DbService,
    private readonly messages: MessagesService,
  ) {}

  /** The Me page invite card; the code is made the first time (R24-1). */
  async invite(user: User): Promise<InviteInfo> {
    const code = await this.codeOf(user.id);
    const { rows } = await this.db.pool.query<{ joined: number; rewarded: number }>(
      'SELECT COUNT(*)::int AS joined, COUNT(rewarded_at)::int AS rewarded FROM referrals WHERE inviter_id = $1',
      [user.id],
    );
    return { code, ...rows[0], credit: await this.balance(user.id) };
  }

  /** The inviter for a code typed at sign-up, checked before the account is made. */
  async inviterFor(code: string): Promise<number> {
    const { rows } = await this.db.pool.query<{ id: number }>('SELECT id FROM users WHERE invite_code = $1', [code]);
    if (!rows[0]) throw new RuleError('BAD_INVITE', 'This invite code is not valid. Check it, or leave it empty');
    return rows[0].id;
  }

  /** Only a brand-new account becomes a friend, once, and never of itself (R24-2, R24-3). */
  async join(friendId: number, inviterId: number): Promise<void> {
    if (friendId === inviterId) return;
    await this.db.pool.query('INSERT INTO referrals (inviter_id, friend_id) VALUES ($1, $2) ON CONFLICT (friend_id) DO NOTHING', [inviterId, friendId]);
  }

  /**
   * The friend's first settled order gives both RM10 credit (R24-4). Called by settlement (E8/E9);
   * until then by the Test tools. Only the first settled order counts, and only once.
   */
  async orderSettled(orderId: number): Promise<{ rewarded: boolean }> {
    return this.db.tx(async (client) => {
      const { rows } = await client.query<{ owner_id: number; number: string }>('SELECT owner_id, number FROM orders WHERE id = $1', [orderId]);
      if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
      const ref = await client.query<{ id: number; inviter_id: number }>('SELECT id, inviter_id FROM referrals WHERE friend_id = $1 AND rewarded_at IS NULL FOR UPDATE', [rows[0].owner_id]);
      if (!ref.rows[0]) return { rewarded: false };
      const r = ref.rows[0];
      await client.query('UPDATE referrals SET rewarded_at = now(), order_id = $2 WHERE id = $1', [r.id, orderId]);
      const expires = addDays(klDate(new Date()), Math.round(REFERRAL_RULES.creditMonths * 30.5));
      const amount = REFERRAL_RULES.rewardSen;
      for (const [ownerId, reason] of [
        [r.inviter_id, 'A friend you invited finished their first order'],
        [rows[0].owner_id, 'Your first order with an invite is done'],
      ] as const) {
        await client.query('INSERT INTO credit_grants (owner_id, amount_sen, remaining_sen, expires_on, referral_id, reason) VALUES ($1, $2, $2, $3, $4, $5)', [
          ownerId,
          amount,
          expires,
          r.id,
          reason,
        ]);
        await this.messages.send(client, {
          userId: ownerId,
          role: 'owner',
          category: 'account',
          title: `You got ${formatRM(amount)} credit`,
          body: `${reason}. ${formatRM(amount)} credit is used for you on your next booking.`,
          link: null,
        });
      }
      return { rewarded: true };
    });
  }

  /** Test tools: the order is marked settled, which gives the referral reward when it is the friend's first. */
  async settleByNumber(input: unknown): Promise<{ number: string; rewarded: boolean }> {
    const number = typeof input === 'string' ? input.trim().toUpperCase() : '';
    const { rows } = await this.db.pool.query<{ id: number; paid_at: string | null }>(
      "UPDATE orders SET settled_at = COALESCE(settled_at, now()) WHERE number = $1 AND status = 'pending_accept' RETURNING id, paid_at",
      [number],
    );
    if (!rows[0]) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'No paid order with this number' });
    return { number, ...(await this.orderSettled(rows[0].id)) };
  }

  /** Credit left now: grants not yet expired (R24-5). */
  async balance(ownerId: number, client?: PoolClient): Promise<CreditBalance> {
    const { rows } = await (client ?? this.db.pool).query<{ sen: number; next: string | null }>(
      `SELECT COALESCE(SUM(remaining_sen), 0)::int AS sen, to_char(MIN(expires_on) FILTER (WHERE remaining_sen > 0), 'YYYY-MM-DD') AS next
       FROM credit_grants WHERE owner_id = $1 AND expires_on >= $2`,
      [ownerId, klDate(new Date())],
    );
    return { balanceSen: rows[0].sen, nextExpiry: rows[0].next };
  }

  /** Credit for O10: the balance plus what the owner's unpaid order already holds (it is the order they pay again). */
  async available(ownerId: number): Promise<number> {
    const { rows } = await this.db.pool.query<{ sen: number }>(
      `SELECT COALESCE(SUM(s.amount_sen), 0)::int AS sen FROM credit_spends s JOIN orders o ON o.id = s.order_id
       WHERE o.owner_id = $1 AND o.status = 'awaiting_payment' AND s.status = 'held'`,
      [ownerId],
    );
    return (await this.balance(ownerId)).balanceSen + rows[0].sen;
  }

  /** Holds credit for an order at Pay, soonest expiry first. Returns what was held. */
  async hold(client: PoolClient, ownerId: number, orderId: number, amountSen: number): Promise<number> {
    if (amountSen <= 0) return 0;
    const { rows } = await client.query<{ id: number; remaining_sen: number }>(
      'SELECT id, remaining_sen FROM credit_grants WHERE owner_id = $1 AND expires_on >= $2 AND remaining_sen > 0 ORDER BY expires_on, id FOR UPDATE',
      [ownerId, klDate(new Date())],
    );
    let left = amountSen;
    for (const g of rows) {
      if (!left) break;
      const take = Math.min(left, g.remaining_sen);
      await client.query('UPDATE credit_grants SET remaining_sen = remaining_sen - $2 WHERE id = $1', [g.id, take]);
      await client.query("INSERT INTO credit_spends (order_id, grant_id, amount_sen, status) VALUES ($1, $2, $3, 'held')", [orderId, g.id, take]);
      left -= take;
    }
    return amountSen - left;
  }

  /** The order is paid: held credit is spent. */
  async spend(client: PoolClient, orderId: number): Promise<void> {
    await client.query("UPDATE credit_spends SET status = 'spent', updated_at = now() WHERE order_id = $1 AND status = 'held'", [orderId]);
  }

  /** Cancelled, failed or refunded: credit comes back as credit, never cash (R24-5). */
  async giveBack(client: PoolClient, orderIds: number[]): Promise<void> {
    if (!orderIds.length) return;
    const { rows } = await client.query<{ grant_id: number; amount_sen: number }>(
      "UPDATE credit_spends SET status = 'returned', updated_at = now() WHERE order_id = ANY ($1) AND status <> 'returned' RETURNING grant_id, amount_sen",
      [orderIds],
    );
    for (const s of rows) await client.query('UPDATE credit_grants SET remaining_sen = remaining_sen + $2 WHERE id = $1', [s.grant_id, s.amount_sen]);
  }

  /** E10-1 (R42-3): part of a paid order's credit comes back as credit when a visit is cancelled. Returns what came back. */
  async returnPart(client: PoolClient, orderId: number, amountSen: number): Promise<number> {
    if (amountSen <= 0) return 0;
    const { rows } = await client.query<{ id: number; grant_id: number; amount_sen: number }>(
      "SELECT id, grant_id, amount_sen FROM credit_spends WHERE order_id = $1 AND status = 'spent' AND amount_sen > 0 ORDER BY id DESC FOR UPDATE",
      [orderId],
    );
    let left = amountSen;
    for (const s of rows) {
      if (!left) break;
      const back = Math.min(left, s.amount_sen);
      if (back === s.amount_sen) await client.query("UPDATE credit_spends SET status = 'returned', updated_at = now() WHERE id = $1", [s.id]);
      else {
        // Keep the spent part, and record the returned part as its own row.
        await client.query('UPDATE credit_spends SET amount_sen = amount_sen - $2, updated_at = now() WHERE id = $1', [s.id, back]);
        await client.query("INSERT INTO credit_spends (order_id, grant_id, amount_sen, status) VALUES ($1, $2, $3, 'returned')", [orderId, s.grant_id, back]);
      }
      await client.query('UPDATE credit_grants SET remaining_sen = remaining_sen + $2 WHERE id = $1', [s.grant_id, back]);
      left -= back;
    }
    return amountSen - left;
  }

  private async codeOf(userId: number): Promise<string> {
    const { rows } = await this.db.pool.query<{ invite_code: string | null }>('SELECT invite_code FROM users WHERE id = $1', [userId]);
    if (rows[0]?.invite_code) return rows[0].invite_code;
    for (let tries = 0; tries < 5; tries++) {
      const code = Array.from({ length: REFERRAL_RULES.codeLength }, () => INVITE_ALPHABET[randomInt(INVITE_ALPHABET.length)]).join('');
      try {
        const set = await this.db.pool.query<{ invite_code: string }>('UPDATE users SET invite_code = COALESCE(invite_code, $2) WHERE id = $1 RETURNING invite_code', [userId, code]);
        return set.rows[0].invite_code;
      } catch (err) {
        if (!isDuplicate(err)) throw err;
      }
    }
    throw new ConflictException({ code: 'INVITE_CODE_BUSY', message: 'Could not make an invite code. Try again' });
  }
}
