import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Address } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';

// E3-4: owners save addresses and contacts; private parts are stored encrypted.
describe('E3-4 addresses and contacts', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const home = { label: 'Home', area: 'Mont Kiara', street: 'Jalan Kiara 3', unit: 'A-12-3', postcode: '50480', contactName: 'Tan Mei Ling', contactPhone: '012-345 6789' };

  async function login(): Promise<string> {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    return (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body.token;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('needs a login', async () => {
    await http().get('/api/addresses').expect(401);
  });

  it('adds, edits and chooses the default; the first address is the default', async () => {
    const token = await login();
    const first: Address = (await http().post('/api/addresses').set(auth(token)).send(home).expect(201)).body;
    expect(first).toMatchObject({ label: 'Home', area: 'Mont Kiara', contactPhone: '+60123456789', emergencyName: null, isDefault: true });
    const office: Address = (
      await http()
        .post('/api/addresses')
        .set(auth(token))
        .send({ ...home, label: 'Office', area: 'Bangsar', street: 'Jalan Telawi 2', unit: 'Level 5', postcode: '59100', emergencyName: 'Lim', emergencyPhone: '011-2345 6789' })
        .expect(201)
    ).body;
    expect(office).toMatchObject({ isDefault: false, emergencyPhone: '+601123456789' });

    const edited: Address = (await http().post(`/api/addresses/${office.id}`).set(auth(token)).send({ ...home, label: 'Office', area: 'Petaling Jaya', postcode: '46000' }).expect(200)).body;
    expect(edited).toMatchObject({ area: 'Petaling Jaya', postcode: '46000', emergencyName: null });

    const list: Address[] = (await http().post(`/api/addresses/${office.id}/default`).set(auth(token)).expect(200)).body;
    expect(list.map((a) => [a.label, a.isDefault])).toEqual([
      ['Office', true],
      ['Home', false],
    ]);

    // Deleting the default makes the next one the default.
    const after: Address[] = (await http().post(`/api/addresses/${office.id}/delete`).set(auth(token)).expect(200)).body;
    expect(after.map((a) => [a.label, a.isDefault])).toEqual([['Home', true]]);
  });

  it('refuses missing fields and more than 5 addresses', async () => {
    const token = await login();
    expect((await http().post('/api/addresses').set(auth(token)).send({ ...home, contactPhone: '' }).expect(400)).body.code).toBe('ADDRESS_PHONE');
    expect((await http().post('/api/addresses').set(auth(token)).send({ ...home, area: 'Penang' }).expect(400)).body.code).toBe('ADDRESS_AREA');
    for (let i = 0; i < 5; i += 1) await http().post('/api/addresses').set(auth(token)).send({ ...home, label: `Place ${i}` }).expect(201);
    expect((await http().post('/api/addresses').set(auth(token)).send(home).expect(409)).body.code).toBe('ADDRESS_LIMIT');
  });

  it('only the owner sees an address; the database holds no readable street or phone', async () => {
    const owner = await login();
    const other = await login();
    const a: Address = (await http().post('/api/addresses').set(auth(owner)).send({ ...home, street: 'Jalan Rahsia 9' }).expect(201)).body;
    await http().get(`/api/addresses/${a.id}`).set(auth(other)).expect(404);
    await http().post(`/api/addresses/${a.id}`).set(auth(other)).send(home).expect(404);
    await http().post(`/api/addresses/${a.id}/delete`).set(auth(other)).expect(404);
    expect((await http().get('/api/addresses').set(auth(other)).expect(200)).body).toEqual([]);

    const { rows } = await app.get(DbService).pool.query<Record<string, unknown>>('SELECT * FROM addresses WHERE id = $1', [a.id]);
    const stored = JSON.stringify(rows[0]);
    expect(stored).not.toContain('Rahsia');
    expect(stored).not.toContain('60123456789');
    expect(stored).not.toContain('A-12-3');
    expect(rows[0].area).toBe('Mont Kiara');
  });
});
