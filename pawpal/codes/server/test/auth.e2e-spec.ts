import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { MockSmsSender, SMS_SENDER } from '../src/sms/sms';

// E2-1: phone + SMS code login (mock SMS in development).
describe('E2-1 login with phone and SMS code', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  /** A fresh Malaysian mobile number for each test, so limits never collide. */
  const newPhone = () => `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
  const wrong = (code: string) => String((Number(code) + 1) % 1e6).padStart(6, '0');

  const sendCode = async (phone: string) => (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
  const login = (phone: string, code: string, acceptTerms: unknown = true) => http().post('/api/auth/login').send({ phone, code, acceptTerms });

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('sends a 6-digit code by SMS and shows it only in development', async () => {
    const phone = newPhone();
    const sent = await sendCode(phone);
    expect(sent).toMatchObject({ phone, expiresInSec: 300, resendInSec: 60 });
    expect(sent.devCode).toMatch(/^\d{6}$/);
    const sms = app.get<MockSmsSender>(SMS_SENDER).lastMessage(phone);
    expect(sms).toBe(`Your PawPal code is ${sent.devCode}. It expires in 5 minutes. Never share it.`);
  });

  it('accepts the number however it is typed', async () => {
    const digits = newPhone().slice(5); // 8 digits after +6011
    const res = await http().post('/api/auth/code').send({ phone: `011-${digits.slice(0, 4)} ${digits.slice(4)}` }).expect(200);
    expect(res.body.phone).toBe(`+6011${digits}`);
  });

  it('first login creates the account and returns a token; /me knows the user', async () => {
    const phone = newPhone();
    const { devCode } = await sendCode(phone);
    const res = await login(phone, devCode).expect(200);
    expect(res.body).toMatchObject({ isNew: true, user: { phone } });
    expect(res.body.token).toMatch(/^[\w-]{43}$/);
    const me = await http().get('/api/auth/me').set('authorization', `Bearer ${res.body.token}`).expect(200);
    expect(me.body).toEqual(res.body.user);
  });

  it('second login finds the same account', async () => {
    const phone = newPhone();
    const first = await login(phone, (await sendCode(phone)).devCode).expect(200);
    await app.get(RedisService).client.del(`auth:wait:${phone}`);
    const second = await login(phone, (await sendCode(phone)).devCode).expect(200);
    expect(second.body).toMatchObject({ isNew: false, user: { id: first.body.user.id } });
  });

  it('wrong code: says how many tries are left; five wrong tries kill the code', async () => {
    const phone = newPhone();
    const { devCode } = await sendCode(phone);
    for (let left = 4; left >= 1; left--) {
      const res = await login(phone, wrong(devCode)).expect(400);
      expect(res.body).toEqual({ code: 'CODE_WRONG', message: `Wrong code. ${left} ${left === 1 ? 'try' : 'tries'} left` });
    }
    expect((await login(phone, wrong(devCode)).expect(400)).body.code).toBe('TOO_MANY_TRIES');
    expect((await login(phone, devCode).expect(400)).body.code).toBe('CODE_EXPIRED');
  });

  it('expired code is refused', async () => {
    const phone = newPhone();
    const { devCode } = await sendCode(phone);
    await app.get(RedisService).client.pexpire(`auth:code:${phone}`, 1);
    await new Promise((r) => setTimeout(r, 20));
    expect((await login(phone, devCode).expect(400)).body).toEqual({ code: 'CODE_EXPIRED', message: 'This code has expired. Ask for a new one' });
  });

  it('a code works once, even when sent twice at the same moment', async () => {
    const phone = newPhone();
    const { devCode } = await sendCode(phone);
    const results = await Promise.all([login(phone, devCode), login(phone, devCode), login(phone, devCode)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
  });

  it('a new code replaces the old one', async () => {
    const phone = newPhone();
    const old = (await sendCode(phone)).devCode;
    await app.get(RedisService).client.del(`auth:wait:${phone}`);
    const fresh = (await sendCode(phone)).devCode;
    if (old !== fresh) expect((await login(phone, old).expect(400)).body.code).toBe('CODE_WRONG');
    await login(phone, fresh).expect(200);
  });

  it('limits: wait 60 s between codes, at most 5 per hour', async () => {
    const phone = newPhone();
    await sendCode(phone);
    const soon = await http().post('/api/auth/code').send({ phone }).expect(400);
    expect(soon.body.code).toBe('CODE_TOO_SOON');
    expect(soon.body.message).toMatch(/^Please wait \d+ s before asking for a new code$/);
    const redis = app.get(RedisService).client;
    for (let i = 2; i <= 5; i++) {
      await redis.del(`auth:wait:${phone}`);
      await sendCode(phone);
    }
    await redis.del(`auth:wait:${phone}`);
    expect((await http().post('/api/auth/code').send({ phone }).expect(400)).body.code).toBe('TOO_MANY_CODES');
  });

  it('must accept the terms; checks the phone and code format', async () => {
    const phone = newPhone();
    const { devCode } = await sendCode(phone);
    expect((await login(phone, devCode, false).expect(400)).body.code).toBe('TERMS_REQUIRED');
    expect((await login(phone, '12345').expect(400)).body.code).toBe('BAD_CODE');
    expect((await http().post('/api/auth/code').send({ phone: '03-1234 5678' }).expect(400)).body).toEqual({
      code: 'BAD_PHONE',
      message: 'Enter a Malaysian mobile number, e.g. 012-345 6789',
    });
    expect((await http().post('/api/auth/code').send({}).expect(400)).body.code).toBe('BAD_PHONE');
    await login(phone, devCode).expect(200); // the code still works after the refusals above
  });

  it('/me needs a valid token; logout ends the session', async () => {
    expect((await http().get('/api/auth/me').expect(401)).body.code).toBe('LOGIN_REQUIRED');
    expect((await http().get('/api/auth/me').set('authorization', 'Bearer nope').expect(401)).body.code).toBe('LOGIN_EXPIRED');
    const phone = newPhone();
    const { token } = (await login(phone, (await sendCode(phone)).devCode).expect(200)).body;
    await http().post('/api/auth/logout').set('authorization', `Bearer ${token}`).expect(204);
    expect((await http().get('/api/auth/me').set('authorization', `Bearer ${token}`).expect(401)).body.code).toBe('LOGIN_EXPIRED');
    await http().post('/api/auth/logout').expect(204);
  });
});
