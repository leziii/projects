# PawPal Project Rules

One mobile web app (owner + caregiver, role switch) + one separate web admin console. Goal: pilot in Kuala Lumpur, Malaysia. Currency: RM.

## 1. How We Work
1. Discuss with KF first. No code until KF confirms the whole plan.
2. Unclear? Ask KF. Never invent rules marked 待定 (TBD).
3. MVP first, test-driven. One story per round, from Brief section 8, in order:
   a. Backend code → b. Backend automated tests → c. Frontend code → d. Frontend automated tests → e. Ask KF to test by hand.
   A round ends only with **0 errors and 0 warnings** in backend and frontend (`pnpm check` and `pnpm e2e`). Then the next story.
   Every round, review Pawpal_Project.md and ask KF about anything unclear.
4. Keep all planning in one file: `docs/Pawpal_Project.md`. No extra docs.
5. Explain in plain, simple words.

## 2. Folders
```
Pawpal/
├─ CLAUDE.md            this file
├─ docs/                Pawpal_Project.md (single plan) + page list
├─ design/wireframes/   low-fi sketches, named by view ID (e.g. O06.html)
└─ codes/               all source code
   ├─ mobile/           mobile web app (uni-app H5; Android/iOS later)
   ├─ admin-web/        admin console (Vue 3)
   ├─ server/           backend (Node.js NestJS + PostgreSQL + Redis)
   ├─ shared/           shared rules: prices, statuses, time limits
   ├─ tests/            walk-through scenario tests
   └─ scripts/          helper scripts
```
- Everything stays in `D:\Claude code projects\Pawpal`. Code only in `codes/`.
- View IDs: O = owner, S = caregiver, A = admin, C = common.

## 3. Settled Business Rules (do not change)
| Item | Rule |
|---|---|
| Price | Cat RM40 / ≥30 min · Dog basic RM60 / ≥20 min · Dog upgrade RM70 / ≥60 min |
| Mixed | Dog price + RM10 per cat · basic ≥45 min · upgrade ≥60 min |
| Extras | Extra pet RM10 each · Overtime RM10 per 15 min |
| Capacity | Max 3 pets, max 2 dogs |
| Accept window | First visit <3 h away: fail, full refund · 3–6 h: urgent, 30 min to accept · ≥6 h: normal, 3 h to accept |
| Accepting | Whole order only · Cancel beats accept if simultaneous |
| Cancel refund | ≥24 h: 100% · 1–24 h: 80% · <1 h: 0% (from formal submit time) |
| Waiting | First 10 min free, then RM5 / 10 min · max 60 min / RM25 · 100% to caregiver |
| Split | Service + overtime: caregiver 85%, platform 15% |
| Report | 12 h confirm window per visit after a complete report · Dispute freezes whole-order payout |
| Payout | Only after every visit is final and all refunds/disputes are closed |

## 4. Engineering Rules
1. Prices and time limits live only in `codes/shared/`. Never hard-code in pages.
2. Order, payment, refund, payout statuses are separate. "Paying out" ≠ "Paid".
3. Payment result comes from the server callback, never the front end.
4. Pay, refund, payout must be idempotent: repeats never take effect twice.
5. Address, entry instructions, income: visible only to authorized users.
6. Payment: Touch 'n Go, DuitNow, cards via a payment gateway. Use a mock payment module until the gateway is ready.
