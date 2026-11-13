#!/bin/sh
# Nightly pg_dump of the Supabase database (run by the "backup" service in docker-compose.yml).
# One custom-format dump per schema at 03:30 (TZ) and once at startup, into /backups; dumps older than
# BACKUP_KEEP_DAYS (14) are deleted. Off the VPS too: each dump is also uploaded to the private Supabase
# Storage bucket "backups" as mesa-<schema>-<weekday>.dump (the last 7 days, overwritten in turn).
# When every schema is saved, HEALTHCHECK_BACKUP_URL (healthchecks.io) is pinged: no ping, an email.
set -u
SCHEMAS="${BACKUP_SCHEMAS:-public auth}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
AT="${BACKUP_AT:-03:30}"
DIR="${BACKUP_DIR:-/backups}"
export PGCONNECT_TIMEOUT=30

log() { echo "$(date '+%Y-%m-%dT%H:%M:%S%z') backup: $*"; }

# A missing or example DATABASE_URL would fail every night without a sound: say so and wait instead
# of restarting in a loop (the missing healthcheck ping is the alarm).
case "${DATABASE_URL:-}" in
  "" | *YOUR-*)
    log "DISABLED: set DATABASE_URL in infra/vps/.env (Supabase → Connect → Session pooler), then docker compose up -d backup" >&2
    while true; do sleep 86400; done
    ;;
esac

# Off-VPS copy needs curl (not in the postgres image).
OFFSITE=""
if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  if command -v curl >/dev/null 2>&1 || apk add --no-cache curl >/dev/null 2>&1; then
    OFFSITE=1
  else
    log "warning: curl unavailable, dumps stay on this VPS only" >&2
  fi
fi

upload() { # $1 file, $2 object name
  curl -sf -X POST "${SUPABASE_URL%/}/storage/v1/object/backups/$2" \
    -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
    -H "x-upsert: true" -H "Content-Type: application/octet-stream" --data-binary "@$1" >/dev/null
}

if [ ! -e "/usr/share/zoneinfo/${TZ:-UTC}" ]; then
  log "warning: time zone ${TZ:-UTC} not found, using UTC"
fi
mkdir -p "$DIR"

run_backup() {
  stamp=$(date +%Y%m%d-%H%M%S)
  day=$(date +%a)
  ok=1
  for schema in $SCHEMAS; do
    file="$DIR/mesa-$schema-$stamp.dump"
    log "dumping schema $schema"
    # each schema is its own file, so a permission problem on one never loses the others
    if pg_dump --format=custom --schema="$schema" --file="$file.partial" "$DATABASE_URL"; then
      mv "$file.partial" "$file"
      log "wrote $file ($(du -h "$file" | cut -f1))"
      if [ -n "$OFFSITE" ]; then
        if upload "$file" "mesa-$schema-$day.dump"; then log "copied off the VPS as mesa-$schema-$day.dump"
        else log "FAILED to copy $file off the VPS" >&2; ok=0; fi
      fi
    else
      rm -f "$file.partial"
      log "FAILED to dump schema $schema" >&2
      ok=0
    fi
  done
  if [ "$ok" = 1 ] && [ -n "${HEALTHCHECK_BACKUP_URL:-}" ]; then
    wget -q -T 10 -O /dev/null "$HEALTHCHECK_BACKUP_URL" || log "warning: healthcheck ping failed" >&2
  fi
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
