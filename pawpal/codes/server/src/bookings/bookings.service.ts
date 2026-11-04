import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  EMPTY_DRAFT,
  FREE_NOT_RESERVED,
  availabilityText,
  bookingNeeds,
  canRebook,
  checkBookingDraft,
  checkEntry,
  clashingVisits,
  creditToUse,
  fitsBooking,
  payProblems,
  rebookNote,
  sortOptions,
  summarizeDraft,
  visitTime,
  type AppliedPromo,
  type Area,
  type BookingDraft,
  type BookingVisit,
  type CaregiverCard,
  type CaregiverOption,
  type DraftContext,
  type DraftInput,
  type EntryInfo,
  type EntryMethod,
  type OrderEnd,
  type OrderStatus,
  type PetKind,
  type PayProblem,
  type PetStatus,
  type ServiceLevel,
  type User,
} from '@pawpal/shared';
import { ScheduleService } from '../caregivers/schedule.service';
import { TrustService } from '../caregivers/trust.service';
import { DbService } from '../db/db.service';
import { SecretBox } from '../files/secret-box';
import { HistoryService } from '../history/history.service';
import { PromosService } from '../promos/promos.service';
import { ReferralsService } from '../referrals/referrals.service';

interface DraftRow {
  pet_ids: string[];
  level: DraftInput['level'];
  overtime_units: number;
  address_id: string | null;
  visits: DraftInput['visits'];
  caregiver_id: number | null;
  caregiver_note: string | null;
  entry_method: EntryMethod | null;
  entry_secret: string | null;
  promo_code: string | null;
}

export interface Checkout {
  draft: BookingDraft;
  problems: PayProblem[];
  /** The promo code and what it takes off, while it can be used (R23-3). */
  promo: AppliedPromo | null;
  /** Credit used automatically after the promo (R24-5). */
  creditSen: number;
  /** What the owner pays in money. */
  payTotal: number;
}

/** What "Book again" copies from an old order (R29-2). */
interface OrderCopy {
  number: string;
  status: OrderStatus;
  end_reason: OrderEnd | null;
  pets: { id: number }[];
  level: ServiceLevel;
  overtime_units: number;
  address_id: number;
  visits: BookingVisit[];
  entry_method: EntryMethod | null;
  entry_secret: string | null;
}

type Context = DraftContext & { ownerId: number; defaultAddressId: number | null; areas: Map<number, Area> };

export interface CaregiverList {
  options: CaregiverOption[];
  note: string;
}

/** The owner's booking setup (E5-1, O06) and the caregiver choice (E5-2, O07/O08): one server draft per owner. */
@Injectable()
export class BookingsService {
  constructor(
    private readonly db: DbService,
    private readonly trust: TrustService,
    private readonly schedules: ScheduleService,
    private readonly secrets: SecretBox,
    private readonly history: HistoryService,
    private readonly promos: PromosService,
    private readonly referrals: ReferralsService,
  ) {}

  /** The saved draft, or a new one; with no address chosen yet, the default address is filled in. */
  async draft(user: User): Promise<BookingDraft> {
    const ctx = await this.context(user.id);
    const row = await this.row(user.id);
    const d: DraftInput = row
      ? { petIds: row.pet_ids.map(Number), level: row.level, overtimeUnits: row.overtime_units, addressId: row.address_id === null ? ctx.defaultAddressId : Number(row.address_id), visits: row.visits }
      : { ...EMPTY_DRAFT, addressId: ctx.defaultAddressId };
    return { ...(await this.view(d, ctx, row?.caregiver_id ?? null, row?.caregiver_note ?? null, row ? await this.entry(row) : null)), promoCode: row?.promo_code ?? null };
  }

