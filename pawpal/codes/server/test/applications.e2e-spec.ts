import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CARE_GUIDE, type Application, type MessageList, type ReviewRow, type User } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { adminLogin } from './admin-helper';

// E4-1: caregivers apply with their documents; missing items block submit; the draft reloads; submit locks it.
describe('E4-1 caregiver application', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  const form = { fullName: 'Siti Aminah', icNumber: '900101145678', experienceYears: 3, cats: true, dogs: true, maxDogSize: 'medium', areas: ['Bangsar', 'Mont Kiara'], guideRead: true };

  async function login(): Promise<{ token: string; phone: string }> {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    return { token, phone };
  }
  const upload = (token: string, kind: string, data = JPEG) =>
    http().post(`/api/caregiver/application/files?kind=${kind}`).set(auth(token)).attach('photo', data, { filename: 'p.jpg', contentType: 'image/jpeg' });

  beforeAll(async () => {
    process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'pawpal-uploads-'));
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('needs a login', async () => {
    await http().get('/api/caregiver/application').expect(401);
    await http().post('/api/caregiver/application/submit').expect(401);
  });

  it('starts as an empty draft and lists what is missing', async () => {
    const { token } = await login();
    const a: Application = (await http().get('/api/caregiver/application').set(auth(token)).expect(200)).body;
    expect(a).toMatchObject({ status: 'draft', fullName: '', files: [] });
    expect(a.missing).toEqual(['Full name', 'IC number', 'IC front', 'IC back', 'Selfie holding your IC', 'Years of experience', 'Cats or dogs', 'At least one area', 'Read the care guide']);
    const guide = (await http().get('/api/caregiver/guide').set(auth(token)).expect(200)).body;
    expect(guide.version).toBe(CARE_GUIDE.version);
  });

  it('saves a draft that reloads, with the IC number encrypted', async () => {
    const { token, phone } = await login();
    await http().post('/api/caregiver/application').set(auth(token)).send({ fullName: 'Siti', icNumber: '900101 14 5678' }).expect(200);
    const again: Application = (await http().get('/api/caregiver/application').set(auth(token)).expect(200)).body;
    expect(again).toMatchObject({ status: 'draft', fullName: 'Siti', icNumber: '900101-14-5678' });

    const db = app.get(DbService);
    const { rows } = await db.pool.query('SELECT a.ic_secret FROM caregiver_applications a JOIN users u ON u.id = a.user_id WHERE u.phone = $1', [phone]);
    expect(rows[0].ic_secret).toMatch(/^v1\./);
    expect(rows[0].ic_secret).not.toContain('5678');
  });

  it('rejects a bad IC number, under-18s and unknown areas', async () => {
    const { token } = await login();
    expect((await http().post('/api/caregiver/application').set(auth(token)).send({ icNumber: '12345' }).expect(400)).body.code).toBe('IC_FORMAT');
    expect((await http().post('/api/caregiver/application').set(auth(token)).send({ icNumber: '901301145678' }).expect(400)).body.code).toBe('IC_FORMAT');
    const yy = String((new Date().getUTCFullYear() - 10) % 100).padStart(2, '0');
    expect((await http().post('/api/caregiver/application').set(auth(token)).send({ icNumber: `${yy}0101145678` }).expect(400)).body.code).toBe('IC_UNDER_AGE');
    expect((await http().post('/api/caregiver/application').set(auth(token)).send({ areas: ['Penang'] }).expect(400)).body.code).toBe('APP_AREA');
  });

  it('photos: one IC front at a time, up to 3 certificates, images only, own photos only', async () => {
    const { token } = await login();
    await upload(token, 'ic_front').expect(200);
    const replaced: Application = (await upload(token, 'ic_front').expect(200)).body;
    expect(replaced.files.filter((f) => f.kind === 'ic_front')).toHaveLength(1);
    for (let i = 0; i < 3; i++) await upload(token, 'certificate').expect(200);
    expect((await upload(token, 'certificate').expect(409)).body.code).toBe('FILE_LIMIT');
    expect((await upload(token, 'passport').expect(400)).body.code).toBe('FILE_KIND');
    expect((await upload(token, 'selfie', Buffer.from('<svg/>')).expect(400)).body.code).toBe('PHOTO_TYPE');

    const id = replaced.files[0].id;
    const photo = await http().get(`/api/caregiver/application/files/${id}`).set(auth(token)).expect(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    const other = await login();
    await http().get(`/api/caregiver/application/files/${id}`).set(auth(other.token)).expect(404);
    await http().post(`/api/caregiver/application/files/${id}/delete`).set(auth(other.token)).expect(404);

    const after: Application = (await http().post(`/api/caregiver/application/files/${id}/delete`).set(auth(token)).expect(200)).body;
    expect(after.files.some((f) => f.kind === 'ic_front')).toBe(false);
  });

  it('missing items block submit; a full application submits, locks and makes the account pending', async () => {
    const { token } = await login();
    await http().post('/api/caregiver/application').set(auth(token)).send(form).expect(200);
    const blocked = await http().post('/api/caregiver/application/submit').set(auth(token)).expect(409);
    expect(blocked.body).toMatchObject({ code: 'APP_INCOMPLETE', missing: ['IC front', 'IC back', 'Selfie holding your IC'] });

    for (const kind of ['ic_front', 'ic_back', 'selfie']) await upload(token, kind).expect(200);
    const sent: Application = (await http().post('/api/caregiver/application/submit').set(auth(token)).expect(200)).body;
    expect(sent).toMatchObject({ status: 'submitted', missing: [] });
    expect(sent.submittedAt).toBeTruthy();

    const me: User = (await http().get('/api/auth/me').set(auth(token)).expect(200)).body;
    expect(me.caregiverStatus).toBe('pending');
    const inbox: MessageList = (await http().get('/api/messages').set(auth(token)).expect(200)).body;
    expect(inbox.items[0]).toMatchObject({ title: 'Application received' });

    // Locked until an admin asks for more info.
    expect((await http().post('/api/caregiver/application').set(auth(token)).send(form).expect(409)).body.code).toBe('APP_LOCKED');
    expect((await upload(token, 'certificate').expect(409)).body.code).toBe('APP_LOCKED');
    expect((await http().post('/api/caregiver/application/submit').set(auth(token)).expect(409)).body.code).toBe('APP_LOCKED');
  });

  it('an approved caregiver cannot apply again', async () => {
    const { token, phone } = await login();
    await http().post('/api/dev/caregiver-status').send({ phone, status: 'approved', reason: 'test setup' }).expect(201);
    expect((await http().post('/api/caregiver/application').set(auth(token)).send(form).expect(409)).body.code).toBe('ALREADY_CAREGIVER');
  });

  // A random adult IC so runs never clash on the same-IC rule.
  const randomIc = () => `8${randomInt(0, 10)}0${randomInt(1, 10)}1${randomInt(0, 10)}14${String(randomInt(0, 1e4)).padStart(4, '0')}`;

  async function submitted(ic = randomIc()) {
    const user = await login();
    await http().post('/api/caregiver/application').set(auth(user.token)).send({ ...form, icNumber: ic }).expect(200);
    for (const kind of ['ic_front', 'ic_back', 'selfie']) await upload(user.token, kind).expect(200);
    await http().post('/api/caregiver/application/submit').set(auth(user.token)).expect(200);
    const me: User = (await http().get('/api/auth/me').set(auth(user.token)).expect(200)).body;
    return { ...user, id: me.id, ic };
  }

  it('E4-2: admin list, needs info with a reason, resubmit, approve with the IC tick; the caregiver is told each time', async () => {
    const admin = await adminLogin(app);
    const c = await submitted();
    const decide = (body: object) => http().post(`/api/admin/caregivers/${c.id}/decision`).set(admin.header).send(body);

    const waiting: ReviewRow[] = (await http().get('/api/admin/caregivers').set(admin.header).expect(200)).body;
    expect(waiting.find((r) => r.userId === c.id)).toMatchObject({ fullName: 'Siti Aminah', status: 'submitted', documents: 'Complete', sameIc: false });
    const detail = (await http().get(`/api/admin/caregivers/${c.id}`).set(admin.header).expect(200)).body;
    expect(detail.application.icNumber).toBe(`******-**-${c.ic.slice(-4)}`);
    expect(detail.history.map((h: { toStatus: string }) => h.toStatus)).toEqual(['submitted']);
    const photo = await http().get(`/api/admin/caregivers/${c.id}/files/${detail.application.files[0].id}`).set(admin.header).expect(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');

    // Showing the full IC is recorded.
    const shown = (await http().post(`/api/admin/caregivers/${c.id}/ic`).set(admin.header).expect(200)).body;
    expect(shown.icNumber).toBe(`${c.ic.slice(0, 6)}-${c.ic.slice(6, 8)}-${c.ic.slice(8)}`);
    const afterShow = (await http().get(`/api/admin/caregivers/${c.id}`).set(admin.header).expect(200)).body;
    expect(afterShow.icViews[0]).toMatchObject({ actorId: admin.username, reason: 'Full IC number shown' });

    // Needs info: reason required; the caregiver sees it and can edit again.
    expect((await decide({ status: 'needs_info', note: 'no' }).expect(400)).body.code).toBe('APP_REASON_NEEDED');
    await decide({ status: 'needs_info', note: 'Retake the IC back, it is blurry' }).expect(200);
    const mine: Application = (await http().get('/api/caregiver/application').set(auth(c.token)).expect(200)).body;
    expect(mine).toMatchObject({ status: 'needs_info', adminNote: 'Retake the IC back, it is blurry' });
    const inbox: MessageList = (await http().get('/api/messages').set(auth(c.token)).expect(200)).body;
    expect(inbox.items[0]).toMatchObject({ title: 'More info needed for your application', body: 'Retake the IC back, it is blurry Open your application to update it.' });
    expect((await decide({ status: 'approved', idChecked: true }).expect(409)).body.code).toBe('APP_NOT_WAITING');

    await upload(c.token, 'ic_back').expect(200);
    await http().post('/api/caregiver/application/submit').set(auth(c.token)).expect(200);

    // Approve needs the IC tick.
    expect((await decide({ status: 'approved' }).expect(400)).body.code).toBe('APP_ID_CHECK');
    const done = (await decide({ status: 'approved', idChecked: true, certChecked: true }).expect(200)).body;
    expect(done.application.status).toBe('approved');
    expect(done.history.map((h: { toStatus: string; actorType: string }) => `${h.actorType}:${h.toStatus}`)).toEqual([
      'caregiver:submitted',
      'admin:needs_info',
      'caregiver:submitted',
      'admin:approved',
    ]);
    expect(done.history[3].reason).toBe('IC and selfie match, certificates checked');
    const me: User = (await http().get('/api/auth/me').set(auth(c.token)).expect(200)).body;
    expect(me.caregiverStatus).toBe('approved');
    const last: MessageList = (await http().get('/api/messages').set(auth(c.token)).expect(200)).body;
    expect(last.items[0].title).toBe('You are a PawPal caregiver');
  });

  it('E4-2: not approved can resubmit; the same IC on another account is flagged and cannot be approved twice', async () => {
    const admin = await adminLogin(app);
    const first = await submitted();
    const second = await submitted(first.ic);
    const decide = (id: number, body: object) => http().post(`/api/admin/caregivers/${id}/decision`).set(admin.header).send(body);

    const rows: ReviewRow[] = (await http().get('/api/admin/caregivers?status=submitted').set(admin.header).expect(200)).body;
    expect(rows.find((r) => r.userId === second.id)?.sameIc).toBe(true);
    const detail = (await http().get(`/api/admin/caregivers/${second.id}`).set(admin.header).expect(200)).body;
    expect(detail.sameIc).toEqual([{ phone: expect.stringMatching(/^\+60 11-/), status: 'submitted' }]);

    await decide(first.id, { status: 'approved', idChecked: true }).expect(200);
    expect((await decide(second.id, { status: 'approved', idChecked: true }).expect(409)).body.code).toBe('IC_ALREADY_APPROVED');
    await decide(second.id, { status: 'rejected', note: 'IC already used by another account' }).expect(200);
    const me: User = (await http().get('/api/auth/me').set(auth(second.token)).expect(200)).body;
    expect(me.caregiverStatus).toBe('rejected');
    const rejected: ReviewRow[] = (await http().get('/api/admin/caregivers?status=rejected').set(admin.header).expect(200)).body;
    expect(rejected.some((r) => r.userId === second.id)).toBe(true);

    // Not approved: the caregiver may fix it and send it again.
    await http().post('/api/caregiver/application').set(auth(second.token)).send({ ...form, icNumber: randomIc() }).expect(200);
    await http().post('/api/caregiver/application/submit').set(auth(second.token)).expect(200);
    const again: User = (await http().get('/api/auth/me').set(auth(second.token)).expect(200)).body;
    expect(again.caregiverStatus).toBe('pending');
  });

  it('E4-2: only admins with the Caregiver review page', async () => {
    await http().get('/api/admin/caregivers').expect(401);
    const limited = await adminLogin(app, ['dashboard']);
    await http().get('/api/admin/caregivers').set(limited.header).expect(403);
    const admin = await adminLogin(app);
    expect((await http().get('/api/admin/caregivers?status=draft').set(admin.header).expect(400)).body.code).toBe('BAD_FILTER');
  });

  it('E4-3: caregiver actions need an approved caregiver in the caregiver role', async () => {
    const c = await submitted();
    const refused = await http().get('/api/caregiver/home').set(auth(c.token)).expect(403);
    expect(refused.body.code).toBe('NOT_APPROVED');
    await http().post('/api/auth/role').set(auth(c.token)).send({ role: 'caregiver' }).expect(400);

    const admin = await adminLogin(app);
    await http().post(`/api/admin/caregivers/${c.id}/decision`).set(admin.header).send({ status: 'approved', idChecked: true }).expect(200);
    expect((await http().get('/api/caregiver/home').set(auth(c.token)).expect(403)).body.code).toBe('ROLE_REQUIRED');
    await http().post('/api/auth/role').set(auth(c.token)).send({ role: 'caregiver' }).expect(200);
    expect((await http().get('/api/caregiver/home').set(auth(c.token)).expect(200)).body).toEqual({ newRequests: 0, todayVisits: 0 });

    // Suspended: refused again at once.
    await http().post('/api/dev/caregiver-status').send({ phone: c.phone, status: 'suspended', reason: 'test suspend' }).expect(201);
    expect((await http().get('/api/caregiver/home').set(auth(c.token)).expect(403)).body.code).toBe('NOT_APPROVED');
  });
});
