import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addDays, dayText, klDate, type BookingDraft, type CaregiverOption } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';

// E5-1: owners set up a booking (pets, level, visits, overtime, address) and see the price per visit; the draft is kept.
describe('E5-1 booking setup', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const tomorrow = addDays(klDate(new Date()), 1);
  const address = { label: 'Home', area: 'Bangsar', street: '12 Jalan Telawi', unit: 'A-3-1', postcode: '59100', contactName: 'Ali', contactPhone: '012-345 6789' };

  async function owner() {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    return token as string;
  }

  /** Adds a pet straight into the database with the given check status. */
  async function pet(ownerToken: string, kind: 'cat' | 'dog', status: string, name: string): Promise<number> {
    const { id: ownerId } = (await http().get('/api/auth/me').set(auth(ownerToken)).expect(200)).body;
    const { rows } = await app.get(DbService).pool.query(
      `INSERT INTO pets (owner_id, kind, name, birth_year, birth_month, breed, weight_kg, vaccinated, status) VALUES ($1, $2, $3, 2022, 1, $4, $5, true, $6) RETURNING id`,
      [ownerId, kind, name, kind === 'dog' ? 'Poodle' : null, kind === 'dog' ? 8 : null, status],
    );
    return Number(rows[0].id);
  }

  /** An approved caregiver set straight in the database: areas, pets, overtime limit, experience. */
  async function caregiver(p: { areas: string[]; cats?: boolean; maxDogSize?: string | null; overtimeMaxMin?: number; years?: number; name: string }) {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    await http().post('/api/dev/caregiver-status').send({ phone, status: 'approved', reason: 'test setup' }).expect(201);
    await http().get('/api/caregiver/profile').set(auth(token)).expect(200);
    const { id } = (await http().get('/api/auth/me').set(auth(token)).expect(200)).body;
    await app.get(DbService).pool.query(
      'UPDATE caregiver_profiles SET display_name = $2, areas = $3, cats = $4, dogs = $5, max_dog_size = $6, overtime_max_min = $7, experience_years = $8 WHERE user_id = $1',
      [id, p.name, p.areas, p.cats ?? true, !!p.maxDogSize, p.maxDogSize ?? null, p.overtimeMaxMin ?? 30, p.years ?? 1],
    );
    return { id: id as number, phone, token: token as string };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('needs a login; a new draft has the default address and lists what is missing', async () => {
    await http().get('/api/bookings/draft').expect(401);
    const token = await owner();
    const a = (await http().post('/api/addresses').set(auth(token)).send(address).expect(201)).body;
    const d: BookingDraft = (await http().get('/api/bookings/draft').set(auth(token)).expect(200)).body;
    expect(d).toMatchObject({ petIds: [], level: 'basic', overtimeUnits: 0, addressId: a.id, visits: [] });
    expect(d.summary.blocks).toEqual(['Choose at least one pet', 'Add at least one visit']);
  });

  it('prices each visit, keeps the draft, and drops pets that are not the owner’s', async () => {
    const token = await owner();
    const a = (await http().post('/api/addresses').set(auth(token)).send(address).expect(201)).body;
    const mimi = await pet(token, 'cat', 'approved', 'Mimi');
    const rex = await pet(token, 'dog', 'pending', 'Rex');
    const other = await pet(await owner(), 'cat', 'approved', 'Not mine');
    const body = { petIds: [mimi, rex, other], level: 'upgrade', overtimeUnits: 1, addressId: a.id, visits: [{ date: addDays(tomorrow, 1), start: 1080 }, { date: tomorrow, start: 540 }] };
    const d: BookingDraft = (await http().post('/api/bookings/draft').set(auth(token)).send(body).expect(200)).body;
    expect(d.petIds).toEqual([mimi, rex]);
    expect(d.visits.map((v) => v.date)).toEqual([tomorrow, addDays(tomorrow, 1)]);
    expect(d.summary.blocks).toEqual([]);
    expect(d.summary.waitsForCheck).toEqual(['Rex']);
    // Dog upgrade RM70 + cat RM10 + 15 min overtime RM10 = RM90, 75 min.
    expect(d.summary.lines.map((l) => [l.quote.total, l.quote.totalMinutes])).toEqual([
      [9000, 75],
      [9000, 75],
    ]);
    expect(d.summary.total).toBe(18000);

    const again: BookingDraft = (await http().get('/api/bookings/draft').set(auth(token)).expect(200)).body;
    expect(again).toEqual(d);

    // A pet rejected later drops out of the draft.
    await app.get(DbService).pool.query("UPDATE pets SET status = 'rejected' WHERE id = $1", [rex]);
    expect((await http().get('/api/bookings/draft').set(auth(token)).expect(200)).body.petIds).toEqual([mimi]);

    const cleared: BookingDraft = (await http().post('/api/bookings/draft/clear').set(auth(token)).expect(200)).body;
    expect(cleared).toMatchObject({ petIds: [], visits: [], addressId: a.id });
  });

  it('refuses a bad shape; shows the rule when the setup breaks one', async () => {
    const token = await owner();
    expect((await http().post('/api/bookings/draft').set(auth(token)).send({ overtimeUnits: 5 }).expect(400)).body.code).toBe('BOOKING_OVERTIME');
    expect((await http().post('/api/bookings/draft').set(auth(token)).send({ visits: [{ date: tomorrow, start: 1350 }] }).expect(400)).body.code).toBe('BOOKING_VISIT');
    const dogs = [await pet(token, 'dog', 'approved', 'A'), await pet(token, 'dog', 'approved', 'B'), await pet(token, 'dog', 'approved', 'C')];
    const d: BookingDraft = (await http().post('/api/bookings/draft').set(auth(token)).send({ petIds: dogs, visits: [{ date: tomorrow, start: 600 }] }).expect(200)).body;
    expect(d.summary.blocks).toEqual(['At most 2 dogs per booking', 'Choose an address']);
    expect(d.summary.lines).toEqual([]);

    // An address added later is filled in.
    const a = (await http().post('/api/addresses').set(auth(token)).send(address).expect(201)).body;
    expect((await http().get('/api/bookings/draft').set(auth(token)).expect(200)).body.addressId).toBe(a.id);
  });

  it('E5-2: lists caregivers who fit, free first; clashing ones cannot be chosen; a choice that stops fitting is cleared', async () => {
    const token = await owner();
    // Not ready yet: the list stays closed.
    expect((await http().get('/api/bookings/draft/caregivers').set(auth(token)).expect(409)).body.code).toBe('DRAFT_NOT_READY');

    const a = (await http().post('/api/addresses').set(auth(token)).send({ ...address, area: 'Kepong' }).expect(201)).body;
    const mimi = await pet(token, 'cat', 'approved', 'Mimi');
    const rex = await pet(token, 'dog', 'approved', 'Rex'); // 8 kg
    const day = addDays(tomorrow, 2);
    await http().post('/api/bookings/draft').set(auth(token)).send({ petIds: [mimi, rex], overtimeUnits: 1, addressId: a.id, visits: [{ date: day, start: 600 }] }).expect(200);

    const free = await caregiver({ name: 'Free Five', areas: ['Kepong'], maxDogSize: 'small', years: 5 });
    const busy = await caregiver({ name: 'Busy Nine', areas: ['Kepong'], maxDogSize: 'medium', years: 9 });
    const junior = await caregiver({ name: 'Free One', areas: ['Kepong'], maxDogSize: 'large', years: 1 });
    const noDogs = await caregiver({ name: 'No Dogs', areas: ['Kepong'], maxDogSize: null });
    const noCats = await caregiver({ name: 'No Cats', areas: ['Kepong'], cats: false, maxDogSize: 'small' });
    const elsewhere = await caregiver({ name: 'Else Where', areas: ['KLCC'], maxDogSize: 'small' });
    const shortOt = await caregiver({ name: 'Short Overtime', areas: ['Kepong'], maxDogSize: 'small', overtimeMaxMin: 0 });
    const suspended = await caregiver({ name: 'Sus Pended', areas: ['Kepong'], maxDogSize: 'small' });
    await http().post('/api/dev/caregiver-status').send({ phone: suspended.phone, status: 'suspended', reason: 'test setup' }).expect(201);
    await http().post('/api/dev/test-visit').send({ phone: busy.phone, date: day, start: 660, minutes: 60 }).expect(201);

    const list: { options: CaregiverOption[]; note: string } = (await http().get('/api/bookings/draft/caregivers').set(auth(token)).expect(200)).body;
    const ids = list.options.map((o) => o.card.id);
    for (const hidden of [noDogs, noCats, elsewhere, shortOt, suspended]) expect(ids).not.toContain(hidden.id);
    const mine = list.options.filter((o) => [free.id, busy.id, junior.id].includes(o.card.id));
    expect(mine.map((o) => [o.card.displayName, o.free, o.availability])).toEqual([
      ['Free F.', true, 'Your visit looks free'],
      ['Free O.', true, 'Your visit looks free'],
      ['Busy N.', false, `May clash: ${dayText(day)} 10:00 am`],
    ]);
    expect(list.note).toBe('Free is not reserved. The caregiver confirms when accepting.');

    expect((await http().post('/api/bookings/draft/caregiver').set(auth(token)).send({ caregiverId: busy.id }).expect(409)).body.code).toBe('CAREGIVER_NOT_AVAILABLE');
    expect((await http().post('/api/bookings/draft/caregiver').set(auth(token)).send({ caregiverId: noDogs.id }).expect(409)).body.code).toBe('CAREGIVER_NOT_AVAILABLE');
    const chosen: BookingDraft = (await http().post('/api/bookings/draft/caregiver').set(auth(token)).send({ caregiverId: free.id }).expect(200)).body;
    expect(chosen.caregiver).toEqual({ id: free.id, displayName: 'Free F.' });
    expect((await http().get('/api/bookings/draft').set(auth(token)).expect(200)).body.caregiver).toEqual({ id: free.id, displayName: 'Free F.' });

    // Overtime still within her 30 min: kept. Over it: cleared with a note.
    const kept: BookingDraft = (await http().post('/api/bookings/draft').set(auth(token)).send({ ...chosen, overtimeUnits: 2 }).expect(200)).body;
    expect(kept.caregiver?.id).toBe(free.id);
    const cleared: BookingDraft = (await http().post('/api/bookings/draft').set(auth(token)).send({ ...chosen, overtimeUnits: 3 }).expect(200)).body;
    expect(cleared.caregiver).toBeNull();
    expect(cleared.caregiverNote).toBe('Free F. no longer fits this booking, so the choice was cleared. Choose again.');
  });

  it('E5-3: entry method and instructions are saved encrypted and kept when the setup changes', async () => {
    const token = await owner();
    const entry = { method: 'pre_authorised', keyLock: 'Door code 4821#', guard: 'Guard knows', notes: 'Cat hides under the bed' };
    expect((await http().post('/api/bookings/draft/entry').set(auth(token)).send(entry).expect(409)).body.code).toBe('DRAFT_NOT_READY');
    const first: BookingDraft = (await http().post('/api/bookings/draft').set(auth(token)).send({ visits: [{ date: tomorrow, start: 600 }] }).expect(200)).body;
    expect(first.entry).toBeNull();
    expect((await http().post('/api/bookings/draft/entry').set(auth(token)).send({ ...entry, keyLock: '' }).expect(400)).body.code).toBe('ENTRY_KEY_NEEDED');
    expect((await http().post('/api/bookings/draft/entry').set(auth(token)).send({ ...entry, notes: 'x'.repeat(301) }).expect(400)).body.code).toBe('ENTRY_TOO_LONG');

    const saved: BookingDraft = (await http().post('/api/bookings/draft/entry').set(auth(token)).send(entry).expect(200)).body;
    expect(saved.entry).toEqual(entry);
    const { id } = (await http().get('/api/auth/me').set(auth(token)).expect(200)).body;
    const { rows } = await app.get(DbService).pool.query('SELECT entry_method, entry_secret FROM booking_drafts WHERE owner_id = $1', [id]);
    expect(rows[0].entry_method).toBe('pre_authorised');
    expect(rows[0].entry_secret).toMatch(/^v1\./);
    expect(rows[0].entry_secret).not.toContain('4821');

    // Changing the setup keeps the entry; live confirm needs no instructions.
    const changed: BookingDraft = (await http().post('/api/bookings/draft').set(auth(token)).send({ visits: [{ date: tomorrow, start: 660 }] }).expect(200)).body;
    expect(changed.entry).toEqual(entry);
    const live: BookingDraft = (await http().post('/api/bookings/draft/entry').set(auth(token)).send({ method: 'live_confirm' }).expect(200)).body;
    expect(live.entry).toEqual({ method: 'live_confirm', keyLock: '', guard: '', notes: '' });
  });
});