  /**
   * Replaces the setup. Pets and addresses that are not the owner's are dropped.
   * A chosen caregiver who no longer fits is cleared with a note (R19-4).
   */
  async save(user: User, body: Record<string, unknown>): Promise<BookingDraft> {
    const input = checkBookingDraft(body ?? {});
    await this.cancelUnpaid(user.id);
    const ctx = await this.context(user.id);
    const d = this.clean(input, ctx);
    const old = await this.row(user.id);
    let caregiverId = old?.caregiver_id ?? null;
    let note = old?.caregiver_note ?? null;
    if (caregiverId !== null && !(await this.stillFits(d, ctx, caregiverId))) {
      const card = await this.trust.card(caregiverId).catch(() => null);
      note = `${card?.displayName || 'The caregiver you chose'} no longer fits this booking, so the choice was cleared. Choose again.`;
      caregiverId = null;
    }
    await this.db.pool.query(
      `INSERT INTO booking_drafts (owner_id, pet_ids, level, overtime_units, address_id, visits, caregiver_id, caregiver_note, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT (owner_id) DO UPDATE SET pet_ids = $2, level = $3, overtime_units = $4, address_id = $5, visits = $6, caregiver_id = $7, caregiver_note = $8, updated_at = now()`,
      [user.id, d.petIds, d.level, d.overtimeUnits, d.addressId, JSON.stringify(d.visits), caregiverId, note],
    );
    return { ...(await this.view(d, ctx, caregiverId, note, old ? await this.entry(old) : null)), promoCode: old?.promo_code ?? null };
  }

  /** O09: how the caregiver gets in (R20-1 … R20-4). The instructions are sealed before they are stored. */
  async saveEntry(user: User, body: Record<string, unknown>): Promise<BookingDraft> {
    const e = checkEntry(body ?? {});
    if (!(await this.row(user.id))) throw new ConflictException({ code: 'DRAFT_NOT_READY', message: 'Set up your booking first' });
    await this.cancelUnpaid(user.id);
    const sealed = await this.secrets.seal(JSON.stringify({ keyLock: e.keyLock, guard: e.guard, notes: e.notes }));
    await this.db.pool.query('UPDATE booking_drafts SET entry_method = $2, entry_secret = $3, updated_at = now() WHERE owner_id = $1', [user.id, e.method, sealed]);
    return this.draft(user);
  }

  /**
   * E6-5 Book again (R29-1 … R29-6): a failed or withdrawn order becomes the owner's draft. Pets, level, extra time,
   * address, visits and entry are copied; not the caregiver or the promo. Past visits are left out. A draft in progress
   * is replaced only when the owner said so. The old order and its refund stay as they are.
   */
  async rebook(user: User, orderId: number, replace: boolean, now = new Date()): Promise<BookingDraft> {
    const { rows } = await this.db.pool.query<OrderCopy>(
      'SELECT number, status, end_reason, pets, level, overtime_units, address_id, visits, entry_method, entry_secret FROM orders WHERE id = $1 AND owner_id = $2',
      [orderId, user.id],
    );
    const o = rows[0];
    if (!o) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    if (!canRebook({ status: o.status, endReason: o.end_reason })) throw new ConflictException({ code: 'NOT_REBOOKABLE', message: 'This order cannot be booked again' });
    if (!replace && (await this.row(user.id))) throw new ConflictException({ code: 'DRAFT_EXISTS', message: 'Replace your current booking?' });
    await this.cancelUnpaid(user.id);
    const visits = o.visits.map(({ date, start }) => ({ date, start })).filter((v) => visitTime(v) > now);
    const note = rebookNote(o.number, o.visits.length - visits.length, visits.length);
    await this.db.pool.query(
      `INSERT INTO booking_drafts (owner_id, pet_ids, level, overtime_units, address_id, visits, caregiver_id, caregiver_note, entry_method, entry_secret, promo_code, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, NULL, now())
       ON CONFLICT (owner_id) DO UPDATE SET pet_ids = $2, level = $3, overtime_units = $4, address_id = $5, visits = $6, caregiver_id = NULL, caregiver_note = $7,
         entry_method = $8, entry_secret = $9, promo_code = NULL, updated_at = now()`,
      [user.id, o.pets.map((p) => p.id), o.level, o.overtime_units, o.address_id, JSON.stringify(visits), note, o.entry_method, o.entry_secret],
    );
    return this.draft(user);
  }

  async clear(user: User): Promise<BookingDraft> {
    await this.cancelUnpaid(user.id);
    await this.db.pool.query('DELETE FROM booking_drafts WHERE owner_id = $1', [user.id]);
    return this.draft(user);
  }

