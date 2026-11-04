import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { addDays, klDate, weekdayOf, type Schedule } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

// E4-5: caregivers set "Not available" blocks, travel buffer and overtime limit; booked visits are locked.
describe('E4-5 caregiver schedule', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const today = klDate(new Date());
  const day = (n: number) => addDays(today, n);

  async function caregiver(approved = true) {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const { token } = (await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200)).body;
    if (approved) await http().post('/api/dev/caregiver-status').send({ phone, status: 'approved', reason: 'test setup' }).expect(201);
    return { phone, token };
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('only approved caregivers', async () => {
    await http().get('/api/caregiver/schedule').expect(401);
    const owner = await caregiver(false);
    expect((await http().get('/api/caregiver/schedule').set(auth(owner.token)).expect(403)).body.code).toBe('NOT_APPROVED');
    expect((await http().post('/api/dev/test-visit').send({ phone: owner.phone, date: day(1), start: 600, minutes: 45 }).expect(403)).body.code).toBe('NOT_APPROVED');
  });

  it('defaults, settings and blocks', async () => {
    const c = await caregiver();
    const s: Schedule = (await http().get('/api/caregiver/schedule').set(auth(c.token)).expect(200)).body;
    expect(s).toMatchObject({ today, settings: { travelBufferMin: 30, overtimeMaxMin: 30 }, blocks: [], visits: [] });

    const set: Schedule = (await http().post('/api/caregiver/schedule/settings').set(auth(c.token)).send({ travelBufferMin: 45, overtimeMaxMin: 15 }).expect(200)).body;
    expect(set.settings).toEqual({ travelBufferMin: 45, overtimeMaxMin: 15 });
    expect((await http().post('/api/caregiver/schedule/settings').set(auth(c.token)).send({ travelBufferMin: 10, overtimeMaxMin: 15 }).expect(400)).body.code).toBe('BUFFER_CHOICE');

    const once: Schedule = (await http().post('/api/caregiver/schedule/blocks').set(auth(c.token)).send({ kind: 'once', date: day(2), start: 1080, end: 1260 }).expect(200)).body;
    const weekly: Schedule = (await http().post('/api/caregiver/schedule/blocks').set(auth(c.token)).send({ kind: 'weekly', weekday: 0, start: 420, end: 1320 }).expect(200)).body;
    expect(once.blocks).toHaveLength(1);
    expect(weekly.blocks.map((b) => [b.kind, b.date, b.weekday])).toEqual([
      ['once', day(2), null],
      ['weekly', null, 0],
    ]);
    expect((await http().post('/api/caregiver/schedule/blocks').set(auth(c.token)).send({ kind: 'once', date: day(-1), start: 600, end: 660 }).expect(400)).body.code).toBe('BLOCK_DATE');

    const other = await caregiver();
    await http().post(`/api/caregiver/schedule/blocks/${weekly.blocks[0].id}/delete`).set(auth(other.token)).expect(404);
    const removed: Schedule = (await http().post(`/api/caregiver/schedule/blocks/${weekly.blocks[0].id}/delete`).set(auth(c.token)).expect(200)).body;
    expect(removed.blocks).toHaveLength(1);
  });

  it('booked visits are locked: no block over the visit or its buffer; the buffer cannot grow into a block', async () => {
    const c = await caregiver();
    const date = day(3);
    await http().post('/api/dev/test-visit').send({ phone: c.phone, date, start: 600, minutes: 45 }).expect(201);
    const s: Schedule = (await http().get('/api/caregiver/schedule').set(auth(c.token)).expect(200)).body;
    expect(s.visits).toEqual([{ id: expect.any(Number), date, start: 600, minutes: 45, label: 'Test visit' }]);

    const over = await http().post('/api/caregiver/schedule/blocks').set(auth(c.token)).send({ kind: 'once', date, start: 660, end: 720 }).expect(400);
    expect(over.body.code).toBe('BLOCK_OVER_VISIT');
    const weekly = await http().post('/api/caregiver/schedule/blocks').set(auth(c.token)).send({ kind: 'weekly', weekday: weekdayOf(date), start: 420, end: 1320 }).expect(400);
    expect(weekly.body.code).toBe('BLOCK_OVER_VISIT');

    // Right after the 30-minute buffer is fine; a 60-minute buffer would then run into it.
    await http().post('/api/caregiver/schedule/blocks').set(auth(c.token)).send({ kind: 'once', date, start: 690, end: 750 }).expect(200);
    expect((await http().post('/api/caregiver/schedule/settings').set(auth(c.token)).send({ travelBufferMin: 60, overtimeMaxMin: 30 }).expect(400)).body.code).toBe('BUFFER_OVER_BLOCK');
  });
});
