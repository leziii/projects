#!/bin/sh
# E15-2: makes deploy/.env with new random keys. Run once per server, after building the images.
#   sh deploy/setup-env.sh app.pawpal.my admin.pawpal.my you@example.com 'test-tools-password'
# Never overwrites a key already filled in (changing ADDRESS_KEY would lock all saved addresses).
set -eu
cd "$(dirname "$0")"
APP="${1:?App address, e.g. app.pawpal.my}"; ADMIN="${2:?Admin address, e.g. admin.pawpal.my}"
EMAIL="${3:?Email for certificate notices}"; DEVPW="${4:?Password for Test tools}"
[ -f .env ] || cp .env.example .env

set_if_empty() { # key value
  if grep -q "^$1=$" .env; then
    esc=$(printf '%s' "$2" | sed 's/[&|]/\\&/g')
    sed -i "s|^$1=$|$1=$esc|" .env
  fi
}
rand() { head -c "$1" /dev/urandom | base64 | tr -d '\n'; }

sed -i "s|^APP_DOMAIN=.*|APP_DOMAIN=$APP|; s|^ADMIN_DOMAIN=.*|ADMIN_DOMAIN=$ADMIN|; s|^TLS_EMAIL=.*|TLS_EMAIL=$EMAIL|" .env
set_if_empty DB_PASSWORD "$(rand 24 | tr -d '/+=')"
set_if_empty ADDRESS_KEY "$(rand 32)"
set_if_empty MOCK_GATEWAY_SECRET "$(rand 24 | tr -d '/+=')"
keys=$(docker run --rm pawpal-server node -e "const k=require('web-push').generateVAPIDKeys();console.log(k.publicKey+' '+k.privateKey)")
set_if_empty VAPID_PUBLIC_KEY "${keys% *}"
set_if_empty VAPID_PRIVATE_KEY "${keys#* }"
# Every $ in the hash is written as $$, because docker compose reads $ as a variable.
hash=$(docker run --rm caddy:2 caddy hash-password --plaintext "$DEVPW" | sed 's/\$/$$/g')
sed -i "s|^DEV_TOOLS_HASH=.*|DEV_TOOLS_HASH=$hash|" .env
chmod 600 .env
echo "deploy/.env is ready. Keep a copy of it somewhere safe (a password manager): without ADDRESS_KEY a backup cannot be read."
