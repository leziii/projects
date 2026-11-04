import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type CaregiverProfile, type ChangeRow, type MessageList, type User } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { adminLogin } from './admin-helper';

// E4-4: caregivers keep their profile and area; changes that affect what they may do go to review first.
describe('E4-4 caregiver profile', () => {
  let app: INestApplication;
  let admin: Awaited<ReturnType<typeof adminLogin>>;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const randomIc = () => `8${randomInt(0, 10)}0${randomInt(1, 10)}1${randomInt(0, 10)}14${String(randomInt(0, 1e4)).padStart(4, '0')}`;
  const form = { fullName: 'Siti Aminah binti Ahmad', experienceYears: 3, cats: true, dogs: true, maxDogSize: 'small', areas: ['Bangsar'], guideRead: true };

  async function login() {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    const me: User = (await http().get('/api/auth/me').set(auth(token)).expect(200)).body;
    return { token, phone, id: me.id };
  }

  /** A caregiver who applied and was approved. */
  async function caregiver() {
    const c = await login();
    await http().post('/api/caregiver/application').set(auth(c.token)).send({ ...form, icNumber: randomIc() }).expect(200);
    for (const kind of ['ic_front', 'ic_back', 'selfie']) {
      await http().post(`/api/caregiver/application/files?kind=${kind}`).set(auth(c.token)).attach('photo', JPEG, { filename: 'p.jpg', contentType: 'image/jpeg' }).expect(200);
    }
    await http().post('/api/caregiver/application/submit').set(auth(c.token)).expect(200);
    await http().post(`/api/admin/caregivers/${c.id}/decision`).set(admin.header).send({ status: 'approved', idChecked: true }).expect(200);
    return c;
  }
  const save = (token: string, body: object) => http().post('/api/caregiver/profile').set(auth(token)).send(body);
  const decide = (id: number, status: string, note = '') => http().post(`/api/admin/profile-changes/${id}/decision`).set(admin.header).send({ status, note });

  beforeAll(async () => {
    process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'pawpal-uploads-'));
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    admin = await adminLogin(app);
  });

  afterAll(() => app.close());

  it('only approved caregivers have a profile', async () => {
    await http().get('/api/caregiver/profile').expect(401);
    const owner = await login();
    expect((await http().get('/api/caregiver/profile').set(auth(owner.token)).expect(403)).body.code).toBe('NOT_APPROVED');
  });

  it('starts from the application; areas, years, intro and lowering save at once', async () => {
    const c = await caregiver();
    const p: CaregiverProfile = (await http().get('/api/caregiver/profile').set(auth(c.token)).expect(200)).body;
    expect(p).toMatchObject({ displayName: 'Siti A.', cats: true, dogs: true, maxDogSize: 'small', areas: ['Bangsar'], experienceYears: 3, intro: '', pending: null });

    const saved: CaregiverProfile = (await save(c.token, { cats: true, dogs: false, areas: ['Bangsar', 'KLCC'], experienceYears: 4, intro: 'Cat lover' }).expect(200)).body;
    expect(saved).toMatchObject({ dogs: false, maxDogSize: null, areas: ['Bangsar', 'KLCC'], experienceYears: 4, intro: 'Cat lover', pending: null });
    expect((await save(c.token, { cats: true, areas: [], experienceYears: 4 }).expect(400)).body.code).toBe('PROFILE_AREA');
  });

  it('a larger dog size waits for review, then approve applies it and tells the caregiver', async () => {
    const c = await caregiver();
    const asked: CaregiverProfile = (await save(c.token, { cats: true, dogs: true, maxDogSize: 'large', areas: ['Bangsar'], experienceYears: 3 }).expect(200)).body;
    expect(asked).toMatchObject({ dogs: true, maxDogSize: 'small', pending: { ability: { dogs: true, maxDogSize: 'large' }, photo: false } });

    const rows: ChangeRow[] = (await http().get('/api/admin/profile-changes').set(admin.header).expect(200)).body;
    expect(rows.find((r) => r.userId === c.id)).toMatchObject({ displayName: 'Siti A.', summary: 'Dogs up to Large (over 25 kg)' });
    const detail = (await http().get(`/api/admin/profile-changes/${c.id}`).set(admin.header).expect(200)).body;
    expect(detail).toMatchObject({ current: 'Dogs up to Small (under 10 kg)', change: { ability: { maxDogSize: 'large' } } });
    expect(detail.selfieFileId).toBeTypeOf('number');

    const done: CaregiverProfile = (await decide(c.id, 'approved').expect(200)).body;
    expect(done).toMatchObject({ maxDogSize: 'large', pending: null });
    const inbox: MessageList = (await http().get('/api/messages').set(auth(c.token)).expect(200)).body;
    expect(inbox.items[0].title).toBe('Profile change approved');
    expect((await decide(c.id, 'approved').expect(409)).body.code).toBe('CHANGE_NOT_WAITING');
  });

  it('a new photo waits for review; not approved keeps the old profile and shows the reason', async () => {
    const c = await caregiver();
    const sent: CaregiverProfile = (
      await http().post('/api/caregiver/profile/photo').set(auth(c.token)).attach('photo', JPEG, { filename: 'me.jpg', contentType: 'image/jpeg' }).expect(200)
    ).body;
    expect(sent).toMatchObject({ hasPhoto: false, pending: { ability: null, photo: true } });
    await http().get('/api/caregiver/profile/photo?which=pending').set(auth(c.token)).expect(200);
    await http().get('/api/caregiver/profile/photo').set(auth(c.token)).expect(404);
    await http().get(`/api/admin/profile-changes/${c.id}/photo?which=pending`).set(admin.header).expect(200);

    // A dog raise joins the same waiting change.
    const both: CaregiverProfile = (await save(c.token, { cats: true, dogs: true, maxDogSize: 'medium', areas: ['Bangsar'], experienceYears: 3 }).expect(200)).body;
    expect(both.pending).toMatchObject({ ability: { maxDogSize: 'medium' }, photo: true });

    expect((await decide(c.id, 'rejected', 'no').expect(400)).body.code).toBe('APP_REASON_NEEDED');
    const kept: CaregiverProfile = (await decide(c.id, 'rejected', 'Face does not match the IC selfie').expect(200)).body;
    expect(kept).toMatchObject({ hasPhoto: false, maxDogSize: 'small', pending: null, lastRejected: 'Face does not match the IC selfie' });
    const inbox: MessageList = (await http().get('/api/messages').set(auth(c.token)).expect(200)).body;
    expect(inbox.items[0]).toMatchObject({ title: 'Profile change not approved', body: 'Face does not match the IC selfie Your profile stays as it was.' });
  });

  it('lowering again withdraws a waiting raise', async () => {
    const c = await caregiver();
    await save(c.token, { cats: true, dogs: true, maxDogSize: 'large', areas: ['Bangsar'], experienceYears: 3 }).expect(200);
    const back: CaregiverProfile = (await save(c.token, { cats: true, dogs: true, maxDogSize: 'small', areas: ['Bangsar'], experienceYears: 3 }).expect(200)).body;
    expect(back.pending).toBeNull();
    const rows: ChangeRow[] = (await http().get('/api/admin/profile-changes').set(admin.header).expect(200)).body;
    expect(rows.some((r) => r.userId === c.id)).toBe(false);
  });

  it('only admins with the Caregiver review page', async () => {
    const limited = await adminLogin(app, ['dashboard']);
    await http().get('/api/admin/profile-changes').set(limited.header).expect(403);
  });
});
