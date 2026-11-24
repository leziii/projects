# PawPal hosting (E15-2)

One server runs everything with Docker: the API, PostgreSQL, Redis, daily backups, and Caddy, which gives the app and admin HTTPS by itself.
Staging and production use the same files; only `deploy/.env` differs.

| Address | What |
|---|---|
| `https://APP_DOMAIN` | Owner and caregiver app (installable on phones) |
| `https://ADMIN_DOMAIN` | Admin console |
| `…/api/health` | Health check for UptimeRobot |

## 1. Things KF sets up once
1. **Domain.** Buy one (for example `pawpal.my` from a .my registrar).
2. **AWS account.** Sign up at aws.amazon.com, then in the top bar choose the region **Asia Pacific (Malaysia) ap-southeast-5**.
3. **Server.** EC2 → Launch instance:
   - Name `pawpal-staging`, image **Ubuntu 24.04**, type **t3.small** (2 GB), storage **30 GB**.
   - Key pair: create one and keep the file.
   - Network: allow **SSH from my IP**, **HTTP** and **HTTPS** from anywhere.
   - After launch: Elastic IPs → Allocate → Associate it with the instance (so the IP never changes).
4. **DNS.** At the domain registrar add two `A` records pointing to the Elastic IP:
   `app-staging` and `admin-staging` (production later: `app` and `admin`).

## 2. Install (on the server, over SSH)
```
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu && exit        # log in again after this
git clone https://github.com/leziii/projects.git && cd projects/pawpal/codes
docker compose -f deploy/docker-compose.yml build
sh deploy/setup-env.sh app-staging.pawpal.my admin-staging.pawpal.my you@example.com 'a-test-tools-password'
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml exec server node dist/admin/create-admin.js
```
Open `https://app-staging.pawpal.my/api/health`: it shows `"status":"ok"`. The first visit can take a minute while the certificate is made.
**Save `deploy/.env` in a password manager.** Without `ADDRESS_KEY`, saved addresses and backups cannot be read.

## 3. Uptime alert (R61-2)
UptimeRobot → Add monitor → **Keyword**, URL `https://APP_DOMAIN/api/health`, keyword `"status":"ok"`, every **5 minutes**, alert by email and the UptimeRobot app.

## 4. Every day use
| Command (in `pawpal/codes`) | Does |
|---|---|
| `git pull && docker compose -f deploy/docker-compose.yml up -d --build` | Puts out a new version |
| `docker compose -f deploy/docker-compose.yml logs -f server` | Server log |
| `docker compose -f deploy/docker-compose.yml exec backup sh /backup.sh now` | Backup now |
| `docker compose -f deploy/docker-compose.yml exec backup ls /backups` | List backups |

Backups run every day at 3 am KL and keep 14 days (R62-3).

## 5. Restore a backup
```
cd pawpal/codes/deploy
docker compose stop server
docker run --rm --network pawpal_default --env-file .env -e PGHOST=db -e PGUSER=pawpal -e PGDATABASE=pawpal \
  -e PGPASSWORD="$(grep ^DB_PASSWORD= .env | cut -d= -f2)" \
  -v pawpal_backups:/backups -v pawpal_uploads:/data/uploads -v "$PWD/restore.sh:/restore.sh:ro" postgres:17-alpine \
  sh /restore.sh /backups/pawpal-2026-11-24-0300.dump /backups/uploads-2026-11-24-0300.tgz
docker compose start server
```

## 6. Staging and production
- **Staging** (`NODE_ENV=staging`): test gateway, test SMS, Test tools behind the password in `.env`.
- **Production** (`NODE_ENV=production`): refuses to start with any test service. It opens after the real gateway (E15-1) and SMS/WhatsApp provider (E15-5).

## 7. Test this setup on a computer with Docker
`pnpm deploy:test` builds the images, starts a test copy, and checks HTTPS, both sites, the Test tools password, backup and restore, and that production refuses test services.
