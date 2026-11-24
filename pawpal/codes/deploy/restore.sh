#!/bin/sh
# E15-2 (R62-3): puts a backup back. Replaces EVERYTHING in the database (and the photos, if given).
#   sh restore.sh /backups/pawpal-2026-11-24-0300.dump [/backups/uploads-2026-11-24-0300.tgz]
# Needs PGHOST, PGUSER, PGPASSWORD, PGDATABASE. Stop the server first (docker compose stop server).
set -eu
DUMP="${1:?Give the database backup file}"
PHOTOS="${2:-}"
UPLOADS="${UPLOADS_DIR:-/data/uploads}"
[ -f "$DUMP" ] || { echo "No file $DUMP"; exit 1; }
pg_restore --list "$DUMP" >/dev/null || { echo "$DUMP is not a database backup"; exit 1; }

psql -v ON_ERROR_STOP=1 -q -c 'SET client_min_messages = warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
pg_restore --no-owner --exit-on-error --dbname="$PGDATABASE" "$DUMP"
if [ -n "$PHOTOS" ]; then
  mkdir -p "$UPLOADS"
  find "$UPLOADS" -mindepth 1 -delete
  tar xzf "$PHOTOS" -C "$UPLOADS"
fi
echo "Restored $DUMP$( [ -n "$PHOTOS" ] && echo " and $PHOTOS")"
