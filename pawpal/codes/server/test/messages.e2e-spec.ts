import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Message, MessageList, OpenedMessage, User } from '@pawpal/shared';
import { randomInt } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { adminLogin } from './admin-helper';

// E2-3: messages link to the latest state; the role is checked before opening; no address in the text.
describe('E2-3 message centre', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const newPhone = () => `+6011${String(randomInt(0, 1e8)).padStart(8, '0')}`;

  async function loginAs(): Promise<{ token: string; user: User; phone: string }> {
    const phone = newPhone();
    const { devCode } = (await http().post('/api/auth/code').send({ phone }).expect(200)).body;
    const res = await http().post('/api/auth/login').send({ phone, code: devCode, acceptTerms: true }).expect(200);
    return { ...res.body, phone };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const setStatus = (phone: string, status: string) => http().post('/api/dev/caregiver-status').send({ phone, status, reason: 'Hand checked' }).expect(201);
  const send = (body: Record<string, unknown>) => http().post('/api/dev/message').send({ category: 'order', title: 'Test', body: 'Hello', ...body });
  const list = async (token: string, q = ''): Promise<MessageList> => (await http().get(`/api/messages${q}`).set(auth(token)).expect(200)).body;
  const open = (token: string, id: number) => http().post(`/api/messages/${id}/open`).set(auth(token));

  beforeAll(async () => {
    const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = mod.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(() => app.close());

  it('needs a login', async () => {
    await http().get('/api/messages').expect(401);
    await http().post('/api/messages/1/open').expect(401);
  });

  it('a caregiver status change sends a message that opens the latest state', async () => {
    const { token, phone, user } = await loginAs();
    expect(await list(token)).toEqual({ items: [], unread: 0 });
    await setStatus(phone, 'approved');
    const { items, unread } = await list(token);
    expect(unread).toBe(1);
    expect(items[0]).toMatchObject({ role: null, category: 'account', title: 'You are a PawPal caregiver', link: { type: 'caregiver_application', id: user.id }, readAt: null });

    await setStatus(phone, 'suspended'); // the old message now opens the new state
    const opened: OpenedMessage = (await open(token, items[0].id).expect(200)).body;
    expect(opened.latest).toEqual({ type: 'caregiver_application', id: user.id, status: 'suspended', summary: 'Caregiver status: Suspended', gone: false });
    expect(opened.message.readAt).not.toBeNull();
    expect((await list(token)).unread).toBe(1); // only the suspension message is still unread
  });

  it('a payment link shows the payment as it is now', async () => {
    const { token, phone } = await loginAs();
    const charge = (await http().post('/api/payments/charges').set((await adminLogin(app)).header).send({ ref: `msg-${randomInt(1e9)}`, amountSen: 5600, method: 'tng' }).expect(201)).body;
    const m: Message = (await send({ phone, category: 'refund', title: 'Payment update', body: 'Your RM56 payment is being processed', linkType: 'payment', linkId: charge.id }).expect(201)).body;
    expect((await open(token, m.id).expect(200)).body.latest).toMatchObject({ status: 'pending', summary: 'Charge RM56.00 · Pending' });
    await http().post(`/api/mock-gateway/payments/${charge.id}/outcome`).send({ outcome: 'success' }).expect(200);
    expect((await open(token, m.id).expect(200)).body.latest).toMatchObject({ status: 'succeeded', summary: 'Charge RM56.00 · Succeeded' });

    const gone: Message = (await send({ phone, linkType: 'payment', linkId: 999999999 }).expect(201)).body;
    expect((await open(token, gone.id).expect(200)).body.latest).toMatchObject({ gone: true, summary: 'This item no longer exists' });
  });

  it('a message for the other role asks to switch first', async () => {
    const { token, phone } = await loginAs();
    const m: Message = (await send({ phone, role: 'caregiver', title: 'New booking request', body: 'Urgent · 24 min left' }).expect(201)).body;

    expect((await open(token, m.id).expect(403)).body).toEqual({ code: 'ROLE_NOT_ALLOWED', message: 'Apply to become a caregiver first' });
    await setStatus(phone, 'approved');
    expect((await open(token, m.id).expect(409)).body).toEqual({ code: 'ROLE_SWITCH_NEEDED', message: 'Switch to the caregiver role to open this message', role: 'caregiver' });
    expect((await list(token)).items.find((x) => x.id === m.id)?.readAt).toBeNull(); // not opened, so still unread

    await http().post('/api/auth/role').set(auth(token)).send({ role: 'caregiver' }).expect(200);
    await open(token, m.id).expect(200);
    const forOwner: Message = (await send({ phone, role: 'owner' }).expect(201)).body;
    expect((await open(token, forOwner.id).expect(409)).body.role).toBe('owner');
  });

  it('nobody can open or see someone else’s message', async () => {
    const a = await loginAs();
    const b = await loginAs();
    const m: Message = (await send({ phone: a.phone }).expect(201)).body;
    expect((await open(b.token, m.id).expect(404)).body.code).toBe('MESSAGE_NOT_FOUND');
    expect((await list(b.token)).items).toEqual([]);
  });

  it('never stores an address in a message', async () => {
    const { token, phone } = await loginAs();
    for (const body of ['Visit at 12 Jalan Ampang', 'Meet at Taman Desa', 'Postcode 50450', 'Unit #12-03']) {
      expect((await send({ phone, body }).expect(400)).body).toEqual({ code: 'ADDRESS_IN_MESSAGE', message: 'Messages must not contain an address' });
    }
    expect((await list(token)).items).toEqual([]);
  });

  it('filters by category, newest first, and reads all', async () => {
    const { token, phone } = await loginAs();
    await send({ phone, category: 'order', title: 'One' }).expect(201);
    await send({ phone, category: 'refund', title: 'Two' }).expect(201);
    await send({ phone, category: 'order', title: 'Three' }).expect(201);
    expect((await list(token)).items.map((m) => m.title)).toEqual(['Three', 'Two', 'One']);
    expect((await list(token, '?category=order')).items.map((m) => m.title)).toEqual(['Three', 'One']);
    expect((await http().get('/api/messages?category=spam').set(auth(token)).expect(400)).body.code).toBe('BAD_CATEGORY');
    expect((await http().post('/api/messages/read-all').set(auth(token)).expect(200)).body).toEqual({ read: 3 });
    expect((await list(token)).unread).toBe(0);
  });

  it('checks input', async () => {
    const { phone } = await loginAs();
    expect((await send({ phone, title: '' }).expect(400)).body.code).toBe('MESSAGE_EMPTY');
    expect((await send({ phone, category: 'spam' }).expect(400)).body.code).toBe('BAD_CATEGORY');
    expect((await send({ phone, role: 'admin' }).expect(400)).body.code).toBe('BAD_ROLE');
    expect((await send({ phone, linkType: 'visit', linkId: 1 }).expect(400)).body.code).toBe('BAD_LINK');
    expect((await send({ phone: newPhone() }).expect(404)).body.code).toBe('USER_NOT_FOUND');
  });
});
