import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  REQUEST_RULES,
  firstVisitOf,
  NOT_STARTED,
  arriveFromText,
  canArrive,
  entryFromOf,
  entryOpen,
  petsText,
  taskDates,
  taskTime,
  visitIncome,
  type EntryMethod,
  type OrderEnd,
  type OrderStatus,
  type OrderVisit,
  type PetKind,
  type RequestCard,
  type RequestDetail,
  type RequestEnd,
  type RequestHistoryRow,
  type RequestList,
  type ServiceLevel,
  type Task,
  type TaskList,
  type VisitRun,
  type VisitTask,
  type User,
} from '@pawpal/shared';
import { AddressesService } from '../addresses/addresses.service';
import { DbService, ts } from '../db/db.service';
import { SecretBox } from '../files/secret-box';
import { HistoryService } from '../history/history.service';
import { MessagesService } from '../messages/messages.service';
import { VisitRunsService, runKey } from './visit-runs.service';

interface Row {
  id: number;
  number: string;
  status: OrderStatus;
  end_reason: OrderEnd | null;
  address_id: number;
  accept_kind: 'urgent' | 'normal' | null;
  pets: { id: number; name: string; kind: PetKind }[];
  visits: OrderVisit[];
  area: string;
  deadline: string;
  ended: string | null;
  is_open: boolean;
}

export interface CaregiverHome {
  newRequests: number;
  todayVisits: number;
}

export interface PausedInfo {
  paused: boolean;
  reason: string | null;
}

/** A paid order that has (or had) an accept deadline is a request to its caregiver. */
const SELECT = `SELECT o.id, o.number, o.status, o.end_reason, o.address_id, o.accept_kind, o.pets, o.visits, a.area,
  ${ts('o.accept_deadline')} AS deadline, ${ts("CASE WHEN o.status = 'pending_accept' THEN o.accept_deadline ELSE o.updated_at END")} AS ended,
  (o.status = 'pending_accept' AND o.accept_deadline > now()) AS is_open
  FROM orders o JOIN addresses a ON a.id = o.address_id
  WHERE o.caregiver_id = $1 AND o.accept_deadline IS NOT NULL`;

/** Booking requests for the chosen caregiver (E6-1, R25-1 … R25-8). Area only, never the street or entry details. */
@Injectable()
export class RequestsService {
  constructor(
    private readonly db: DbService,
    private readonly addresses: AddressesService,
    private readonly secrets: SecretBox,
    private readonly history: HistoryService,
    private readonly runs: VisitRunsService,
    private readonly messages: MessagesService,
  ) {}

  async list(user: User): Promise<RequestList> {
    const { rows } = await this.db.pool.query<Row>(
      `${SELECT} AND (o.status = 'pending_accept' OR o.updated_at > now() - make_interval(days => $2)) ORDER BY o.accept_deadline`,
      [user.id, REQUEST_RULES.historyDays],
    );
    const open = rows.filter((r) => r.is_open).map(card);
    // R25-5: History keeps 30 days, newest first.
    const cutoff = Date.now() - REQUEST_RULES.historyDays * 86_400_000;
    const history = rows
      .filter((r) => !r.is_open)
      .map(past)
      .filter((h) => Date.parse(`${h.at.replace(' ', 'T')}+08:00`) > cutoff)
      .sort((a, b) => b.at.localeCompare(a.at));
    return { open, history };
  }

