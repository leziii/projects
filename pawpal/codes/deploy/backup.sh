#!/bin/sh
# E15-2 (R62-3): backs up the database and the uploaded photos.
#   sh backup.sh now    one backup now
#   sh backup.sh loop   one backup every day at BACKUP_HOUR (default 3 am, in TZ), forever
# Needs PGHOST, PGUSER, PGPASSWORD, PGDATABASE. Writes to BACKUP_DIR (default /backups), keeps BACKUP_DAYS (default 14) days.
set -eu
DIR="${BACKUP_DIR:-/backups}"
DAYS="${BACKUP_DAYS:-14}"
UPLOADS="${UPLOADS_DIR:-/data/uploads}"

once() {
  stamp=$(date +%Y-%m-%d-%H%M)
  mkdir -p "$DIR"
  pg_dump --format=custom --no-owner --file="$DIR/pawpal-$stamp.dump.part" && mv "$DIR/pawpal-$stamp.dump.part" "$DIR/pawpal-$stamp.dump"
  if [ -d "$UPLOADS" ]; then tar czf "$DIR/uploads-$stamp.tgz.part" -C "$UPLOADS" . && mv "$DIR/uploads-$stamp.tgz.part" "$DIR/uploads-$stamp.tgz"; fi
  # R62-6: a copy outside the server once BACKUP_S3 is set (needs the AWS command line in the image).
  if [ -n "${BACKUP_S3:-}" ] && command -v aws >/dev/null; then aws s3 cp "$DIR/pawpal-$stamp.dump" "$BACKUP_S3/"; fi
  find "$DIR" -name 'pawpal-*.dump' -mtime +"$DAYS" -delete
  find "$DIR" -name 'uploads-*.tgz' -mtime +"$DAYS" -delete
  echo "Backup $stamp done: $(ls "$DIR" | grep -c dump) database backups kept"
}

case "${1:-now}" in
  now) once ;;
  loop)
    while true; do
      now=$(date +%s)
      next=$(date -d "$(date +%Y-%m-%d) $(printf %02d "${BACKUP_HOUR:-3}"):00:00" +%s)
      [ "$next" -le "$now" ] && next=$((next + 86400))
      [ "$next" -le "$now" ] && next=$((now + 86400))
      sleep $((next - now))
      once || echo "Backup failed"
    done
    ;;
  *) echo "Use: backup.sh now|loop"; exit 1 ;;
esac
