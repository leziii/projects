import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MONITOR_RULES,
  TEST_ALERT_ITEM,
  alertOccurrence,
  dueMoneyAlerts,
  moneyAlertText,
  type MoneyAlertItem,
  type SentAlert,
  type TestAlertResult,
} from '@pawpal/shared';
import { MoneyService } from '../bookings/money.service';
import { DbService } from '../db/db.service';
import { WHATSAPP_SENDER, type WhatsappSender } from '../sms/sms';
import { supportInfo } from '../support/support';

/** KL time "YYYY-MM-DD HH:MM:SS.mmm" → minutes before now. */
const minutesSince = (kl: string, now: Date) => Math.max(0, Math.floor((now.getTime() - new Date(`${kl.replace(' ', 'T')}+08:00`).getTime()) / 60_000));

/**
 * E15-3 (R61-3): a WhatsApp alert to the support number when a payment, refund or payout fails,
 * or is still processing after 30 minutes. Each failure once; the same item at most once an hour.
 */
@Injectable()
export class MoneyAlertsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('MoneyAlerts');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly db: DbService,
    private readonly money: MoneyService,
    private readonly config: ConfigService,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: WhatsappSender,
  ) {}

  onModuleInit() {
    // Tests run it themselves; MONITOR_WORKER=off also stops it.
    if (this.config.get('NODE_ENV') === 'test' || this.config.get('MONITOR_WORKER') === 'off') return;
    this.timer = setInterval(() => void this.runDue().catch((e: Error) => this.log.error(e.message)), MONITOR_RULES.workerEverySeconds * 1000);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private supportPhone(): string | null {
    return supportInfo(this.config.get('SUPPORT_WHATSAPP'), this.config.get('NODE_ENV')).whatsapp;
  }

  /** Refunds and payouts from the Money queue, and owner payments that failed in the last day. */
  async open(now = new Date()): Promise<MoneyAlertItem[]> {
    const items: MoneyAlertItem[] = (await this.money.list(now))
      .filter((i) => i.state !== 'done')
      .map((i) => ({
        key: i.id,
        kind: i.kind,
        state: i.state === 'failed' ? 'failed' : 'processing',
        number: i.number,
        what: i.what,
        amountSen: i.amountSen,
        reason: i.lastFailure,
        tries: i.tries,
        minutes: minutesSince(i.updatedAt, now),
      }));
    // A pending payment is an owner still on the pay page, so only failures count.
    const { rows } = await this.db.pool.query<{ ref: string; amount_sen: number; failure_reason: string | null; number: string | null; minutes: number }>(
      `SELECT p.ref, p.amount_sen, p.failure_reason, o.number, floor(extract(epoch FROM ($1::timestamptz - p.updated_at)) / 60)::int AS minutes
       FROM payments p LEFT JOIN orders o ON o.charge_id = p.id
       WHERE p.kind = 'charge' AND p.status = 'failed' AND p.updated_at > $1::timestamptz - interval '1 day'`,
      [now],
    );
    for (const r of rows) {
      items.push({ key: r.ref, kind: 'payment', state: 'failed', number: r.number ?? r.ref, what: 'Owner payment', amountSen: r.amount_sen, reason: r.failure_reason, tries: 1, minutes: r.minutes });
    }
    return items;
  }

  /** Sends what is due. Each failure is claimed by one insert, so two servers never send it twice. */
  async runDue(now = new Date()): Promise<string[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const items = await this.open(now);
      const { rows } = await this.db.pool.query<{ key: string; occurrence: string; ms: string }>(
        'SELECT key, occurrence, (extract(epoch FROM sent_at) * 1000)::bigint AS ms FROM money_alerts WHERE key = ANY ($1)',
        [items.map((i) => i.key)],
      );
      const sent: SentAlert[] = rows.map((r) => ({ key: r.key, occurrence: r.occurrence, at: new Date(Number(r.ms)) }));
      const to = this.supportPhone();
      const done: string[] = [];
      for (const item of dueMoneyAlerts(items, sent, now)) {
        const text = moneyAlertText(item);
        const claimed = await this.db.pool.query<{ id: string }>(
          'INSERT INTO money_alerts (key, occurrence, text, sent_to, sent_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (key, occurrence) DO NOTHING RETURNING id',
          [item.key, alertOccurrence(item), text.slice(0, 500), to, now],
        );
        if (!claimed.rows[0]) continue;
        const error = await this.send(to, text);
        if (error) await this.db.pool.query('UPDATE money_alerts SET error = $1 WHERE id = $2', [error.slice(0, 255), claimed.rows[0].id]);
        done.push(item.key);
      }
      return done;
    } finally {
      this.running = false;
    }
  }

  /** R61-5: "Send a test money alert". */
  async test(): Promise<TestAlertResult> {
    const to = this.supportPhone();
    const text = moneyAlertText(TEST_ALERT_ITEM);
    const error = await this.send(to, text);
    if (error) throw new Error(`The test alert was not sent: ${error}`);
    return { sentTo: to, text };
  }

  private async send(to: string | null, text: string): Promise<string | null> {
    if (!to) {
      this.log.warn(`No SUPPORT_WHATSAPP set, alert not sent: ${text}`);
      return 'No support number set';
    }
    try {
      await this.whatsapp.send(to, text);
      return null;
    } catch (e) {
      this.log.error(`Alert to support failed: ${(e as Error).message}`);
      return (e as Error).message;
    }
  }
}
