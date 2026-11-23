import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MONEY_RULES,
  actorLabel,
  canCheckBank,
  canSendAgain,
  moneyState,
  nextTryRef,
  parseMoneyRef,
  refundReason,
  type ActorType,
  type AdminUser,
  type MoneyDetail,
  type MoneyItem,
  type MoneyKind,
  type MoneyTry,
  type PaymentStatus,
} from '@pawpal/shared';
import { DbService, ts } from '../db/db.service';
import { HistoryService } from '../history/history.service';
import { PaymentsService } from '../payments/payments.service';

interface TryRow {
  id: number;
  ref: string;
  kind: 'refund' | 'payout';
  amount_sen: number;
  status: PaymentStatus;
  failure_reason: string | null;
  parent_id: number | null;
  payee: string | null;
  updated: string;
  updated_ms: number;
}

/** One refund or payout of an order with every try at it, oldest first. */
interface Group {
  base: string;
  orderId: number;
  kind: MoneyKind;
  key: string;
  tries: TryRow[];
}

interface OrderRow {
  id: string;
  number: string;
  end_reason: string | null;
  caregiver: string | null;
}

const toTry = (t: TryRow): MoneyTry => ({ paymentId: t.id, ref: t.ref, status: t.status, failureReason: t.failure_reason, at: t.updated });

/** E13-4 A13 / A14 (round 56): every refund and order payout, and the two safe ways to move a stuck one on. */
@Injectable()
export class MoneyService {
  private readonly log = new Logger(MoneyService.name);

  constructor(
    private readonly db: DbService,
    private readonly payments: PaymentsService,
    private readonly history: HistoryService,
  ) {}

