#!/bin/sh
# E15-2 (round 62): tests the whole hosting setup on this computer, the way it runs on the server.
#   sh deploy/test.sh            builds the images, starts a test stack, checks it, removes it
#   SKIP_BUILD=1 sh deploy/test.sh   uses images already built
# Needs Docker. Uses ports 80 and 443. Never run it on the real server (it deletes its own test data).
set -eu
cd "$(dirname "$0")"
P="docker compose -p pawpal-test --env-file test.env"
R="--resolve app.localhost:443:127.0.0.1 --resolve admin.localhost:443:127.0.0.1"
fail() { echo "FAIL: $1"; if [ "${KEEP:-}" != 1 ]; then $P down -v >/dev/null 2>&1 || true; rm -f test.env; fi; exit 1; }
ok() { echo "ok   $1"; }

HASH=$(docker run --rm caddy:2 caddy hash-password --plaintext test-pass | sed 's/\$/$$/g')
cat > test.env <<EOF
APP_DOMAIN=app.localhost
ADMIN_DOMAIN=admin.localhost
TLS_EMAIL=test@example.com
CADDY_GLOBAL=local_certs
NODE_ENV=staging
DB_PASSWORD=test-db-pass
ADDRESS_KEY=$(head -c 32 /dev/urandom | base64)
PAYMENT_GATEWAY=mock
MOCK_GATEWAY_SECRET=test-secret
SMS_PROVIDER=mock
WHATSAPP_PROVIDER=mock
DEV_TOOLS_USER=tester
DEV_TOOLS_HASH=$HASH
EOF

[ "${SKIP_BUILD:-}" = 1 ] || $P build
$P down -v >/dev/null 2>&1 || true
# docker compose reads deploy/.env for env_file; the test stack uses test.env instead.
sed 's#env_file: .env#env_file: test.env#' docker-compose.yml > test-compose.yml
P="docker compose -p pawpal-test -f test-compose.yml --env-file test.env"
$P up -d --no-build >/dev/null 2>&1 || fail "stack did not start"

i=0; until curl -sfk $R https://app.localhost/api/health >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 60 ] && fail "server not healthy in 60 s"; sleep 1; done

# R62-2: HTTPS, the app and admin on their own addresses, /api passed on.
curl -sk $R https://app.localhost/api/health | grep -q '"status":"ok".*"gateway":"up"' && ok "health over HTTPS" || fail "health"
[ "$(curl -sk $R -o /dev/null -w '%{http_code}' https://app.localhost/)" = 200 ] && ok "app opens" || fail "app"
[ "$(curl -sk $R -o /dev/null -w '%{http_code}' https://app.localhost/pages/booking/index)" = 200 ] && ok "app page link opens" || fail "app page link"
curl -sk $R https://app.localhost/ | grep -q manifest && ok "app can be installed (manifest)" || fail "manifest"
curl -sk $R https://admin.localhost/ | grep -q 'PawPal Admin' && ok "admin opens" || fail "admin"
[ "$(curl -s -o /dev/null -w '%{http_code}' --resolve app.localhost:80:127.0.0.1 http://app.localhost/)" = 308 ] && ok "http goes to https" || fail "http redirect"
curl -skI $R https://app.localhost/ | grep -qi 'strict-transport-security' && ok "HSTS header" || fail "HSTS"
# The first admin is made inside the server container (README step 2).
printf 'kfadmin\nKF Lee\nstaging-pass-2026\nstaging-pass-2026\n' | $P exec -T server node dist/admin/create-admin.js 2>&1 | grep -q 'Admin "kfadmin" created' && ok "first admin created on the server" || fail "create admin"
# R62-4: Test tools need the password.
[ "$(curl -sk $R -o /dev/null -w '%{http_code}' -X POST https://admin.localhost/api/dev/monitor/test-alert)" = 401 ] && ok "Test tools refused without password" || fail "dev without password"
[ "$(curl -sk $R -u tester:test-pass -o /dev/null -w '%{http_code}' -X POST https://admin.localhost/api/dev/monitor/test-alert)" = 200 ] && ok "Test tools work with password" || fail "dev with password"

# R62-3: back up, lose data, restore, data is back.
$P exec -T db psql -U pawpal -q -c "INSERT INTO app_settings (key, value) VALUES ('restore-test', 'before') ON CONFLICT (key) DO UPDATE SET value = 'before'" || fail "marker"
$P exec -T server sh -c 'echo photo > /data/uploads/restore-test.txt' || fail "photo"
$P exec -T backup sh /backup.sh now >/dev/null || fail "backup"
$P exec -T backup sh -c 'ls /backups/pawpal-*.dump /backups/uploads-*.tgz' >/dev/null && ok "backup made (database and photos)" || fail "backup files"
$P exec -T db psql -U pawpal -q -c "DELETE FROM app_settings WHERE key = 'restore-test'"
$P exec -T server rm /data/uploads/restore-test.txt
$P stop server >/dev/null 2>&1
docker run --rm --network pawpal-test_default -e PGHOST=db -e PGUSER=pawpal -e PGPASSWORD=test-db-pass -e PGDATABASE=pawpal \
  -v pawpal-test_backups:/backups -v pawpal-test_uploads:/data/uploads -v "$PWD/restore.sh:/restore.sh:ro" postgres:17-alpine \
  sh -c 'sh /restore.sh "$(ls /backups/pawpal-*.dump | tail -1)" "$(ls /backups/uploads-*.tgz | tail -1)"' >/dev/null || fail "restore"
$P start server >/dev/null 2>&1
[ "$($P exec -T db psql -U pawpal -tA -c "SELECT value FROM app_settings WHERE key = 'restore-test'")" = before ] && ok "database restored" || fail "database not restored"
i=0; until curl -sfk $R https://app.localhost/api/health >/dev/null 2>&1; do i=$((i+1)); [ $i -gt 60 ] && fail "server not back after restore"; sleep 1; done
[ "$($P exec -T server cat /data/uploads/restore-test.txt)" = photo ] && ok "photos restored, server back up" || fail "photos not restored"

# R62-4: production refuses test services.
out=$($P run --rm -T -e NODE_ENV=production --no-deps server node dist/main.js 2>&1 || true)
echo "$out" | grep -q 'cannot run in production' && ok "production refuses the test gateway and SMS" || fail "production started with test services"

[ "${KEEP:-}" = 1 ] || $P down -v >/dev/null 2>&1
rm -f test.env test-compose.yml
echo "All hosting checks passed"
