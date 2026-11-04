# PawPal code

| Folder | What | Port |
|---|---|---|
| `server/` | NestJS API (PostgreSQL + Redis) | 3000 |
| `admin-web/` | Admin console (Vue 3 + Element Plus) | 5173 |
| `mobile/` | Owner + caregiver app (uni-app H5) | 5174 |
| `shared/` | Code used by all three | — |
| `tests/` | Browser tests (Playwright) | — |

## First time (Windows)
1. Install **Node.js 22** and **Docker Desktop**.
2. In this `codes` folder, open PowerShell:
   ```
   npm install -g pnpm
   pnpm install
   copy .env.example server\.env
   pnpm db:up
   pnpm --filter @pawpal/e2e exec playwright install chromium
   ```

## Every day
| Command | Does |
|---|---|
| `pnpm dev` | Runs server, admin and mobile together |
| `pnpm check` | Lint + type check + build + unit tests (must be 0 errors, 0 warnings) |
| `pnpm e2e` | Browser tests for admin and mobile |
| `pnpm db:down` | Stops PostgreSQL and Redis |
| `pnpm icons` | Redraws the app icons after a brand change (`shared/src/brand.ts`) |
| `pnpm admin:create` | Creates an admin account and shows the QR code for the authenticator app |

Open http://localhost:5173 (admin) and http://localhost:5174 (mobile).

The server creates its database tables on start. Payments use a mock gateway: try it in admin → **Payments (test)**.
The admin console needs its own account: run `pnpm admin:create` once, then log in with username, password and the authenticator code.
If push alerts fail with "Cannot reach the push service" and this PC uses a VPN/proxy, set `PUSH_PROXY` in `server/.env` to the proxy (Windows: Settings → Network & internet → Proxy).
The help button on the Me page opens WhatsApp to `SUPPORT_WHATSAPP` (set it in `server/.env`, with country code). Until it is set, a placeholder number is used outside production.
Vaccine card photos are saved in `server/uploads/` in development (`UPLOAD_DIR`). Only the pet's owner can open them.
Owner addresses and contacts are stored encrypted. Development makes a key by itself; production must set `ADDRESS_KEY` (see `.env.example`) and never change it. The same key protects caregiver IC numbers (E4-1).
Admin → **Test tools** (development only) sets a caregiver status, sends test messages, and sends booking-request alerts (push + WhatsApp/SMS) with an alert log.

Brand (colours, font, logo) lives only in `shared/src/brand.ts`. A test fails if a colour is typed anywhere else.
