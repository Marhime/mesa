#!/bin/sh
# Nightly pg_dump of the Supabase database (run by the "backup" service in docker-compose.yml).
# One custom-format dump per schema at 03:30 (TZ, default America/Mexico_City) and once at startup,
# into /backups; dumps older than BACKUP_KEEP_DAYS (14) are deleted.
set -u

: "${DATABASE_URL:?DATABASE_URL is required (Supabase session pooler connection string)}"
SCHEMAS="${BACKUP_SCHEMAS:-public auth}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
AT="${BACKUP_AT:-03:30}"
DIR="${BACKUP_DIR:-/backups}"
export PGCONNECT_TIMEOUT=30

log() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') backup: $*"; }

if [ ! -e "/usr/share/zoneinfo/${TZ:-UTC}" ]; then
  log "warning: time zone ${TZ:-UTC} not found, using UTC"
fi
mkdir -p "$DIR"

run_backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  for schema in $SCHEMAS; do
    file="$DIR/mesa-$schema-$stamp.dump"
    log "dumping schema $schema"
    # each schema is its own file, so a permission problem on one never loses the others
    if pg_dump --format=custom --schema="$schema" --file="$file.partial" "$DATABASE_URL"; then
      mv "$file.partial" "$file"
      log "wrote $file ($(du -h "$file" | cut -f1))"
    else
      rm -f "$file.partial"
      log "FAILED to dump schema $schema" >&2
    fi
  done
  find "$DIR" -maxdepth 1 -type f -name 'mesa-*.dump' -mmin +$((KEEP_DAYS * 24 * 60)) -print -delete |
    while read -r old; do log "deleted $old"; done
}

seconds_until_next_run() {
  now=$(date +%s)
  next=$(date -d "$(date +%Y-%m-%d) $AT" +%s)
  if [ "$next" -le "$now" ]; then next=$((next + 86400)); fi
  echo $((next - now))
}

trap 'log "stopping"; exit 0' TERM INT

log "started: schemas [$SCHEMAS], daily at $AT ${TZ:-UTC}, keeping $KEEP_DAYS days"
run_backup
while true; do
  wait_s=$(seconds_until_next_run)
  log "next backup in $((wait_s / 3600))h$(((wait_s % 3600) / 60))m"
  # sleep in the background so "docker compose stop" is handled right away
  sleep "$wait_s" &
  wait $!
  run_backup
done
