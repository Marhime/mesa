# Mesa on a VPS

Two containers, started with Docker Compose from this folder:

- **worker**: the recipe import worker (`apps/worker`). It polls `import_jobs` in Supabase, reads each
  shared link, screenshot or text with Gemini (plus yt-dlp for Instagram/TikTok videos) and writes the
  recipe. No ports are opened; it only makes outgoing HTTPS requests.
- **backup**: `pg_dump` of the Supabase database every day at 03:30 (America/Mexico_City) and once at
  startup, into `./backups`, keeping 14 days.

Requirements: a Linux VPS with Docker Engine and the Compose plugin (`docker compose version`), 1 GB of
RAM is enough. The Supabase migrations in `supabase/migrations` must already be applied.

## 1. Configure

```sh
git clone <repo> mesa && cd mesa/infra/vps
cp .env.example .env
nano .env            # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY, DATABASE_URL
chmod 600 .env
mkdir -p backups secrets
```

- `SUPABASE_SERVICE_ROLE_KEY`: Supabase → Project settings → API keys → `service_role` (or the
  `sb_secret_…` key). The worker refuses to start with the anon/publishable key.
- `DATABASE_URL`: Supabase → **Connect** → **Session pooler** connection string, with the database
  password filled in.
- Instagram (optional but recommended): Instagram often blocks server IPs. Export `cookies.txt`
  (Netscape format) from a browser logged in to a throwaway Instagram account, save it as
  `secrets/cookies.txt`, run `chmod 644 secrets/cookies.txt`, and set `YTDLP_COOKIES=/secrets/cookies.txt`
  in `.env`. Without it, Instagram imports fall back to the post caption.

## 2. Start

```sh
docker compose up -d --build
docker compose ps
```

## 3. Check the logs

```sh
docker compose logs -f worker        # JSON lines: worker_started, catalog_loaded, job_started, job_done, job_failed…
docker compose logs -f backup
ls -lh backups/
```

A healthy start shows `catalog_loaded` (≈177 products), `worker_started` with the yt-dlp version, one
`slot_started` per slot (lane `any` × `WORKER_CONCURRENCY`, lane `quick` × `WORKER_QUICK_SLOTS`) and
`wake_listening` (new jobs wake idle slots at once; `wake_channel_trouble` means they wait for the poll).
Share a recipe from the app and you should see `job_started` then `job_done` within a minute.
Useful filters:

```sh
docker compose logs worker | grep job_failed
docker compose logs --since 1h worker | grep gemini_call     # model latency and token counts
```

## 4. Update

From your Mac (the repo is copied, not cloned, to `/opt/mesa`):

```sh
MESA_VPS=root@<vps ip> infra/vps/deploy.sh   # rsync + rebuild the worker; the server's .env is kept
```

### Update yt-dlp

Instagram and TikTok change often; when imports start failing with `video_meta_failed`, get the latest
yt-dlp. The image downloads the latest release at build time and the build re-checks it, so:

```sh
docker compose build worker && docker compose up -d worker
docker compose exec worker yt-dlp --version
```

If the version did not change, force it with `docker compose build --no-cache worker`.

## 5. Backups and restore

Files are `backups/mesa-<schema>-<YYYYMMDD-HHMMSS>.dump` (`pg_dump --format=custom`), one per schema in
`BACKUP_SCHEMAS` (default `public auth`). Copy them off the VPS from time to time
(`scp vps:mesa/infra/vps/backups/*.dump .`). Run one now with `docker compose restart backup`.

See what is inside a dump:

```sh
docker compose run --rm --entrypoint pg_restore backup --list /backups/mesa-public-20261105-033000.dump | head -50
```

Restore the app data (schema `public`) into the database in `DATABASE_URL`. This **replaces** the
current tables with the backup, so stop the worker first:

```sh
docker compose stop worker
docker compose run --rm --entrypoint sh backup -c \
  'pg_restore --clean --if-exists --no-owner --schema=public --dbname="$DATABASE_URL" /backups/mesa-public-20261105-033000.dump'
docker compose start worker
```

A few errors such as `cannot drop function … because other objects depend on it` are expected: functions
like `current_household_id()` are also used by Supabase Auth/Storage policies, so they stay in place
(with the same definition). Check afterwards in the Supabase table editor that `recipes` and
`grocery_items` have rows.

To restore into a **new** Supabase project: apply the migrations first (`supabase db push`), bring the
accounts back from the `auth` dump (`pg_restore --data-only --schema=auth …`; if your role is not allowed
to write `auth`, people simply sign in again and rejoin the household), then restore `public` as above.
Recipe images live in Supabase Storage, not in these dumps.

To restore a single table, add `--table=recipes` (and its children `recipe_ingredients`,
`recipe_steps`) and use `--data-only` into an emptied table.

## Notes

- Memory: the worker is capped at 512 MB (`mem_limit`), the backup at 256 MB.
- On `docker compose stop`, jobs in progress get 45 s to finish; unfinished ones go back to the queue.
  Jobs abandoned by a crash are re-queued by `claim_import_job` after 10 minutes (3 attempts at most).
- Logs rotate (json-file, 3 × 10 MB).