  /** R56-1: everything not done, and the latest done ones. */
  async list(now = new Date()): Promise<MoneyItem[]> {
    const groups = await this.groups();
    const items = await this.items(groups, now);
    const done = items.filter((i) => i.state === 'done').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, MONEY_RULES.doneShown);
    return [...items.filter((i) => i.state !== 'done'), ...done];
  }

  /** R56-2: one item with each try and who did what. */
  async detail(id: string, now = new Date()): Promise<MoneyDetail> {
    const g = await this.group(id);
    const [item] = await this.items([g], now);
    const ids = g.tries.map((t) => t.id);
    const { rows } = await this.db.pool.query<{ entity: string; entity_id: number; to_status: string; actor_type: ActorType; actor_id: string | null; reason: string; at: string }>(
      `SELECT entity, entity_id, to_status, actor_type, actor_id, reason, ${ts('created_at')} AS at FROM status_history
       WHERE (entity = 'payment' AND entity_id = ANY ($1)) OR (entity = 'money' AND entity_id = $2) ORDER BY created_at, id`,
      [ids, ids[0]],
    );
    const tryNo = new Map(g.tries.map((t, i) => [t.id, i + 1]));
    const log = rows.map((r) => ({
      at: r.at,
      who: actorLabel(r.actor_type, r.actor_id),
      what: r.entity === 'money' ? r.reason : `Try ${tryNo.get(r.entity_id)}: ${r.to_status} · ${r.reason}`,
    }));
    const payee = g.tries[0].payee;
    return { ...item, how: g.kind === 'payout' ? `Automatic payout to ${payee}` : 'Back to how the owner paid', tryList: g.tries.map(toTry), log };
  }

  /**
   * R56-3: a failed item is sent once more. The new try's reference comes from the number of tries so far,
   * so two presses at the same moment make the same payment and the bank pays once.
   */
  async sendAgain(admin: AdminUser, id: string): Promise<MoneyDetail> {
    const g = await this.group(id);
    if (!canSendAgain({ state: moneyState(g.tries) })) throw new ConflictException({ code: 'NOT_FAILED', message: 'Only a failed item can be sent again' });
    const last = g.tries[g.tries.length - 1];
    const ref = nextTryRef(g.base, g.tries.length);
    // Written first so the record reads in order: the admin's press, then the new try.
    await this.note(admin, g, `Sent again by admin (try ${g.tries.length + 1}, ${ref})`);
    const p =
      g.kind === 'payout'
        ? await this.payments.createPayout({ ref, amountSen: last.amount_sen, payee: last.payee })
        : await this.payments.createRefund({ ref, chargeId: last.parent_id, amountSen: last.amount_sen });
    // E13-1: the order's settlement follows its latest payout try (S15, S16).
    if (g.kind === 'payout') await this.db.pool.query('UPDATE settlements SET payout_id = $2 WHERE order_id = $1', [g.orderId, p.id]);
    this.log.log(`Admin ${admin.username} sent ${g.base} again as ${ref}`);
    return this.detail(id);
  }

  /** R56-4: asks the bank about a try that has been processing too long. Never marks anything paid itself. */
  async checkBank(admin: AdminUser, id: string, now = new Date()): Promise<MoneyDetail> {
    const g = await this.group(id);
    const [item] = await this.items([g], now);
    if (!canCheckBank(item)) {
      throw new ConflictException({ code: 'NOT_LATE', message: `Only an item processing for more than ${MONEY_RULES.checkAfterMinutes} minutes can be checked` });
    }
    const p = await this.payments.query(g.tries[g.tries.length - 1].id);
    await this.note(admin, g, `Checked with bank: ${p.status === 'pending' || p.status === 'checking' ? 'no answer yet' : p.status}`);
    return this.detail(id, now);
  }

  private async note(admin: AdminUser, g: Group, reason: string) {
    await this.db.tx((client) => this.history.record(client, { entity: 'money', entityId: g.tries[0].id, from: null, to: 'note', actor: { type: 'admin', id: admin.username }, reason }));
  }

  private async items(groups: Group[], now: Date): Promise<MoneyItem[]> {
    const orderIds = [...new Set(groups.map((g) => g.orderId))];
    const { rows: orders } = await this.db.pool.query<OrderRow>(
      `SELECT o.id, o.number, o.end_reason, cp.display_name AS caregiver FROM orders o LEFT JOIN caregiver_profiles cp ON cp.user_id = o.caregiver_id WHERE o.id = ANY ($1)`,
      [orderIds],
    );
    const byId = new Map(orders.map((o) => [Number(o.id), o]));
    const feeIds = groups.filter((g) => g.kind === 'fee_refund').map((g) => Number(g.key.slice(1)));
    const { rows: fees } = await this.db.pool.query<{ id: string; idx: number }>('SELECT id, idx FROM extra_fees WHERE id = ANY ($1)', [feeIds]);
    const feeIdx = new Map(fees.map((f) => [Number(f.id), f.idx]));
    return groups.map((g) => {
      const o = byId.get(g.orderId);
      const last = g.tries[g.tries.length - 1];
      const state = moneyState(g.tries);
      const visit = /^[vx](\d+)$/.exec(g.key);
      const index = visit ? Number(visit[1]) : g.kind === 'fee_refund' ? (feeIdx.get(Number(g.key.slice(1))) ?? null) : null;
      const what = g.kind === 'payout' ? `Payout to ${o?.caregiver ?? 'caregiver'}` : refundReason(g.key, o?.end_reason ?? null);
      const late = state === 'processing' && now.getTime() - last.updated_ms >= MONEY_RULES.checkAfterMinutes * 60_000;
      const failed = [...g.tries].reverse().find((t) => t.status === 'failed');
      return {
        id: g.base,
        kind: g.kind,
        orderId: g.orderId,
        number: o?.number ?? '',
        index,
        what,
        amountSen: last.amount_sen,
        state,
        tries: g.tries.length,
        lastFailure: state === 'done' ? null : (failed?.failure_reason ?? null),
        updatedAt: last.updated,
        late,
      };
    });
  }

  private async group(id: string): Promise<Group> {
    const ref = parseMoneyRef(id);
    const g = ref && ref.attempt === 0 && ref.base === id ? (await this.groups(ref.orderId)).find((x) => x.base === id) : undefined;
    if (!g) throw new NotFoundException({ code: 'MONEY_NOT_FOUND', message: 'No such refund or payout' });
    return g;
  }

  private async groups(orderId?: number): Promise<Group[]> {
    const { rows } = await this.db.pool.query<TryRow>(
      `SELECT id, ref, kind, amount_sen, status, failure_reason, parent_id, payee, ${ts('updated_at')} AS updated, (extract(epoch FROM updated_at) * 1000)::float8 AS updated_ms
       FROM payments WHERE kind IN ('refund', 'payout') AND ref LIKE $1 ORDER BY id`,
      [orderId === undefined ? 'order-%' : `order-${orderId}-%`],
    );
    const map = new Map<string, Group>();
    for (const t of rows) {
      const r = parseMoneyRef(t.ref);
      if (!r || (r.kind === 'payout') !== (t.kind === 'payout')) continue;
      const g = map.get(r.base) ?? { base: r.base, orderId: r.orderId, kind: r.kind, key: r.key, tries: [] };
      g.tries.push(t);
      map.set(r.base, g);
    }
    return [...map.values()];
  }
}