  async detail(user: User, orderId: number): Promise<RequestDetail> {
    const { rows } = await this.db.pool.query<Row>(`${SELECT} AND o.id = $2`, [user.id, orderId]);
    // Someone else's request looks the same as a missing one.
    if (!rows[0]) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'Request not found' });
    const r = rows[0];
    return {
      ...card(r),
      open: r.is_open,
      end: r.is_open ? null : endOf(r),
      visitLines: [...r.visits].sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start).map((v) => ({ label: v.label, minutes: v.quote.totalMinutes, incomeSen: visitIncome(v) })),
      petList: r.pets.map(({ name, kind }) => ({ name, kind })),
      address: r.status === 'accepted' ? await this.addresses.forVisit(r.address_id) : null,
    };
  }

  async home(user: User): Promise<CaregiverHome> {
    const { rows } = await this.db.pool.query<{ n: number }>(
      "SELECT COUNT(*)::int AS n FROM orders WHERE caregiver_id = $1 AND status = 'pending_accept' AND accept_deadline > now()",
      [user.id],
    );
    const today = (await this.tasks(user, null)).days[0].count;
    return { newRequests: rows[0].n, todayVisits: today };
  }

  /** E8-1 S08 (R33-2 … R33-5): visits of accepted orders on one day, with counts for the 14-day row. */
  async tasks(user: User, date: unknown, now = new Date()): Promise<TaskList> {
    const dates = taskDates(now);
    const day = typeof date === 'string' && dates.includes(date) ? date : dates[0];
    const { rows } = await this.db.pool.query<{ id: number; number: string; pets: Task['pets']; visits: OrderVisit[]; area: string }>(
      `SELECT o.id, o.number, o.pets, o.visits, a.area FROM orders o JOIN addresses a ON a.id = o.address_id
       WHERE o.caregiver_id = $1 AND o.status = 'accepted' AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.visits) v WHERE v->>'date' BETWEEN $2 AND $3)`,
      [user.id, dates[0], dates[dates.length - 1]],
    );
    const runs = await this.runs.forOrders(rows.map((o) => Number(o.id)));
    const all: Task[] = rows.flatMap((o) => o.visits.map((v, index) => taskOf(o, v, index, runs.get(runKey(Number(o.id), index)) ?? NOT_STARTED)));
    const buffer = await this.db.pool.query<{ travel_buffer_min: number }>('SELECT travel_buffer_min FROM caregiver_profiles WHERE user_id = $1', [user.id]);
    return {
      days: dates.map((d) => ({ date: d, count: all.filter((t) => t.date === d && t.status !== 'cancelled').length })),
      date: day,
      tasks: all.filter((t) => t.date === day).sort((a, b) => a.start - b.start),
      bufferMin: buffer.rows[0]?.travel_buffer_min ?? 30,
    };
  }

  /**
   * E8-2 S09 (R34-2 … R34-6): one visit of an accepted order, for its caregiver only. Entry instructions are opened only
   * inside the window (2 h before until the end), never on a cancelled visit, and every opening is logged.
   */
  async visit(user: User, orderId: number, index: number, now = new Date()): Promise<VisitTask> {
    const { rows } = await this.db.pool.query<{
      id: number; number: string; status: OrderStatus; level: ServiceLevel; pets: { id: number; name: string; kind: PetKind }[]; visits: OrderVisit[];
      address_id: number; area: string; entry_method: EntryMethod; entry_secret: string | null;
    }>(
      `SELECT o.id, o.number, o.status, o.level, o.pets, o.visits, o.address_id, a.area, o.entry_method, o.entry_secret
       FROM orders o JOIN addresses a ON a.id = o.address_id WHERE o.id = $1 AND o.caregiver_id = $2 AND o.status = 'accepted'`,
      [orderId, user.id],
    );
    const o = rows[0];
    const v = o?.visits[index];
    if (!o || !v) throw new NotFoundException({ code: 'VISIT_NOT_FOUND', message: 'Visit not found' });
    const task = taskOf(o, v, index, await this.runs.of(Number(o.id), index));
    const pets = await this.db.pool.query<{ id: string; name: string; kind: PetKind; breed: string | null; birth_year: number; birth_month: number; weight_kg: string | null; health_note: string }>(
      'SELECT id, name, kind, breed, birth_year, birth_month, weight_kg, health_note FROM pets WHERE id = ANY ($1) ORDER BY id',
      [o.pets.map((p) => p.id)],
    );
    let entry: VisitTask['entry'] = null;
    if (entryOpen(task, now) && o.entry_secret) {
      entry = JSON.parse(await this.secrets.open(o.entry_secret)) as NonNullable<VisitTask['entry']>;
      // R34-4: who opened them, and when.
      await this.db.tx((client) => this.history.record(client, {
        entity: 'order',
        entityId: task.orderId,
        from: 'accepted',
        to: 'accepted',
        actor: { type: 'caregiver', id: String(user.id) },
        reason: `Entry instructions viewed for the visit on ${v.date} at ${taskTime(task)}`,
      }));
    }
    return {
      ...task,
      level: o.level,
      serviceKind: v.quote.serviceKind,
      minMinutes: v.quote.minMinutes,
      incomeSen: visitIncome(v),
      petDetails: pets.rows.map((p) => ({ name: p.name, kind: p.kind, breed: p.breed, birth: { year: p.birth_year, month: p.birth_month }, weightKg: p.weight_kg === null ? null : Number(p.weight_kg), healthNote: p.health_note })),
      address: await this.addresses.forVisit(o.address_id).then((a) => (a ? { ...a, area: o.area } : null)),
      entryMethod: o.entry_method,
      entry,
      entryFrom: entryFromOf(task),
    };
  }

  /**
   * E8-3 "I've arrived" (R35-2, R35-4): from 30 min before the start; records the time, never starts the service clock.
   * With Live confirm the owner is asked to let the caregiver in.
   */
  async arrive(user: User, orderId: number, index: number, now = new Date()): Promise<VisitTask> {
    const v = await this.visit(user, orderId, index, now);
    if (!canArrive(v, now)) {
      throw new ConflictException({ code: 'CANNOT_ARRIVE', message: v.status === 'todo' ? `You can tap this ${arriveFromText(v).toLowerCase()}` : 'Arrival is already recorded' });
    }
    await this.db.tx(async (client) => {
      const { rowCount } = await client.query("INSERT INTO visit_runs (order_id, idx, status, arrived_at) VALUES ($1, $2, 'arrived', now()) ON CONFLICT DO NOTHING", [orderId, index]);
      if (!rowCount) throw new ConflictException({ code: 'CANNOT_ARRIVE', message: 'Arrival is already recorded' });
      await this.history.record(client, { entity: 'visit', entityId: orderId, from: 'todo', to: 'arrived', actor: { type: 'caregiver', id: String(user.id) }, reason: `Arrived for visit ${index + 1} (${v.date} ${taskTime(v)})` });
      if (v.entryMethod === 'live_confirm') {
        const { rows } = await client.query<{ owner_id: number; display_name: string }>(
          'SELECT o.owner_id, c.display_name FROM orders o JOIN caregiver_profiles c ON c.user_id = o.caregiver_id WHERE o.id = $1',
          [orderId],
        );
        const name = shortName(rows[0].display_name);
        // R35-4: the owner lets the caregiver in from O14.
        await this.messages.send(client, {
          userId: rows[0].owner_id,
          role: 'owner',
          category: 'order',
          title: `${name} has arrived`,
          body: `${name} has arrived for the visit at ${taskTime(v)}. Confirm to let them in.`,
          link: { type: 'order', id: orderId },
        });
      }
    });
    return this.visit(user, orderId, index, now);
  }

  /** E8-3 Pre-authorised (R35-3): after arriving, the caregiver confirms entry; the service starts now. */
  async enter(user: User, orderId: number, index: number, now = new Date()): Promise<VisitTask> {
    const v = await this.visit(user, orderId, index, now);
    if (v.entryMethod !== 'pre_authorised') throw new ConflictException({ code: 'OWNER_CONFIRMS', message: 'The owner confirms entry for this visit' });
    await this.db.tx(async (client) => {
      const { rowCount } = await client.query(
        "UPDATE visit_runs SET status = 'in_service', entered_at = now(), entered_by = 'caregiver', updated_at = now() WHERE order_id = $1 AND idx = $2 AND status = 'arrived'",
        [orderId, index],
      );
      if (!rowCount) throw new ConflictException({ code: 'NOT_ARRIVED', message: v.status === 'todo' ? 'Tap "I\'ve arrived" first' : 'Entry is already confirmed' });
      await this.history.record(client, { entity: 'visit', entityId: orderId, from: 'arrived', to: 'in_service', actor: { type: 'caregiver', id: String(user.id) }, reason: `Entry confirmed for visit ${index + 1}` });
    });
    return this.visit(user, orderId, index, now);
  }

  /** Dev tool (R35-7): a visit of an order starts in 10 minutes. */
  async visitSoon(input: unknown, index: unknown): Promise<{ number: string; date: string; start: number }> {
    const number = typeof input === 'string' ? input.trim().toUpperCase() : '';
    const i = Number.isInteger(index) ? (index as number) : 0;
    const kl = new Date(Date.now() + 8 * 3600_000 + 10 * 60_000);
    const date = kl.toISOString().slice(0, 10);
    const start = kl.getUTCHours() * 60 + kl.getUTCMinutes();
    const { rowCount } = await this.db.pool.query(
      `UPDATE orders SET visits = jsonb_set(jsonb_set(visits, ARRAY[$2::text, 'date'], to_jsonb($3::text)), ARRAY[$2::text, 'start'], to_jsonb($4::int))
       WHERE number = $1 AND jsonb_array_length(visits) > $5`,
      [number, String(i), date, start, i],
    );
    if (!rowCount) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'No order with this number and visit' });
    await this.db.pool.query('UPDATE booked_visits SET visit_date = $2, start_min = $3 WHERE order_id = (SELECT id FROM orders WHERE number = $1) AND id = (SELECT id FROM booked_visits WHERE order_id = (SELECT id FROM orders WHERE number = $1) ORDER BY id OFFSET $4 LIMIT 1)', [number, date, start, i]);
    return { number, date, start };
  }

  /** Dev tool: the deadline of an open request passes now. */
  async expireNow(input: unknown): Promise<{ number: string }> {
    const number = typeof input === 'string' ? input.trim().toUpperCase() : '';
    const { rowCount } = await this.db.pool.query(
      "UPDATE orders SET accept_deadline = now() WHERE number = $1 AND status = 'pending_accept' AND accept_deadline > now()",
      [number],
    );
    if (!rowCount) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND', message: 'No open request with this order number' });
    return { number };
  }

  /** R25-8: a paused caregiver sees why, and nothing else. */
  async paused(user: User): Promise<PausedInfo> {
    if (user.caregiverStatus !== 'suspended') return { paused: false, reason: null };
    const { rows } = await this.db.pool.query<{ reason: string }>(
      "SELECT reason FROM status_history WHERE entity = 'caregiver' AND entity_id = $1 AND to_status = 'suspended' ORDER BY id DESC LIMIT 1",
      [user.id],
    );
    return { paused: true, reason: rows[0]?.reason ?? null };
  }
}

