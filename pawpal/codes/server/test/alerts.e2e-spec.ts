import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { AlertLogRow, AlertSent, User } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AlertsService } from '../src/alerts/alerts.service';
import { TEST_PUSH_HOST } from '../src/alerts/push';
import { AppModule } from '../src/app.module';
import { DbService } from '../src/db/db.service';
import { MockSmsSender, MockWhatsappSender, SMS_SENDER, WHATSAPP_SENDER } from '../src/sms/sms';

// E2-5: an urgent request reaches the caregiver by push and WhatsApp/SMS at once, with a reminder 10 min before the deadline.
describe('E2-5 alerts', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const endpoint = () => `${TEST_PUSH_HOST}${randomInt(1e9)}`;

  async function caregiver(approved = true): Promise<{ token: string; user: User; phone: string }> {
    const phone = `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const res = await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200);
    if (approved) await http().post('/api/dev/caregiver-status').send({ phone, status: 'approved', reason: 'IC checked' }).expect(201);
    return { ...res.body, phone };
  }
  const subscribe = (token: string, ep: string) => http().post('/api/alerts/push').set(auth(token)).send({ endpoint: ep, keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) } });
  const requestAlert = (phone: string, extra: Record<string, unknown> = {}) =>
    http().post('/api/dev/request-alert').send({ phone, minutesLeft: 24, visits: 3, area: 'Mont Kiara', firstVisit: '10/28 09:00', ...extra });
  const log = async (phone: string): Promise<AlertLogRow[]> => (await http().get(`/api/dev/alerts?phone=${encodeURIComponent(phone)}`).expect(200)).body;
  const inbox = async (ep: string) => (await http().get(`/api/dev/push-inbox?endpoint=${encodeURIComponent(ep)}`).expect(200)).body;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('settings: push key, devices, WhatsApp/SMS on by default', async () => {
    const { token } = await caregiver();
    const s = (await http().get('/api/alerts/settings').set(auth(token)).expect(200)).body;
    expect(s).toEqual({ vapidPublicKey: expect.stringMatching(/^[A-Za-z0-9_-]{80,}$/), pushDevices: 0, textAlerts: true });
    const ep = endpoint();
    expect((await subscribe(token, ep).expect(200)).body.pushDevices).toBe(1);
    expect((await subscribe(token, ep).expect(200)).body.pushDevices).toBe(1); // same browser again
    expect((await http().post('/api/alerts/text').set(auth(token)).send({ enabled: false }).expect(200)).body.textAlerts).toBe(false);
    expect((await http().post('/api/alerts/push/remove').set(auth(token)).send({ endpoint: ep }).expect(200)).body.pushDevices).toBe(0);
    expect((await subscribe(token, 'http://not-secure.example/x').expect(400)).body.code).toBe('BAD_SUBSCRIPTION');
    await http().get('/api/alerts/settings').expect(401);
  });

  it('an urgent request goes out on push and WhatsApp at once, without an address', async () => {
    const { token, phone } = await caregiver();
    const ep1 = endpoint();
    const ep2 = endpoint();
    await subscribe(token, ep1).expect(200);
    await subscribe(token, ep2).expect(200);

    const started = Date.now();
    const sent: AlertSent = (await requestAlert(phone).expect(200)).body;
    expect(Date.now() - started).toBeLessThan(60_000);
    expect(sent.results.map((r) => `${r.channel}:${r.status}`)).toEqual(['push:sent', 'push:sent', 'whatsapp:sent']);

    const push = { title: 'Urgent booking request · 24 min left', body: 'First visit 10/28 09:00, 3 visits, Mont Kiara. Open PawPal to accept.', url: `/pages/messages/view?id=${sent.messageId}` };
    expect(await inbox(ep1)).toEqual([push]);
    expect(await inbox(ep2)).toEqual([push]);
    expect((app.get(WHATSAPP_SENDER) as MockWhatsappSender).lastMessage(phone)).toBe(
      'PawPal: Urgent booking request · 24 min left. First visit 10/28 09:00, 3 visits, Mont Kiara. Open PawPal to accept.',
    );

    // Also in the message centre, for the caregiver role.
    const m = (await http().get('/api/messages').set(auth(token)).expect(200)).body.items[0];
    expect(m).toMatchObject({ id: sent.messageId, role: 'caregiver', category: 'order', title: push.title });
    expect((await log(phone)).map((r) => `${r.channel}:${r.status}`)).toEqual(['whatsapp:sent', 'push:sent', 'push:sent']);
  });

  it('an address is refused before anything is sent', async () => {
    const { phone } = await caregiver();
    expect((await requestAlert(phone, { area: '12 Jalan Ampang' }).expect(400)).body.code).toBe('ADDRESS_IN_MESSAGE');
    expect(await log(phone)).toEqual([]);
  });

  it('SMS when WhatsApp fails; nothing by text when the caregiver turned it off', async () => {
    const { token, phone } = await caregiver();
    await http().post('/api/dev/whatsapp-unreachable').send({ phone }).expect(200);
    const sent: AlertSent = (await requestAlert(phone).expect(200)).body;
    expect(sent.results).toEqual([
      { channel: 'push', status: 'skipped', detail: 'No device has push alerts on' },
      { channel: 'whatsapp', status: 'failed', detail: 'This number is not on WhatsApp' },
      { channel: 'sms', status: 'sent', detail: 'Sent by mock SMS (WhatsApp failed)' },
    ]);
    expect((app.get(SMS_SENDER) as MockSmsSender).lastMessage(phone)).toMatch(/^PawPal: Urgent booking request/);
    await http().post('/api/dev/whatsapp-unreachable').send({ phone, unreachable: false }).expect(200);

    await http().post('/api/alerts/text').set(auth(token)).send({ enabled: false }).expect(200);
    expect((await requestAlert(phone).expect(200)).body.results).toEqual([
      { channel: 'push', status: 'skipped', detail: 'No device has push alerts on' },
      { channel: 'whatsapp', status: 'skipped', detail: 'WhatsApp/SMS alerts are off' },
    ]);
  });

  it('reminds 10 minutes before the deadline, once', async () => {
    const { token, phone } = await caregiver();
    const ep = endpoint();
    await subscribe(token, ep).expect(200);
    const sent: AlertSent = (await requestAlert(phone, { minutesLeft: 30 }).expect(200)).body;
    const due = new Date(sent.reminderAt as string).getTime();
    expect(Math.round((due - Date.now()) / 60_000)).toBe(20);

    const alerts = app.get(AlertsService);
    await alerts.runDue();
    expect(await inbox(ep)).toHaveLength(1); // not yet

    // 20 minutes later
    await app.get(DbService).pool.query("UPDATE scheduled_alerts SET run_at = now() - interval '1 second' WHERE user_id = (SELECT id FROM users WHERE phone = $1)", [phone]);
    await Promise.all([alerts.runDue(), alerts.runDue()]);
    await alerts.runDue();
    const got = await inbox(ep);
    expect(got).toHaveLength(2);
    expect(got[1]).toMatchObject({ title: 'Request closes in 10 min', body: 'A booking request is still waiting for you. Open PawPal to accept.' });
    expect((await log(phone)).filter((r) => r.kind === 'deadline_reminder').map((r) => r.channel)).toEqual(['whatsapp', 'push']);
  });

  it('no reminder when the deadline is 10 minutes or less away', async () => {
    const { phone } = await caregiver();
    expect((await requestAlert(phone, { minutesLeft: 10 }).expect(200)).body.reminderAt).toBeNull();
  });

  it('only approved caregivers get requests; anyone can send a test alert', async () => {
    const owner = await caregiver(false);
    expect((await requestAlert(owner.phone).expect(400)).body.code).toBe('NOT_CAREGIVER');
    const test: AlertSent = (await http().post('/api/alerts/test').set(auth(owner.token)).expect(200)).body;
    expect(test.results.map((r) => `${r.channel}:${r.status}`)).toEqual(['push:skipped', 'whatsapp:sent']);
    expect((await http().get('/api/messages').set(auth(owner.token)).expect(200)).body.items[0]).toMatchObject({ title: 'Test alert', role: null, category: 'account' });
  });

  it('a push service that says "gone" removes that device', async () => {
    const { token, phone, user } = await caregiver();
    await subscribe(token, endpoint()).expect(200);
    const sender = await app.get(AlertsService).push();
    const spy = vi.spyOn(sender, 'send').mockResolvedValueOnce({ ok: false, gone: true, detail: 'Push service said 410' });
    try {
      expect((await requestAlert(phone).expect(200)).body.results[0]).toEqual({ channel: 'push', status: 'failed', detail: 'Push service said 410; device removed' });
    } finally {
      spy.mockRestore();
    }
    const { rows } = await app.get(DbService).pool.query('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [user.id]);
    expect(rows[0].n).toBe(0);
  });
});
