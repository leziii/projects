/**
 * E11-2 S11 → S14 (round 46): the caregiver asks for overtime while in service.
 * 15-min units at RM10, up to her own limit; the extra time must fit her schedule.
 */
import { DEFAULT_RULES, formatRM } from './rules';
import { blockOn, timeText, type Schedule } from './schedule';

export const OVERTIME_RULES = { unitMin: 15, unitSen: DEFAULT_RULES.price.overtimePer15 } as const;

export type OvertimeStatus = 'requested' | 'paid';

export interface OvertimeRequest {
  id: number;
  units: number;
  amountSen: number;
  status: OvertimeStatus;
  requestedAt: string;
  /** E11-4 (R48-4): once the report is sent, the overtime actually used and earned. */
  usedMin: number | null;
  usedSen: number | null;
}

export interface OvertimeCheck {
  units: number;
  fits: boolean;
  /** "Fits (next visit 11:30 am)" or "Clashes with your 11:30 am visit". */
  text: string;
}

/** What S14 Overtime shows. */
export interface OvertimeInfo {
  orderId: number;
  index: number;
  number: string;
  /** R46-2: the caregiver's limit and the overtime the owner already booked for this visit. */
  limitMin: number;
  bookedMin: number;
  /** When the service ends now, minutes after midnight (KL). */
  endMin: number;
  /** One line per choosable number of units, 1 … max. Empty when no overtime is left. */
  choices: OvertimeCheck[];
  /** R46-5: the open request, if any; after E11-3 also a paid one. */
  open: OvertimeRequest | null;
}

/** R46-2: how many units can still be asked for. */
export const overtimeMaxUnits = (limitMin: number, bookedMin: number) => Math.max(0, Math.floor((limitMin - bookedMin) / OVERTIME_RULES.unitMin));

/** "30 min · RM20" */
export const overtimeText = (units: number) => `${units * OVERTIME_RULES.unitMin} min · ${formatRM(units * OVERTIME_RULES.unitSen)}`;

/**
 * R46-3: can the service run `units` × 15 min past `endMin` on `date`? Not into another booked visit (with the travel
 * buffer) and not into a "Not available" block. `selfId` is this visit's own booked slot, which never clashes.
 */
export function overtimeCheck(date: string, endMin: number, units: number, s: Pick<Schedule, 'settings' | 'blocks' | 'visits'>, selfId: number | null): OvertimeCheck {
  const to = endMin + units * OVERTIME_RULES.unitMin;
  const buffer = s.settings.travelBufferMin;
  const others = s.visits.filter((v) => v.date === date && v.id !== selfId && v.start + v.minutes > endMin).sort((a, b) => a.start - b.start);
  const clashVisit = others.find((v) => v.start - buffer < to);
  if (clashVisit) return { units, fits: false, text: `Clashes with your ${timeText(clashVisit.start)} visit` };
  const block = s.blocks.filter((b) => blockOn(b, date) && b.end > endMin && b.start < to).sort((a, b) => a.start - b.start)[0];
  if (block) return { units, fits: false, text: `Clashes with your Not available time from ${timeText(Math.max(block.start, endMin))}` };
  return { units, fits: true, text: others[0] ? `Fits (next visit ${timeText(others[0].start)})` : 'Fits (no other visit today)' };
}
