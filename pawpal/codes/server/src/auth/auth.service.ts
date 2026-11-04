import { Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import {
  AUTH_RULES,
  CAREGIVER_STATUSES,
  RuleError,
  checkInviteCode,
  checkRoleSwitch,
  effectiveRole,
  normalizeMyPhone,
  type Actor,
  type CaregiverStatus,
  type CodeSent,
  type LoginResult,
  type Role,
  type User,
} from '@pawpal/shared';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { DbService } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { RedisService } from '../redis/redis.service';
import { ReferralsService } from '../referrals/referrals.service';
import { MockSmsSender, SMS_SENDER, type SmsSender } from '../sms/sms';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

/** Redis keys for one phone: the code, the resend wait, the hourly count. */
const keys = (phone: string) => ({ code: `auth:code:${phone}`, wait: `auth:wait:${phone}`, count: `auth:count:${phone}` });

interface UserRow {
  id: number;
  phone: string;
  caregiver_status: CaregiverStatus;
  active_role: Role;
}

const toUser = (r: UserRow): User => {
  const user = { id: r.id, phone: r.phone, caregiverStatus: r.caregiver_status, activeRole: r.active_role };
  return { ...user, activeRole: effectiveRole(user) };
};

interface StoredCode {
  hash: string;
  wrong: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
    private readonly history: HistoryService,
    private readonly messages: MessagesService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
    private readonly referrals: ReferralsService,
  ) {}

  /** Sends a new 6-digit code. Limits: one per minute, five per hour. A new code replaces the old one. */
  async sendCode(input: { phone?: unknown }): Promise<CodeSent> {
    const phone = this.phone(input.phone);
    const r = this.redis.client;
    const k = keys(phone);

    const wait = await r.ttl(k.wait);
    if (wait > 0) throw new RuleError('CODE_TOO_SOON', `Please wait ${wait} s before asking for a new code`);
    const count = await r.incr(k.count);
    if (count === 1) await r.expire(k.count, 3600);
    if (count > AUTH_RULES.maxCodesPerHour) throw new RuleError('TOO_MANY_CODES', 'Too many codes for this number. Try again in an hour');

    const code = randomInt(0, 10 ** AUTH_RULES.codeLength).toString().padStart(AUTH_RULES.codeLength, '0');
    const stored: StoredCode = { hash: sha256(`${phone}:${code}`), wrong: 0 };
    await r.set(k.code, JSON.stringify(stored), 'EX', AUTH_RULES.codeValidSeconds);
    await r.set(k.wait, '1', 'EX', AUTH_RULES.resendAfterSeconds);
    await this.sms.send(phone, `Your PawPal code is ${code}. It expires in ${AUTH_RULES.codeValidSeconds / 60} minutes. Never share it.`);

    return {
      phone,
      expiresInSec: AUTH_RULES.codeValidSeconds,
      resendInSec: AUTH_RULES.resendAfterSeconds,
      ...(this.sms instanceof MockSmsSender ? { devCode: code } : {}),
    };
  }

  /** Checks the code; first login creates the account. Each code works once; five wrong tries kill it. */
  async login(input: { phone?: unknown; code?: unknown; acceptTerms?: unknown; ref?: unknown }): Promise<LoginResult> {
    const phone = this.phone(input.phone);
    if (input.acceptTerms !== true) throw new RuleError('TERMS_REQUIRED', 'Please accept the Terms and Privacy Policy');
    // E5-7: an invite code is checked before the login code is used up, so a typo can be fixed.
    const invite = checkInviteCode(input.ref);
    const inviterId = invite ? await this.referrals.inviterFor(invite) : null;
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (!/^\d{6}$/.test(code)) throw new RuleError('BAD_CODE', 'The code has 6 digits');

    const k = keys(phone);
    const raw = await this.redis.client.get(k.code);
    if (!raw) throw new RuleError('CODE_EXPIRED', 'This code has expired. Ask for a new one');
    const stored = JSON.parse(raw) as StoredCode;
    if (!sameHash(stored.hash, sha256(`${phone}:${code}`))) {
      const wrong = stored.wrong + 1;
      if (wrong >= AUTH_RULES.maxWrongTries) {
        await this.redis.client.del(k.code);
        throw new RuleError('TOO_MANY_TRIES', 'Too many wrong codes. Ask for a new one');
      }
      await this.redis.client.set(k.code, JSON.stringify({ ...stored, wrong }), 'KEEPTTL');
      const left = AUTH_RULES.maxWrongTries - wrong;
      throw new RuleError('CODE_WRONG', `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left`);
    }
    // GETDEL-style: only the request that deletes the code may log in, so a code cannot be used twice.
    if ((await this.redis.client.del(k.code)) !== 1) throw new RuleError('CODE_EXPIRED', 'This code has expired. Ask for a new one');

    const { rows } = await this.db.pool.query<UserRow & { is_new: boolean }>(
      `INSERT INTO users (phone, terms_accepted_at, last_login_at) VALUES ($1, now(), now())
       ON CONFLICT (phone) DO UPDATE SET last_login_at = now()
       RETURNING id, phone, caregiver_status, 'owner' AS active_role, (xmax = 0) AS is_new`,
      [phone],
    );
    // Only a brand-new account can join through an invite (R24-2); an old phone number never can (R24-3).
    if (inviterId !== null && rows[0].is_new) await this.referrals.join(rows[0].id, inviterId);
    const token = randomBytes(32).toString('base64url');
    await this.db.pool.query(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`, [
      sha256(token),
      rows[0].id,
      AUTH_RULES.sessionDays,
    ]);
    const result: LoginResult = { token, user: toUser(rows[0]), isNew: rows[0].is_new };
    if (inviterId !== null) result.invite = rows[0].is_new ? 'joined' : 'old_account';
    return result;
  }

  /** The user behind a token, or 401. */
  async userFor(token: string | undefined): Promise<User> {
    if (!token) throw new UnauthorizedException({ code: 'LOGIN_REQUIRED', message: 'Please log in' });
    const { rows } = await this.db.pool.query<UserRow>(
      `SELECT u.id, u.phone, u.caregiver_status, s.active_role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
      [sha256(token)],
    );
    if (!rows[0]) throw new UnauthorizedException({ code: 'LOGIN_EXPIRED', message: 'Your login has expired. Please log in again' });
    return toUser(rows[0]);
  }

  /** Switches this login between owner and caregiver (G1). Orders keep their owner whatever the role. */
  async switchRole(token: string | undefined, role: unknown): Promise<User> {
    if (role !== 'owner' && role !== 'caregiver') throw new RuleError('BAD_ROLE', 'role must be "owner" or "caregiver"');
    const user = await this.userFor(token);
    checkRoleSwitch(user, role);
    await this.db.pool.query('UPDATE sessions SET active_role = $1 WHERE token_hash = $2', [role, sha256(token as string)]);
    return { ...user, activeRole: role };
  }

  /** Sets a caregiver's status with a history row and a message to the caregiver. Admin review (E4-2) will call this; for now only the dev tool does. */
  async setCaregiverStatus(phoneInput: unknown, status: unknown, actor: Actor, reason: string): Promise<User> {
    const phone = this.phone(phoneInput);
    if (!CAREGIVER_STATUSES.includes(status as CaregiverStatus)) throw new RuleError('BAD_STATUS', `status must be one of ${CAREGIVER_STATUSES.join(', ')}`);
    return this.db.tx(async (client) => {
      const { rows } = await client.query<UserRow>(`SELECT id, phone, caregiver_status, 'owner' AS active_role FROM users WHERE phone = $1 FOR UPDATE`, [phone]);
      if (!rows[0]) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'No account with this number. Log in once first' });
      const from = rows[0].caregiver_status;
      if (from !== status) {
        await client.query('UPDATE users SET caregiver_status = $1 WHERE id = $2', [status, rows[0].id]);
        await this.history.record(client, { entity: 'caregiver', entityId: rows[0].id, from, to: status as string, actor, reason });
        await this.messages.caregiverStatusChanged(client, rows[0].id, status as CaregiverStatus);
      }
      return toUser({ ...rows[0], caregiver_status: status as CaregiverStatus });
    });
  }

  /** The account for a phone number, or 404. */
  async findByPhone(phoneInput: unknown): Promise<User> {
    const { rows } = await this.db.pool.query<UserRow>(`SELECT id, phone, caregiver_status, 'owner' AS active_role FROM users WHERE phone = $1`, [
      this.phone(phoneInput),
    ]);
    if (!rows[0]) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'No account with this number. Log in once first' });
    return toUser(rows[0]);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.db.pool.query('UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
  }

  private phone(input: unknown): string {
    const phone = typeof input === 'string' ? normalizeMyPhone(input) : null;
    if (!phone) throw new RuleError('BAD_PHONE', 'Enter a Malaysian mobile number, e.g. 012-345 6789');
    return phone;
  }
}

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