  /** O07: caregivers who fit, with how the visits look for each (R19-1 … R19-3). Hidden until the setup is ready (R19-6). */
  async caregivers(user: User): Promise<CaregiverList> {
    const { d, ctx } = await this.ready(user);
    return { options: sortOptions(await this.options(d, ctx)), note: FREE_NOT_RESERVED };
  }

  /** O08 "Choose": only a caregiver who fits and looks free for every visit (R19-2). */
  async choose(user: User, caregiverId: unknown): Promise<BookingDraft> {
    const { d, ctx } = await this.ready(user);
    if (!Number.isInteger(caregiverId) || !(await this.stillFits(d, ctx, caregiverId as number))) {
      throw new ConflictException({ code: 'CAREGIVER_NOT_AVAILABLE', message: 'This caregiver cannot take this booking. Choose another one' });
    }
    await this.cancelUnpaid(user.id);
    await this.db.pool.query('UPDATE booking_drafts SET caregiver_id = $2, caregiver_note = NULL, updated_at = now() WHERE owner_id = $1', [user.id, caregiverId]);
    return this.draft(user);
  }

  /** O10: the draft and everything that still stops payment (R21-3), including a caregiver who is no longer free and a promo code that stopped working. */
  async checkout(user: User): Promise<Checkout> {
    const draft = await this.draft(user);
    const problems = payProblems(draft);
    if (draft.caregiver && !draft.summary.blocks.length && !(await this.stillFits(draft, await this.context(user.id), draft.caregiver.id))) {
      problems.push({ text: `${draft.caregiver.displayName} is no longer free for these visits. Choose again`, fix: 'caregiver' });
    }
    let promo: AppliedPromo | null = null;
    if (draft.promoCode) {
      const t = await this.promos.try(user.id, draft.promoCode, draft.summary.total);
      if (t.problem) problems.push({ text: `${draft.promoCode}: ${t.problem}`, fix: 'promo' });
      else promo = { code: draft.promoCode, discountSen: t.discountSen, payTotal: draft.summary.total - t.discountSen };
    }
    const due = promo?.payTotal ?? draft.summary.total;
    const creditSen = due > 0 ? creditToUse(await this.referrals.available(user.id), due) : 0;
    return { draft, problems, promo, creditSen, payTotal: due - creditSen };
  }

  /** O10 "Apply" (R23-3): only a code that works now is kept. One code per order. */
  async applyPromo(user: User, code: unknown): Promise<Checkout> {
    if (!(await this.row(user.id))) throw new ConflictException({ code: 'DRAFT_NOT_READY', message: 'Set up your booking first' });
    const draft = await this.draft(user);
    const t = await this.promos.try(user.id, code, draft.summary.total);
    if (t.problem) throw new ConflictException({ code: 'PROMO_INVALID', message: t.problem });
    await this.cancelUnpaid(user.id);
    await this.db.pool.query('UPDATE booking_drafts SET promo_code = $2, updated_at = now() WHERE owner_id = $1', [user.id, t.promo!.code]);
    return this.checkout(user);
  }

  async removePromo(user: User): Promise<Checkout> {
    await this.cancelUnpaid(user.id);
    await this.db.pool.query('UPDATE booking_drafts SET promo_code = NULL, updated_at = now() WHERE owner_id = $1', [user.id]);
    return this.checkout(user);
  }

  /** Editing the booking cancels an order that was not paid (R21-4). */
  private async cancelUnpaid(ownerId: number): Promise<void> {
    await this.db.tx(async (client) => {
      const { rows } = await client.query<{ id: number }>(
        "UPDATE orders SET status = 'cancelled', updated_at = now() WHERE owner_id = $1 AND status = 'awaiting_payment' RETURNING id",
        [ownerId],
      );
      for (const { id } of rows) {
        await this.history.record(client, { entity: 'order', entityId: id, from: 'awaiting_payment', to: 'cancelled', actor: { type: 'owner', id: String(ownerId) }, reason: 'Booking changed before payment' });
      }
      await this.promos.giveBack(client, rows.map((r) => r.id)); // R23-4
      await this.referrals.giveBack(client, rows.map((r) => r.id)); // R24-5
    });
  }