const card = (r: Row): RequestCard => {
  const first = firstVisitOf(r.visits);
  return {
    orderId: r.id,
    number: r.number,
    urgent: r.accept_kind === 'urgent',
    deadline: r.deadline,
    firstVisit: { date: first.date, start: first.start },
    visits: r.visits.length,
    area: r.area,
    pets: petsText(r.pets),
    incomeSen: r.visits.reduce((s, v) => s + visitIncome(v), 0),
  };
};

/** Why it is no longer open: accepted or said no (E6-2), withdrawn (E6-4), otherwise the time ran out. */
function endOf(r: Row): RequestEnd {
  if (r.status === 'cancelled') return 'withdrawn';
  if (r.status === 'accepted') return 'accepted';
  if (r.end_reason === 'rejected') return 'rejected';
  return 'expired';
}

const past = (r: Row): RequestHistoryRow => {
  const c = card(r);
  return { orderId: r.id, number: r.number, end: endOf(r), at: r.ended ?? r.deadline, firstVisit: c.firstVisit, visits: c.visits, area: c.area };
};

/** One visit of an order as a task, with how far it has got (R33-3, R35-1). */
function taskOf(o: { id: number; number: string; area: string; pets: { name: string; kind: PetKind }[] }, v: OrderVisit, index: number, run: VisitRun): Task {
  return {
    orderId: Number(o.id),
    index,
    number: o.number,
    date: v.date,
    start: v.start,
    minutes: v.quote.totalMinutes,
    area: o.area,
    pets: o.pets.map(({ name, kind }) => ({ name, kind })),
    ...run,
  };
}

/** "Siti Aminah" → "Siti A." */
function shortName(full: string): string {
  const words = full.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? `${words[0]} ${words[words.length - 1].charAt(0).toUpperCase()}.` : (words[0] ?? 'Your caregiver');
}
