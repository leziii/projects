import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { CaregiverCard } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { adminLogin } from './admin-helper';

// E4-6: owners see a caregiver card with the Verified badge and, only when switched on, the insurance note.
describe('E4-6 Verified badge and insurance note', () => {
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof adminLogin>>;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const randomIc = () => `8${randomInt(0, 10)}0${randomInt(1, 10)}1${randomInt(0, 10)}14${String(randomInt(0, 1e4)).padStart(4, '0')}`;
  const form = { fullName: 'Siti Nur Aminah', experienceYears: 3, cats: true, dogs: true, maxDogSize: 'medium', areas: ['Bangsar', 'KLCC'], guideRead: true };

  async function login() {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    const { id } = (await http().get('/api/auth/me').set(auth(token)).expect(200)).body;
    return { phone, token, id: id as number };
  }

  async function applied() {
    const c = await login();
    await http().post('/api/caregiver/application').set(auth(c.token)).send({ ...form, icNumber: randomIc() }).expect(200);
    for (const kind of ['ic_front', 'ic_back', 'selfie']) {
      await http().post(`/api/caregiver/application/files?kind=${kind}`).set(auth(c.token)).attach('photo', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' }).expect(200);
    }
    await http().post('/api/caregiver/application/submit').set(auth(c.token)).expect(200);
    return c;
  }

  const setInsurance = (body: object) => http().post('/api/admin/insurance').set(admin.header).send(body);

  beforeAll(async () => {
    process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'pawpal-uploads-'));
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    admin = await adminLogin(app);
  });

  afterAll(async () => {
    await setInsurance({ on: false, note: '', reason: 'Test clean-up' });
    await app.close();
  });

  it('only approved caregivers have a card; badges follow the admin ticks; no contact details', async () => {
    const owner = await login();
    const c = await applied();
    await http().get(`/api/caregivers/${c.id}`).expect(401);
    expect((await http().get(`/api/caregivers/${c.id}`).set(auth(owner.token)).expect(404)).body.code).toBe('CAREGIVER_NOT_FOUND');

    await http().post(`/api/admin/caregivers/${c.id}/decision`).set(admin.header).send({ status: 'approved', idChecked: true, certChecked: true }).expect(200);
    const card: CaregiverCard = (await http().get(`/api/caregivers/${c.id}`).set(auth(owner.token)).expect(200)).body;
    expect(card).toMatchObject({ id: c.id, displayName: 'Siti A.', initials: 'SA', hasPhoto: false, experienceYears: 3, areas: ['Bangsar', 'KLCC'], cats: true, dogs: true, maxDogSize: 'medium', idVerified: true, certChecked: true });
    const text = JSON.stringify(card);
    expect(text).not.toContain(c.phone.slice(-8));
    expect(text).not.toContain('Aminah');

    // Only the approved photo: a waiting one is not shown.
    await http().get(`/api/caregivers/${c.id}/photo`).set(auth(owner.token)).expect(404);
    await http().post('/api/caregiver/profile/photo').set(auth(c.token)).attach('photo', JPEG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(200);
    await http().get(`/api/caregivers/${c.id}/photo`).set(auth(owner.token)).expect(404);
    await http().post(`/api/admin/profile-changes/${c.id}/decision`).set(admin.header).send({ status: 'approved' }).expect(200);
    expect((await http().get(`/api/caregivers/${c.id}`).set(auth(owner.token)).expect(200)).body.hasPhoto).toBe(true);
    await http().get(`/api/caregivers/${c.id}/photo`).set(auth(owner.token)).expect(200);

    // ID only, no certificate tick.
    const d = await applied();
    await http().post(`/api/admin/caregivers/${d.id}/decision`).set(admin.header).send({ status: 'approved', idChecked: true }).expect(200);
    expect((await http().get(`/api/caregivers/${d.id}`).set(auth(owner.token)).expect(200)).body).toMatchObject({ idVerified: true, certChecked: false });

    // Approved without an application (test tools): shown, but no badge. Suspended: hidden.
    const t = await login();
    await http().post('/api/dev/caregiver-status').send({ phone: t.phone, status: 'approved', reason: 'test setup' }).expect(201);
    expect((await http().get(`/api/caregivers/${t.id}`).set(auth(owner.token)).expect(200)).body).toMatchObject({ idVerified: false, certChecked: false });
    await http().post('/api/dev/caregiver-status').send({ phone: c.phone, status: 'suspended', reason: 'test setup' }).expect(201);
    await http().get(`/api/caregivers/${c.id}`).set(auth(owner.token)).expect(404);
  });

  it('insurance note shows only when switched on; every change is in the history', async () => {
    const owner = await login();
    const c = await applied();
    await http().post(`/api/admin/caregivers/${c.id}/decision`).set(admin.header).send({ status: 'approved', idChecked: true }).expect(200);

    expect((await setInsurance({ on: true, note: 'abc', reason: 'Policy signed' }).expect(400)).body.code).toBe('INSURANCE_NOTE');
    expect((await setInsurance({ on: true, note: 'Pet injury cover', reason: 'ok' }).expect(400)).body.code).toBe('REASON_REQUIRED');
    const on = (await setInsurance({ on: true, note: 'Pet injury cover up to RM5,000 per visit', reason: 'Policy signed' }).expect(200)).body;
    expect(on.insurance).toEqual({ on: true, note: 'Pet injury cover up to RM5,000 per visit' });
    expect(on.history.at(-1)).toMatchObject({ fromStatus: 'off', toStatus: 'on', actorType: 'admin', actorId: admin.username, reason: 'Policy signed · Note: Pet injury cover up to RM5,000 per visit' });
    expect((await http().get(`/api/caregivers/${c.id}`).set(auth(owner.token)).expect(200)).body.insurance).toBe('Pet injury cover up to RM5,000 per visit');

    await setInsurance({ on: false, note: 'Pet injury cover up to RM5,000 per visit', reason: 'Policy ended' }).expect(200);
    expect((await http().get(`/api/caregivers/${c.id}`).set(auth(owner.token)).expect(200)).body.insurance).toBeNull();

    const pets = await adminLogin(app, ['pets']);
    await http().get('/api/admin/insurance').set(pets.header).expect(403);
  });
});
