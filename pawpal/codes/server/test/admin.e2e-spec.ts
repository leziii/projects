import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpCode } from '../src/admin/totp';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { klDate, tomorrowOf, type ActionLogPage, type RulesAdmin } from '@pawpal/shared';
import { TEST_ADMIN_PASSWORD, adminLogin } from './admin-helper';

// E2-4: admin accounts are separate from app accounts; each page needs its permission.
describe('E2-4 admin login', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const newAdmin = async (pages?: string[]) => {
    const username = `a${randomInt(1e9)}`;
    const res = await http().post('/api/dev/admin').send({ username, name: 'Aisha', password: TEST_ADMIN_PASSWORD, pages }).expect(201);
    return { username, secret: res.body.totpSecret as string, admin: res.body.admin };
  };
  const login = (username: string, code: string, password = TEST_ADMIN_PASSWORD) => http().post('/api/admin/auth/login').send({ username, password, code });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('logs in with username, password and authenticator code; logout ends the session', async () => {
    const { username, secret, admin } = await newAdmin();
    expect(admin).toMatchObject({ username, name: 'Aisha', pages: ['dashboard', 'caregivers', 'pets', 'orders', 'rules', 'promos', 'payments', 'locations', 'cases', 'exceptions', 'reviews', 'money', 'actions', 'funnel', 'test-tools'] });
    const res = await login(` ${username.toUpperCase()} `, totpCode(secret)).expect(200);
    expect(res.body.admin).toEqual(admin);
    expect((await http().get('/api/admin/auth/me').set(bearer(res.body.token)).expect(200)).body).toEqual(admin);
    await http().post('/api/admin/auth/logout').set(bearer(res.body.token)).expect(204);
    expect((await http().get('/api/admin/auth/me').set(bearer(res.body.token)).expect(401)).body.code).toBe('ADMIN_LOGIN_EXPIRED');
  });

  it('an app account cannot use the admin console, and an admin token is not an app login', async () => {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const app1 = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    expect((await http().get('/api/admin/auth/me').set(bearer(app1.token)).expect(401)).body.code).toBe('ADMIN_LOGIN_EXPIRED');
    await http().get('/api/payments').set(bearer(app1.token)).expect(401);
    expect((await login(phone, '123456', 'whatever-123').expect(400)).body.code).toBe('ADMIN_LOGIN_FAILED');

    const { token } = await adminLogin(app);
    await http().get('/api/auth/me').set(bearer(token)).expect(401);
  });

  it('admin routes need a login', async () => {
    expect((await http().get('/api/payments').expect(401)).body.code).toBe('ADMIN_LOGIN_REQUIRED');
    await http().post('/api/payments/charges').send({ ref: 'x', amountSen: 100, method: 'tng' }).expect(401);
    await http().get('/api/history/payment/1').expect(401);
    await http().get('/api/rules').expect(200); // prices stay public for the app
  });

  it('a page without permission is blocked', async () => {
    const rulesOnly = await adminLogin(app, ['rules']);
    expect((await http().get('/api/payments').set(rulesOnly.header).expect(403)).body).toEqual({ code: 'PAGE_FORBIDDEN', message: 'You have no access to Payments (test)' });
    await http().post('/api/payments/charges').set(rulesOnly.header).send({ ref: `p-${randomInt(1e9)}`, amountSen: 100, method: 'tng' }).expect(403);
    await http().get('/api/history/payment/1').set(rulesOnly.header).expect(200);
    const full = await adminLogin(app);
    await http().get('/api/payments').set(full.header).expect(200);
  });

  it('the same answer for a wrong username, password or code', async () => {
    const { username, secret } = await newAdmin();
    const wrong = { code: 'ADMIN_LOGIN_FAILED', message: 'Wrong username, password or code' };
    expect((await login('nobody-here', totpCode(secret)).expect(400)).body).toEqual(wrong);
    expect((await login(username, totpCode(secret), 'not-the-pass-1').expect(400)).body).toEqual(wrong);
    expect((await login(username, String((Number(totpCode(secret)) + 1) % 1e6).padStart(6, '0')).expect(400)).body).toEqual(wrong);
    expect((await http().post('/api/admin/auth/login').send({ username }).expect(400)).body.code).toBe('ADMIN_LOGIN_MISSING');
  });

  it('a code works only once', async () => {
    const { username, secret } = await newAdmin();
    const code = totpCode(secret);
    await login(username, code).expect(200);
    expect((await login(username, code).expect(400)).body.code).toBe('ADMIN_LOGIN_FAILED');
  });

  it('five wrong tries lock the account for 15 minutes, even for the right details', async () => {
    const { username, secret } = await newAdmin();
    for (let i = 0; i < 4; i++) await login(username, '000000', 'wrong-pass-1').expect(400);
    expect((await login(username, '000000', 'wrong-pass-1').expect(400)).body).toEqual({ code: 'ADMIN_LOCKED', message: 'Too many wrong tries. Try again in 15 minutes' });
    expect((await login(username, totpCode(secret)).expect(400)).body.code).toBe('ADMIN_LOCKED');

    // 15 minutes later
    await app.get(DbService).pool.query("UPDATE admins SET locked_until = now() - interval '1 second' WHERE username = $1", [username]);
    await login(username, totpCode(secret)).expect(200);
  });

  it('a right login resets the wrong-try count', async () => {
    const { username, secret } = await newAdmin();
    for (let i = 0; i < 4; i++) await login(username, '000000').expect(400);
    await login(username, totpCode(secret)).expect(200);
    for (let i = 0; i < 4; i++) await login(username, '000000').expect(400);
    expect((await login(username, '000000').expect(400)).body.code).toBe('ADMIN_LOCKED');
  });

  it('checks new accounts', async () => {
    const { username } = await newAdmin();
    expect((await http().post('/api/dev/admin').send({ username, password: TEST_ADMIN_PASSWORD }).expect(409)).body.code).toBe('USERNAME_TAKEN');
    expect((await http().post('/api/dev/admin').send({ username: 'ok-name', password: 'short' }).expect(400)).body.code).toBe('WEAK_PASSWORD');
    expect((await http().post('/api/dev/admin').send({ username: 'no', password: TEST_ADMIN_PASSWORD }).expect(400)).body.code).toBe('BAD_USERNAME');
    expect((await http().post('/api/dev/admin').send({ username: 'ok-name2', password: TEST_ADMIN_PASSWORD, pages: ['bank'] }).expect(400)).body.code).toBe('BAD_PAGES');
    const { rows } = await app.get(DbService).pool.query('SELECT password_hash FROM admins WHERE username = $1', [username]);
    expect(rows[0].password_hash).not.toContain(TEST_ADMIN_PASSWORD);
  });

  // E14-4 (round 60): every admin action is in the log, read only.
  it('logs logins and changes with who, what, before → after and why; rows cannot be changed (R60-1 … R60-5)', async () => {
    const a = await adminLogin(app, ['rules', 'actions']);
    const tomorrow = tomorrowOf(klDate(new Date()));
    const saved = (await http().post('/api/admin/rules').set(a.header).send({ values: { 'price.cat': 4100 }, effectiveFrom: tomorrow, reason: 'Log test price' }).expect(200)).body as RulesAdmin;
    const v = saved.waiting!.version;
    await http().post(`/api/admin/rules/${v}/withdraw`).set(a.header).send({ reason: 'Log test withdraw' }).expect(200);
    const log = async (q: Record<string, string>) => (await http().get('/api/admin/actions').query({ admin: a.username, ...q }).set(a.header).expect(200)).body as ActionLogPage;

    const all = await log({});
    expect(all.rows.map((r) => [r.kind, r.what, r.change, r.reason, r.link])).toEqual([
      ['rules', `Rule version ${v}`, 'waiting → withdrawn', 'Log test withdraw', '/rules'],
      ['rules', `Rule version ${v}`, 'waiting', 'Log test price', '/rules'],
      ['login', expect.stringMatching(/^Admin login \d+$/), 'logged_in', 'Logged in with password and code', null],
    ]);
    expect(all.rows.every((r) => r.admin === a.username)).toBe(true);
    expect(all).toMatchObject({ total: 3, page: 1 });
    expect(all.admins).toContain(a.username);
    expect((await log({ kind: 'login' })).rows).toHaveLength(1);
    expect((await log({ kind: 'money' })).rows).toHaveLength(0);
    expect((await log({ from: klDate(new Date()), to: klDate(new Date()) })).rows).toHaveLength(3);
    expect((await log({ from: tomorrow })).rows).toHaveLength(0);
    expect((await http().get('/api/admin/actions').query({ kind: 'coffee' }).set(a.header).expect(400)).body.code).toBe('BAD_FILTER');

    // R60-3: the database refuses to change or delete an admin's row.
    const db = app.get(DbService).pool;
    const id = all.rows[0].id;
    await expect(db.query("UPDATE status_history SET reason = 'edited' WHERE id = $1", [id])).rejects.toThrow('Admin actions cannot be changed or deleted');
    await expect(db.query('DELETE FROM status_history WHERE id = $1', [id])).rejects.toThrow('Admin actions cannot be changed or deleted');
    expect((await log({})).rows[0].reason).toBe('Log test withdraw');

    // R60-5: only with the page.
    const other = await adminLogin(app, ['rules']);
    await http().get('/api/admin/actions').set(other.header).expect(403);
  });
});
