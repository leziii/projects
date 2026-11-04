import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DEFAULT_RULES } from '@pawpal/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';

describe('E1-2 rules API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('GET /api/rules returns the shared rule set', async () => {
    const res = await request(app.getHttpServer()).get('/api/rules').expect(200);
    expect(res.body).toEqual(DEFAULT_RULES);
  });

  it('POST /api/pricing/quote prices a mixed visit with overtime', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pricing/quote')
      .send({ pets: ['dog', 'cat'], level: 'upgrade', overtimeUnits: 1 })
      .expect(200);
    expect(res.body).toMatchObject({ serviceKind: 'mixed', total: 9000, minMinutes: 60, totalMinutes: 75 });
  });

  it('rejects too many dogs with a clear code', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/pricing/quote')
      .send({ pets: ['dog', 'dog', 'dog'], level: 'basic' })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'TOO_MANY_DOGS', message: 'At most 2 dogs per booking' });
  });

  it('rejects bad input', async () => {
    await request(app.getHttpServer()).post('/api/pricing/quote').send({ pets: ['fish'], level: 'basic' }).expect(400);
    await request(app.getHttpServer()).post('/api/pricing/quote').send({ pets: ['cat'], level: 'gold' }).expect(400);
    await request(app.getHttpServer()).post('/api/pricing/quote').send({}).expect(400);
  });
});
