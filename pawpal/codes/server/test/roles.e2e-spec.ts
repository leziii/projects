import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { User } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { AuthGuard, CurrentUser, NeedsRole } from '../src/auth/auth.guard';
import { RedisService } from '../src/redis/redis.service';
import { adminLogin } from './admin-helper';

/** Test-only routes to prove the role guard works. */
@Controller('test-roles')
class RoleTestController {
  @Get('caregiver')
  @UseGuards(AuthGuard)
  @NeedsRole('caregiver')
  caregiver(@CurrentUser() user: User) {
    return { ok: true, id: user.id };
  }

  @Get('owner')
  @UseGuards(AuthGuard)
  @NeedsRole('owner')
  owner() {
    return { ok: true };
  }
}

// E2-2: one account, two roles. Only approved caregivers can switch; a role never changes who owns what.
describe('E2-2 role switch', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const newPhone = () => `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;

  async function loginAs(phone = newPhone()): Promise<{ token: string; user: User; phone: string }> {
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const res = await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200);
    return { ...res.body, phone };
  }
  const setStatus = (phone: string, status: string, reason = 'Checked IC and interview') =>
    http().post('/api/dev/caregiver-status').send({ phone, status, reason });
  const switchRole = (token: string, role: string) => http().post('/api/auth/role').set('authorization', `Bearer ${token}`).send({ role });
  const me = async (token: string): Promise<User> => (await http().get('/api/auth/me').set('authorization', `Bearer ${token}`).expect(200)).body;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule], controllers: [RoleTestController] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('a new account is an owner with no caregiver status', async () => {
    const { user } = await loginAs();
    expect(user).toMatchObject({ caregiverStatus: 'none', activeRole: 'owner' });
  });

  it('an unapproved user cannot switch to caregiver', async () => {
    const { token, phone } = await loginAs();
    expect((await switchRole(token, 'caregiver').expect(400)).body).toEqual({ code: 'ROLE_NOT_ALLOWED', message: 'Apply to become a caregiver first' });
    await setStatus(phone, 'pending').expect(201);
    expect((await switchRole(token, 'caregiver').expect(400)).body.message).toBe('Your caregiver application is still being reviewed');
    expect((await me(token)).activeRole).toBe('owner');
  });

  it('an approved caregiver switches both ways; the account stays the same', async () => {
    const { token, phone, user } = await loginAs();
    await setStatus(phone, 'approved').expect(201);
    const asCaregiver = (await switchRole(token, 'caregiver').expect(200)).body;
    expect(asCaregiver).toEqual({ ...user, caregiverStatus: 'approved', activeRole: 'caregiver' });
    expect(await me(token)).toEqual(asCaregiver);
    const back = (await switchRole(token, 'owner').expect(200)).body;
    expect(back).toMatchObject({ id: user.id, activeRole: 'owner' });
  });

  it('the role belongs to one login: another device stays owner', async () => {
    const first = await loginAs();
    await setStatus(first.phone, 'approved').expect(201);
    await switchRole(first.token, 'caregiver').expect(200);
    await app.get(RedisService).client.del(`auth:wait:${first.phone}`); // skip the 60 s resend wait
    const second = await loginAs(first.phone);
    expect(second.user).toMatchObject({ id: first.user.id, activeRole: 'owner' });
    expect((await me(first.token)).activeRole).toBe('caregiver');
  });

  it('a suspended caregiver falls back to owner at once', async () => {
    const { token, phone } = await loginAs();
    await setStatus(phone, 'approved').expect(201);
    await switchRole(token, 'caregiver').expect(200);
    await setStatus(phone, 'suspended', 'Repeated no-shows').expect(201);
    expect(await me(token)).toMatchObject({ caregiverStatus: 'suspended', activeRole: 'owner' });
    expect((await switchRole(token, 'caregiver').expect(400)).body.message).toBe('Your caregiver account is suspended');
  });

  it('routes can require a role', async () => {
    const { token, phone } = await loginAs();
    const get = (path: string) => http().get(`/api/test-roles/${path}`).set('authorization', `Bearer ${token}`);
    // Not approved: refused whatever role is asked (E4-3, R14-4).
    expect((await get('caregiver').expect(403)).body).toEqual({ code: 'NOT_APPROVED', message: 'Your caregiver application is not approved yet' });
    await get('owner').expect(200);
    await setStatus(phone, 'approved').expect(201);
    expect((await get('caregiver').expect(403)).body).toEqual({ code: 'ROLE_REQUIRED', message: 'Switch to the caregiver role to do this' });
    await switchRole(token, 'caregiver').expect(200);
    await get('caregiver').expect(200);
    await get('owner').expect(403);
    await http().get('/api/test-roles/caregiver').expect(401);
  });

  it('every caregiver status change is logged with who and why', async () => {
    const { phone, user } = await loginAs();
    await setStatus(phone, 'approved').expect(201);
    await setStatus(phone, 'approved').expect(201); // no change → no extra row
    await setStatus(phone, 'suspended', 'Repeated no-shows').expect(201);
    const h = (await http().get(`/api/history/caregiver/${user.id}`).set((await adminLogin(app)).header).expect(200)).body;
    expect(h.map((c: { fromStatus: string; toStatus: string; actorId: string; reason: string }) => `${c.fromStatus}>${c.toStatus} ${c.actorId}: ${c.reason}`)).toEqual([
      'none>approved dev-tool: Checked IC and interview',
      'approved>suspended dev-tool: Repeated no-shows',
    ]);
  });

  it('checks input', async () => {
    const { token, phone } = await loginAs();
    expect((await switchRole(token, 'admin').expect(400)).body.code).toBe('BAD_ROLE');
    await http().post('/api/auth/role').send({ role: 'owner' }).expect(401);
    expect((await setStatus(phone, 'boss').expect(400)).body.code).toBe('BAD_STATUS');
    expect((await setStatus(phone, 'approved', 'ok').expect(400)).body.code).toBe('REASON_REQUIRED');
    expect((await setStatus(newPhone(), 'approved').expect(404)).body.code).toBe('USER_NOT_FOUND');
  });
});
