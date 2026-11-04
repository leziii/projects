import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { klYearMonth, type MessageList, type Pet, type PetCheckRow } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { adminLogin } from './admin-helper';

// E3-1: owners add and edit cat and dog profiles; dogs need breed and weight; risky pets go to an admin check.
describe('E3-1 pet profiles', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const now = klYearMonth(new Date());
  const monthsAgo = (n: number) => {
    const i = now.year * 12 + now.month - 1 - n;
    return { year: Math.floor(i / 12), month: (i % 12) + 1 };
  };
  const cat = { kind: 'cat', name: 'Mimi', birth: monthsAgo(36), vaccinated: true, lastVaccine: monthsAgo(2), confirmed: true };
  const dog = { ...cat, kind: 'dog', name: 'Lucky', breed: 'Corgi', weightKg: 12 };
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

  async function login(): Promise<string> {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    return (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body.token;
  }

  beforeAll(async () => {
    process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), 'pawpal-uploads-'));
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('needs a login', async () => {
    await http().get('/api/pets').expect(401);
    await http().post('/api/pets').send(cat).expect(401);
  });

  it('adds and edits a cat and a dog', async () => {
    const token = await login();
    const mimi: Pet = (await http().post('/api/pets').set(auth(token)).send(cat).expect(201)).body;
    expect(mimi).toMatchObject({ kind: 'cat', name: 'Mimi', breed: null, weightKg: null, status: 'approved', checkReasons: [], hasVaccinePhoto: false });
    const lucky: Pet = (await http().post('/api/pets').set(auth(token)).send(dog).expect(201)).body;
    expect(lucky).toMatchObject({ kind: 'dog', breed: 'Corgi', weightKg: 12, status: 'approved' });

    const edited: Pet = (await http().post(`/api/pets/${lucky.id}`).set(auth(token)).send({ ...dog, name: 'Lucky Boy', weightKg: 13.5 }).expect(200)).body;
    expect(edited).toMatchObject({ id: lucky.id, name: 'Lucky Boy', weightKg: 13.5 });
    const list: Pet[] = (await http().get('/api/pets').set(auth(token)).expect(200)).body;
    expect(list.map((p) => p.name)).toEqual(['Mimi', 'Lucky Boy']);
  });

  it('a dog without breed or weight cannot save', async () => {
    const token = await login();
    const noBreed = await http().post('/api/pets').set(auth(token)).send({ ...dog, breed: '' }).expect(400);
    expect(noBreed.body.code).toBe('PET_BREED');
    const noWeight = await http().post('/api/pets').set(auth(token)).send({ ...dog, weightKg: null }).expect(400);
    expect(noWeight.body.code).toBe('PET_WEIGHT');
    const notConfirmed = await http().post('/api/pets').set(auth(token)).send({ ...cat, confirmed: false }).expect(400);
    expect(notConfirmed.body.code).toBe('PET_NOT_CONFIRMED');
    expect((await http().get('/api/pets').set(auth(token)).expect(200)).body).toEqual([]);
  });

  it('senior, unvaccinated or old-record pets and health notes go to an admin check', async () => {
    const token = await login();
    const add = async (body: object): Promise<Pet> => (await http().post('/api/pets').set(auth(token)).send(body).expect(201)).body;
    expect(await add({ ...cat, birth: monthsAgo(12 * 12) })).toMatchObject({ status: 'pending', checkReasons: ['senior'] });
    expect(await add({ ...dog, birth: monthsAgo(8 * 12) })).toMatchObject({ status: 'pending', checkReasons: ['senior'] });
    expect(await add({ ...cat, vaccinated: false })).toMatchObject({ status: 'pending', checkReasons: ['no_vaccine'] });
    expect(await add({ ...cat, lastVaccine: monthsAgo(13) })).toMatchObject({ status: 'pending', checkReasons: ['old_vaccine'] });
    const noted = await add({ ...cat, healthNote: 'Kidney diet' });
    expect(noted).toMatchObject({ status: 'pending', checkReasons: ['health_note'] });
    // Fixing the profile clears the check.
    const fixed: Pet = (await http().post(`/api/pets/${noted.id}`).set(auth(token)).send(cat).expect(200)).body;
    expect(fixed).toMatchObject({ status: 'approved', checkReasons: [] });
  });

  it('only the owner can see or change a pet', async () => {
    const owner = await login();
    const other = await login();
    const mimi: Pet = (await http().post('/api/pets').set(auth(owner)).send(cat).expect(201)).body;
    await http().get(`/api/pets/${mimi.id}`).set(auth(other)).expect(404);
    await http().post(`/api/pets/${mimi.id}`).set(auth(other)).send(cat).expect(404);
    await http().post(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(other)).attach('photo', JPEG, 'card.jpg').expect(404);
    expect((await http().get('/api/pets').set(auth(other)).expect(200)).body).toEqual([]);
  });

  it('E3-2/E3-3: admin check queue, decisions with reasons, history and a message to the owner', async () => {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const token = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body.token;
    const admin = await adminLogin(app);
    const add = async (body: object): Promise<Pet> => (await http().post('/api/pets').set(auth(token)).send(body).expect(201)).body;
    const decide = (id: number, status: string, note?: string) => http().post(`/api/admin/pets/${id}/decision`).set(admin.header).send({ status, note });
    const queue = async (): Promise<PetCheckRow[]> => (await http().get('/api/admin/pets').set(admin.header).expect(200)).body;

    const mimi = await add(cat);
    const oldie = await add({ ...cat, name: 'Oldie', birth: monthsAgo(13 * 12) });
    const rex = await add({ ...dog, name: 'Rex', vaccinated: false });
    expect(mimi).toMatchObject({ status: 'approved', adminNote: null });
    const mine = (await queue()).filter((r) => [mimi.id, oldie.id, rex.id].includes(r.id));
    expect(mine.map((r) => [r.name, r.status, r.checkReasons])).toEqual([
      ['Oldie', 'pending', ['senior']],
      ['Rex', 'pending', ['no_vaccine']],
    ]);
    expect(mine[0].ownerPhone).toMatch(/^\+60 11-/);

    // Needs info: a reason is required; the owner sees it and gets a message.
    expect((await decide(oldie.id, 'needs_info', '').expect(400)).body.code).toBe('PET_REASON_NEEDED');
    const asked: Pet = (await decide(oldie.id, 'needs_info', 'Upload a vet check from this year').expect(200)).body;
    expect(asked).toMatchObject({ status: 'needs_info', adminNote: 'Upload a vet check from this year' });
    expect((await http().get(`/api/pets/${oldie.id}`).set(auth(token)).expect(200)).body.adminNote).toBe('Upload a vet check from this year');
    const inbox: MessageList = (await http().get('/api/messages').set(auth(token)).expect(200)).body;
    expect(inbox.items[0]).toMatchObject({ title: 'More info needed for Oldie', link: { type: 'pet', id: oldie.id } });
    const opened = (await http().post(`/api/messages/${inbox.items[0].id}/open`).set(auth(token)).expect(200)).body;
    expect(opened.latest).toMatchObject({ summary: 'Oldie: Needs info' });

    // Owner updates: back to pending and back in the queue.
    const updated: Pet = (await http().post(`/api/pets/${oldie.id}`).set(auth(token)).send({ ...cat, name: 'Oldie', birth: monthsAgo(13 * 12), healthNote: 'Vet check done in March' }).expect(200)).body;
    expect(updated).toMatchObject({ status: 'pending', adminNote: null });

    // Approve without a note; the history shows every change with who and why.
    const approved: Pet = (await decide(oldie.id, 'approved').expect(200)).body;
    expect(approved).toMatchObject({ status: 'approved', adminNote: null });
    const detail = (await http().get(`/api/admin/pets/${oldie.id}`).set(admin.header).expect(200)).body;
    expect(detail.history.map((h: { toStatus: string; actorType: string }) => `${h.actorType}:${h.toStatus}`)).toEqual(['owner:pending', 'admin:needs_info', 'owner:pending', 'admin:approved']);
    expect(detail.history[3]).toMatchObject({ actorId: admin.username, reason: 'Approved after check' });
    expect((await queue()).some((r) => r.id === oldie.id)).toBe(false);

    // Approved senior pet: renaming keeps it approved; a new health note sends it back.
    expect((await http().post(`/api/pets/${oldie.id}`).set(auth(token)).send({ ...cat, name: 'Oldie Boy', birth: monthsAgo(13 * 12), healthNote: 'Vet check done in March' }).expect(200)).body.status).toBe('approved');
    expect((await http().post(`/api/pets/${oldie.id}`).set(auth(token)).send({ ...cat, name: 'Oldie Boy', birth: monthsAgo(13 * 12), healthNote: 'Now limps a little' }).expect(200)).body.status).toBe('pending');

    // Not accepted stays, even after the owner edits; a decided pet cannot be decided again.
    const rejected: Pet = (await decide(rex.id, 'rejected', 'Not suitable for home visits').expect(200)).body;
    expect(rejected).toMatchObject({ status: 'rejected', adminNote: 'Not suitable for home visits' });
    expect((await http().post(`/api/pets/${rex.id}`).set(auth(token)).send({ ...dog, name: 'Rex' }).expect(200)).body).toMatchObject({ status: 'rejected', adminNote: 'Not suitable for home visits' });
    expect((await decide(rex.id, 'approved').expect(409)).body.code).toBe('PET_NOT_IN_CHECK');
    expect((await decide(mimi.id, 'rejected', 'Some reason here').expect(409)).body.code).toBe('PET_NOT_IN_CHECK');
  });

  it('E3-3: only admins with the Pet check page can use it; they can see the vaccine card', async () => {
    const token = await login();
    const mimi: Pet = (await http().post('/api/pets').set(auth(token)).send({ ...cat, vaccinated: false }).expect(201)).body;
    await http().post(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(token)).attach('photo', JPEG, 'card.jpg').expect(200);
    await http().get('/api/admin/pets').expect(401);
    await http().get('/api/admin/pets').set(auth(token)).expect(401);
    const rulesOnly = await adminLogin(app, ['rules']);
    expect((await http().get('/api/admin/pets').set(rulesOnly.header).expect(403)).body.code).toBe('PAGE_FORBIDDEN');
    const admin = await adminLogin(app, ['pets']);
    const photo = await http().get(`/api/admin/pets/${mimi.id}/vaccine-photo`).set(admin.header).buffer(true).expect(200);
    expect(Buffer.compare(photo.body as Buffer, JPEG)).toBe(0);
  });

  it('vaccine card photo: images only, owner can view it', async () => {
    const token = await login();
    const mimi: Pet = (await http().post('/api/pets').set(auth(token)).send(cat).expect(201)).body;
    await http().get(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(token)).expect(404);
    const fake = await http().post(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(token)).attach('photo', Buffer.from('<svg/>'), 'card.jpg').expect(400);
    expect(fake.body.code).toBe('PHOTO_TYPE');
    const missing = await http().post(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(token)).expect(400);
    expect(missing.body.code).toBe('PHOTO_MISSING');
    const big = await http().post(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(token)).attach('photo', Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]), 'big.jpg');
    expect(big.status).toBe(413);

    const saved: Pet = (await http().post(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(token)).attach('photo', JPEG, 'card.jpg').expect(200)).body;
    expect(saved.hasVaccinePhoto).toBe(true);
    const photo = await http().get(`/api/pets/${mimi.id}/vaccine-photo`).set(auth(token)).buffer(true).expect(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect(photo.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.compare(photo.body as Buffer, JPEG)).toBe(0);
  });
});