  /** The saved setup, only when it has no problems left. */
  private async ready(user: User): Promise<{ d: DraftInput; ctx: Context }> {
    const ctx = await this.context(user.id);
    const draft = await this.draft(user);
    if (!(await this.row(user.id)) || draft.summary.blocks.length) {
      throw new ConflictException({ code: 'DRAFT_NOT_READY', message: draft.summary.blocks[0] ?? 'Set up your booking first' });
    }
    return { d: draft, ctx };
  }

  /** Caregivers who fit the booking (all, or one), with how the visits look for each. */
  private async options(d: DraftInput, ctx: Context, only?: number): Promise<CaregiverOption[]> {
    const needs = bookingNeeds(d, ctx, ctx.areas.get(d.addressId!)!);
    const minutes = summarizeDraft(d, ctx).lines[0].quote.totalMinutes;
    const fit = (await this.trust.approvedCards(only === undefined ? undefined : [only])).filter((c) => c.id !== ctx.ownerId && fitsBooking(c, needs));
    const schedules = await this.schedules.forBookingMany(fit.map((c) => c.id));
    return fit.map((c) => {
      const card: CaregiverCard = { ...c };
      delete (card as Partial<typeof c>).overtimeMaxMin;
      const clashes = clashingVisits(d.visits, minutes, schedules.get(card.id)!);
      return { card, free: !clashes.length, availability: availabilityText(d.visits.length, clashes) };
    });
  }

  private async stillFits(d: DraftInput, ctx: Context, caregiverId: number): Promise<boolean> {
    if (summarizeDraft(d, ctx).blocks.length) return true; // checked again once the setup is complete
    const [o] = await this.options(d, ctx, caregiverId);
    return !!o?.free;
  }

  private clean(d: DraftInput, ctx: DraftContext): DraftInput {
    return {
      ...d,
      petIds: d.petIds.filter((id) => ctx.pets.some((p) => p.id === id && p.status !== 'rejected')),
      addressId: d.addressId !== null && ctx.addressIds.includes(d.addressId) ? d.addressId : null,
    };
  }

  /** Pets deleted or rejected since the draft was saved simply drop out. */
  private async view(d: DraftInput, ctx: DraftContext, caregiverId: number | null, note: string | null, entry: EntryInfo | null): Promise<Omit<BookingDraft, 'promoCode'>> {
    const clean = this.clean(d, ctx);
    const card = caregiverId === null ? null : await this.trust.card(caregiverId).catch(() => null);
    return { ...clean, summary: summarizeDraft(clean, ctx), caregiver: card ? { id: card.id, displayName: card.displayName } : null, caregiverNote: note, entry };
  }

  private async entry(row: DraftRow): Promise<EntryInfo | null> {
    if (!row.entry_method) return null;
    const text = row.entry_secret ? (JSON.parse(await this.secrets.open(row.entry_secret)) as Omit<EntryInfo, 'method'>) : { keyLock: '', guard: '', notes: '' };
    return { method: row.entry_method, ...text };
  }

  private async row(ownerId: number): Promise<DraftRow | undefined> {
    const { rows } = await this.db.pool.query<DraftRow>('SELECT * FROM booking_drafts WHERE owner_id = $1', [ownerId]);
    return rows[0];
  }

  private async context(ownerId: number): Promise<Context> {
    const pets = await this.db.pool.query<{ id: string; kind: PetKind; status: PetStatus; name: string; weight_kg: string | null }>(
      'SELECT id, kind, status, name, weight_kg FROM pets WHERE owner_id = $1 ORDER BY id',
      [ownerId],
    );
    const addresses = await this.db.pool.query<{ id: string; is_default: boolean; area: Area }>('SELECT id, is_default, area FROM addresses WHERE owner_id = $1 AND deleted_at IS NULL ORDER BY id', [ownerId]);
    return {
      ownerId,
      pets: pets.rows.map((p) => ({ id: Number(p.id), kind: p.kind, status: p.status, name: p.name, weightKg: p.weight_kg === null ? null : Number(p.weight_kg) })),
      addressIds: addresses.rows.map((a) => Number(a.id)),
      areas: new Map(addresses.rows.map((a) => [Number(a.id), a.area])),
      defaultAddressId: Number(addresses.rows.find((a) => a.is_default)?.id ?? 0) || null,
      now: new Date(),
    };
  }
}
