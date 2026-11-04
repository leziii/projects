import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import {
  ADMIN_PAGES,
  ADMIN_RULES,
  RuleError,
  checkPages,
  checkPassword,
  checkUsername,
  type AdminCreated,
  type AdminLoginResult,
  type AdminPage,
  type AdminUser,
} from '@pawpal/shared';
import { createHash, randomBytes } from 'node:crypto';
import { DbService, isDuplicate } from '../db/db.service';
import { hashPassword, verifyPassword } from './password';
import { newTotpSecret, otpauthUrl, totpStep } from './totp';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

interface AdminRow {
  id: number;
  username: string;
  name: string;
  pages: AdminPage[];
}

interface LoginRow extends AdminRow {
  password_hash: string;
  totp_secret: string;
  last_totp_step: number;
  failed_count: number;
  locked_left_sec: number | null;
  disabled_at: string | null;
}

const toAdmin = (r: AdminRow): AdminUser => ({ id: r.id, username: r.username, name: r.name, pages: r.pages.filter((p) => ADMIN_PAGES.includes(p)) });

/** The same answer for every wrong part, so nobody learns which usernames exist. */
const LOGIN_FAILED = () => new RuleError('ADMIN_LOGIN_FAILED', 'Wrong username, password or code');

/** Admin accounts (E2-4): never the app's users table; own sessions, own tokens. */
@Injectable()
export class AdminAuthService {
  constructor(private readonly db: DbService) {}

  /** Creates an admin. The password is stored only as a hash; the 2FA secret is shown once to set up the app. */
  async create(input: { username?: unknown; name?: unknown; password?: unknown; pages?: unknown }): Promise<AdminCreated> {
    const username = checkUsername(input.username);
    const password = checkPassword(input.password);
    const pages = input.pages === undefined ? [...ADMIN_PAGES] : checkPages(input.pages);
    const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 64) : username;
    const secret = newTotpSecret();
    try {
      const { rows } = await this.db.pool.query<AdminRow>(
        'INSERT INTO admins (username, name, password_hash, totp_secret, pages) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, name, pages',
        [username, name, await hashPassword(password), secret, pages],
      );
      return { admin: toAdmin(rows[0]), totpSecret: secret, otpauthUrl: otpauthUrl(username, secret) };
    } catch (err) {
      if (isDuplicate(err)) throw new ConflictException({ code: 'USERNAME_TAKEN', message: 'This username is taken' });
      throw err;
    }
  }

  /**
   * Username + password + authenticator code. Five wrong tries lock the account for 15 minutes.
   * A code works once: the same code cannot log in twice.
   */
  async login(input: { username?: unknown; password?: unknown; code?: unknown }): Promise<AdminLoginResult> {
    const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const code = typeof input.code === 'string' ? input.code.trim() : '';
    if (!username || !password || !code) throw new RuleError('ADMIN_LOGIN_MISSING', 'Enter username, password and code');

    const outcome = await this.db.tx(async (client) => {
      const { rows } = await client.query<LoginRow>(
        `SELECT id, username, name, pages, password_hash, totp_secret, last_totp_step, failed_count, disabled_at,
           CASE WHEN locked_until > now() THEN CEIL(EXTRACT(EPOCH FROM locked_until - now()))::int END AS locked_left_sec
         FROM admins WHERE username = $1 FOR UPDATE`,
        [username],
      );
      const a = rows[0];
      if (!a || a.disabled_at) return { error: LOGIN_FAILED() };
      if (a.locked_left_sec) return { error: locked(a.locked_left_sec) };

      const step = (await verifyPassword(password, a.password_hash)) ? totpStep(a.totp_secret, code) : null;
      if (step === null || step <= a.last_totp_step) {
        const failed = a.failed_count + 1;
        if (failed >= ADMIN_RULES.maxWrongTries) {
          await client.query(`UPDATE admins SET failed_count = 0, locked_until = now() + make_interval(mins => $2) WHERE id = $1`, [a.id, ADMIN_RULES.lockMinutes]);
          return { error: locked(ADMIN_RULES.lockMinutes * 60) };
        }
        await client.query('UPDATE admins SET failed_count = $2 WHERE id = $1', [a.id, failed]);
        return { error: LOGIN_FAILED() };
      }

      await client.query('UPDATE admins SET failed_count = 0, locked_until = NULL, last_totp_step = $2 WHERE id = $1', [a.id, step]);
      const token = randomBytes(32).toString('base64url');
      await client.query(`INSERT INTO admin_sessions (token_hash, admin_id, expires_at) VALUES ($1, $2, now() + make_interval(hours => $3))`, [
        sha256(token),
        a.id,
        ADMIN_RULES.sessionHours,
      ]);
      return { result: { token, admin: toAdmin(a) } };
    });
    // Throw after the transaction, so failed-try counts and locks are saved.
    if ('error' in outcome) throw outcome.error;
    return outcome.result;
  }

  /** The admin behind a token, or 401. App tokens never match: they live in another table. */
  async adminFor(token: string | undefined): Promise<AdminUser> {
    if (!token) throw new UnauthorizedException({ code: 'ADMIN_LOGIN_REQUIRED', message: 'Please log in to the admin console' });
    const { rows } = await this.db.pool.query<AdminRow>(
      `SELECT a.id, a.username, a.name, a.pages FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now() AND a.disabled_at IS NULL`,
      [sha256(token)],
    );
    if (!rows[0]) throw new UnauthorizedException({ code: 'ADMIN_LOGIN_EXPIRED', message: 'Your admin login has expired. Please log in again' });
    return toAdmin(rows[0]);
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.db.pool.query('UPDATE admin_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL', [sha256(token)]);
  }

  /** Dev tool only: the stored 2FA secret, so automated tests can make codes. */
  async secretFor(usernameInput: unknown): Promise<string | null> {
    const { rows } = await this.db.pool.query<{ totp_secret: string }>('SELECT totp_secret FROM admins WHERE username = $1', [
      checkUsername(usernameInput),
    ]);
    return rows[0]?.totp_secret ?? null;
  }
}

function locked(seconds: number): RuleError {
  const min = Math.ceil(seconds / 60);
  return new RuleError('ADMIN_LOCKED', `Too many wrong tries. Try again in ${min} ${min === 1 ? 'minute' : 'minutes'}`);
}
