import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALERT_RULES,
  RuleError,
  reminderAlertText,
  reminderAt,
  requestAlertText,
  textAlert,
  type AlertChannel,
  type AlertKind,
  type AlertLogRow,
  type AlertResult,
  type AlertSent,
  type AlertSettings,
  type RequestAlert,
  type User,
} from '@pawpal/shared';
import { DbService, ts } from '../db/db.service';
import { MessagesService } from '../messages/messages.service';
import { SMS_SENDER, WHATSAPP_SENDER, type SmsSender, type WhatsappSender } from '../sms/sms';
import { PushSender, newVapidKeys, type PushTarget } from './push';

interface AlertUser {
  id: number;
  phone: string;
  caregiver_status: string;
  text_alerts: boolean;
}

interface Due {
  id: number;
  user_id: number;
  kind: AlertKind;
  payload: string;
}

const short = (s: string) => s.slice(0, 255);

/**
 * Sends alerts on every channel (E2-5): web push to each device, and WhatsApp with SMS as fallback.
 * Each alert is also a message in the message centre, and every try is logged.
 */
const DUE_BATCH = 50;

@Injectable()
export class AlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Alerts');
  private pushSender?: Promise<PushSender>;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
    private readonly messages: MessagesService,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: WhatsappSender,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  onModuleInit() {
    // Tests run due reminders themselves; ALERT_WORKER=off also stops it.
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('ALERT_WORKER') === 'off') return;
    this.timer = setInterval(() => void this.runDue().catch((e: Error) => this.log.error(e.message)), ALERT_RULES.workerEverySeconds * 1000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** The push sender with this server's VAPID keys: from VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY, else made once and kept in the database. */
  push(): Promise<PushSender> {
    this.pushSender ??= (async () => {
      const production = this.config.get('NODE_ENV') === 'production';
      const proxy = this.config.get<string>('PUSH_PROXY') || this.config.get<string>('HTTPS_PROXY') || undefined;
      const fromEnv = { publicKey: this.config.get<string>('VAPID_PUBLIC_KEY', ''), privateKey: this.config.get<string>('VAPID_PRIVATE_KEY', '') };
      if (fromEnv.publicKey && fromEnv.privateKey) return new PushSender(fromEnv, production, proxy);
      if (production) throw new Error('Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in production');
      await this.db.pool.query("INSERT INTO app_settings (key, value) VALUES ('vapid', $1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(newVapidKeys())]);
      const { rows } = await this.db.pool.query<{ value: string }>("SELECT value FROM app_settings WHERE key = 'vapid'");
      return new PushSender(JSON.parse(rows[0].value) as { publicKey: string; privateKey: string }, production, proxy);
    })();
    return this.pushSender;
  }

  async settings(user: User): Promise<AlertSettings> {
    const [{ rows: devices }, { rows: u }] = await Promise.all([
      this.db.pool.query<{ n: number }>('SELECT COUNT(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [user.id]),
      this.db.pool.query<{ text_alerts: boolean }>('SELECT text_alerts FROM users WHERE id = $1', [user.id]),
    ]);
    return { vapidPublicKey: (await this.push()).publicKey, pushDevices: devices[0].n, textAlerts: u[0].text_alerts };
  }

  /** Saves this browser's push subscription for the user (moves it if another account had it). */
  async subscribe(user: User, input: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }): Promise<AlertSettings> {
    const endpoint = typeof input?.endpoint === 'string' ? input.endpoint : '';
    const p256dh = input?.keys?.p256dh;
    const auth = input?.keys?.auth;
    if (!/^https:\/\/\S{8,1000}$/.test(endpoint) || typeof p256dh !== 'string' || typeof auth !== 'string' || !p256dh || !auth) {
      throw new RuleError('BAD_SUBSCRIPTION', 'This browser sent an invalid push subscription');
    }
    await this.db.pool.query(
      `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [user.id, endpoint, p256dh, auth],
    );
    return this.settings(user);
  }

  async unsubscribe(user: User, endpoint: unknown): Promise<AlertSettings> {
    await this.db.pool.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [user.id, String(endpoint ?? '')]);
    return this.settings(user);
  }

  async setTextAlerts(user: User, enabled: unknown): Promise<AlertSettings> {
    if (typeof enabled !== 'boolean') throw new RuleError('BAD_SETTING', 'enabled must be true or false');
    await this.db.pool.query('UPDATE users SET text_alerts = $2 WHERE id = $1', [user.id, enabled]);
    return this.settings(user);
  }

  /** "Send me a test alert" from the app. */
  async test(user: User): Promise<AlertSent> {
    return this.alert(user.id, 'test', { title: 'Test alert', body: 'Alerts are working. New booking requests will reach you like this.' }, null);
  }

  /**
   * A new booking request for an approved caregiver: alert now on every channel, reminder 10 min before the deadline.
   * Real requests (E6-1) pass their order: the message opens it, and the reminder is skipped once it is no longer open.
   */
  async newRequest(userId: number, r: RequestAlert, now = new Date(), orderId: number | null = null): Promise<AlertSent> {
    const text = requestAlertText(r);
    const user = await this.user(userId);
    if (user.caregiver_status !== 'approved') throw new RuleError('NOT_CAREGIVER', 'Only approved caregivers get booking requests');
    const at = reminderAt(new Date(now.getTime() + r.minutesLeft * 60_000), now);
    const sent = await this.alert(userId, 'new_request', text, 'caregiver', orderId);
    if (at) {
      await this.db.pool.query('INSERT INTO scheduled_alerts (user_id, kind, run_at, payload) VALUES ($1, $2, $3, $4)', [
        userId,
        'deadline_reminder',
        at,
        JSON.stringify({ messageId: sent.messageId, orderId }),
      ]);
    }
    return { ...sent, reminderAt: at?.toISOString() ?? null };
  }

  /** Sends every reminder that is due. Each one is claimed once, so two servers never send it twice. */
  async runDue(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let total = 0;
    try {
      // Batches of 50 until nothing is due, so a backlog never holds up newer reminders.
      for (;;) {
        const { rows } = await this.db.pool.query<Due>(
          `UPDATE scheduled_alerts SET done_at = now() WHERE id IN (
             SELECT id FROM scheduled_alerts WHERE done_at IS NULL AND run_at <= now() ORDER BY run_at LIMIT ${DUE_BATCH} FOR UPDATE SKIP LOCKED
           ) RETURNING id, user_id, kind, payload`,
        );
        for (const due of rows) {
          const orderId = (JSON.parse(due.payload) as { orderId?: number | null }).orderId ?? null;
          if (orderId !== null && !(await this.stillOpen(orderId))) continue; // accepted, withdrawn or expired: nothing to remind
          await this.alert(due.user_id, due.kind, reminderAlertText(), 'caregiver', orderId);
        }
        total += rows.length;
        if (rows.length < DUE_BATCH) return total;
      }
    } finally {
      this.running = false;
    }
  }

  /** Newest first (admin test tools). */
  async logFor(phone: string, limit = 30): Promise<AlertLogRow[]> {
    const { rows } = await this.db.pool.query<AlertLogRow & { created: string }>(
      `SELECT l.id, u.phone, l.kind, l.channel, l.status, l.detail, l.text, ${ts('l.created_at')} AS created
       FROM alert_log l JOIN users u ON u.id = l.user_id WHERE u.phone = $1 ORDER BY l.id DESC LIMIT $2`,
      [phone, limit],
    );
    return rows.map(({ created, ...r }) => ({ ...r, createdAt: created }));
  }

  /** One alert: a message in C02, then push to each device and WhatsApp (SMS if WhatsApp fails). */
  private async alert(userId: number, kind: AlertKind, text: { title: string; body: string }, role: 'caregiver' | null, orderId: number | null = null): Promise<AlertSent> {
    const user = await this.user(userId);
    const link = orderId === null ? null : { type: 'request' as const, id: orderId };
    const message = await this.messages.send(null, { userId, role, category: kind === 'test' ? 'account' : 'order', ...text, link });
    const results: AlertResult[] = [];
    const record = async (channel: AlertChannel, status: AlertResult['status'], detail: string, sentText: string) => {
      results.push({ channel, status, detail });
      await this.db.pool.query('INSERT INTO alert_log (user_id, kind, channel, status, detail, text, message_id) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
        userId,
        kind,
        channel,
        status,
        short(detail),
        sentText.slice(0, 400),
        message.id,
      ]);
    };

    const { rows: targets } = await this.db.pool.query<PushTarget & { id: number }>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId]);
    const push = await this.push();
    const payload = { ...text, url: `/pages/messages/view?id=${message.id}` };
    const pushText = `${text.title} — ${text.body}`;
    if (!targets.length) await record('push', 'skipped', 'No device has push alerts on', pushText);
    for (const t of targets) {
      const out = await push.send(t, payload);
      if (out.ok) await record('push', 'sent', 'Delivered to the push service', pushText);
      else {
        if (out.gone) await this.db.pool.query('DELETE FROM push_subscriptions WHERE id = $1', [t.id]);
        await record('push', 'failed', out.gone ? `${out.detail}; device removed` : out.detail, pushText);
      }
    }

    const line = textAlert(text);
    if (!user.text_alerts) await record('whatsapp', 'skipped', 'WhatsApp/SMS alerts are off', line);
    else {
      try {
        await this.whatsapp.send(user.phone, line);
        await record('whatsapp', 'sent', `Sent by ${this.whatsapp.name} WhatsApp`, line);
      } catch (err) {
        await record('whatsapp', 'failed', (err as Error).message, line);
        try {
          await this.sms.send(user.phone, line);
          await record('sms', 'sent', `Sent by ${this.sms.name} SMS (WhatsApp failed)`, line);
        } catch (smsErr) {
          await record('sms', 'failed', (smsErr as Error).message, line);
        }
      }
    }
    return { messageId: message.id, results, reminderAt: null };
  }

  private async stillOpen(orderId: number): Promise<boolean> {
    const { rows } = await this.db.pool.query("SELECT 1 FROM orders WHERE id = $1 AND status = 'pending_accept' AND accept_deadline > now()", [orderId]);
    return rows.length > 0;
  }

  private async user(id: number): Promise<AlertUser> {
    const { rows } = await this.db.pool.query<AlertUser>('SELECT id, phone, caregiver_status, text_alerts FROM users WHERE id = $1', [id]);
    if (!rows[0]) throw new RuleError('USER_NOT_FOUND', 'No such account');
    return rows[0];
  }
}
