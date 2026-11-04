import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpCode } from '../src/admin/totp';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
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
    expect(admin).toMatchObject({ username, name: 'Aisha', pages: ['dashboard', 'caregivers', 'pets', 'rules', 'promos', 'payments', 'test-tools'] });
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
    expect((await http().post('/api/dev/admin').send({ username: 'ok-name2', password: TEST_ADMIN_PASSWORD, pages: ['money'] }).expect(400)).body.code).toBe('BAD_PAGES');
    const { rows } = await app.get(DbService).pool.query('SELECT password_hash FROM admins WHERE username = $1', [username]);
    expect(rows[0].password_hash).not.toContain(TEST_ADMIN_PASSWORD);
  });
});
