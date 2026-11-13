// Mesa import worker: claims import_jobs and runs each with its kind's handler (runner.ts, handlers/).
// Slots of the 'any' lane take every kind (people's quick ones first, one job per household at a time,
// households in turn, the server's own work last); quick slots take only a person's quick kinds (Ask Mesa,
// Redo ingredients), so a question never waits behind an import. A new job wakes idle slots at once
// (Realtime); the poll is the fallback. Besides the jobs: the catalog refresh, the heartbeat, the sweep of
// what people shared (media-sweep.ts), and the day's AI ceiling (ai-budget.ts).
import { access, constants } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { DailyAiBudget, supabaseUsageStore } from './ai-budget';
import { CatalogStore, supabaseCatalogReader } from './catalog-store';
import { ConfigError, loadConfig, type Config } from './config';
import { RecipeAI } from './gemini';
import { claimJob, type Lane } from './job-store';
import { log, setLogLevel } from './log';
import { Heartbeat } from './heartbeat';
import { MediaSweep } from './media-sweep';
import { ModelChain } from './model-chain';
import type { PipelineDeps } from './pipeline';
import { sleep } from './retry';
import { jobRunner, runJob } from './runner';
import { runSlot } from './slot';
import { listenForNewJobs, WakeBell } from './wake';
import { ytDlpVersion } from './ytdlp';

/** How long in-flight jobs may run after SIGTERM before they are put back in the queue. */
const SHUTDOWN_GRACE_MS = 45_000;

function readConfig(): Config {
  try {
    return loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      for (const problem of err.problems) log.error('config_invalid', { problem });
      process.stderr.write(`\n${err.message}\n\nSee apps/worker/.env.example (or infra/vps/.env.example).\n`);
      process.exit(1);
    }
    throw err;
  }
}

async function loadCatalogWithRetry(catalog: CatalogStore): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await catalog.load();
      return;
    } catch (err) {
      if (attempt >= 5) {
        log.error('startup_failed', {
          reason: 'could not read the product catalog from Supabase; check SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and that the migrations ran',
          err,
        });
        process.exit(1);
      }
      log.warn('catalog_load_failed', { attempt, err });
      await sleep(attempt * 3000);
    }
  }
}

async function main(): Promise<void> {
  const config = readConfig();
  setLogLevel(config.logLevel);

  if (config.ytdlpCookies) {
    try {
      await access(config.ytdlpCookies, constants.R_OK);
    } catch {
      log.error('config_invalid', { problem: `YTDLP_COOKIES points to ${config.ytdlpCookies}, which does not exist or is not readable.` });
      process.exit(1);
    }
  }

  const db = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'mesa-worker' } },
  });
  const catalog = new CatalogStore(supabaseCatalogReader(db), log);
  const budget = new DailyAiBudget(supabaseUsageStore(db), { tokens: config.aiDailyTokenLimit, calls: config.aiDailyCallLimit }, log);
  await budget.load();
  const ai = new RecipeAI(
    new GoogleGenAI({ apiKey: config.geminiApiKey }),
    new ModelChain([config.geminiModel, ...config.geminiFallbackModels]),
    log,
    budget,
  );
  const deps: PipelineDeps = { config, db, ai, catalog };

  const models = await ai.checkModels();
  if (models.length === 0) {
    log.error('startup_failed', { reason: 'Gemini knows none of GEMINI_MODEL / GEMINI_FALLBACK_MODELS; pick current ones at https://ai.google.dev/gemini-api/docs/models' });
    process.exit(1);
  }

  const ytdlp = await ytDlpVersion({ path: config.ytdlpPath, cookies: null });
  if (ytdlp === null) log.warn('ytdlp_missing', { path: config.ytdlpPath, note: 'Instagram/TikTok imports will use captions only' });

  await loadCatalogWithRetry(catalog);
  catalog.startAutoRefresh();
  const mediaSweep = new MediaSweep(db, log);
  mediaSweep.start();

  const heartbeat = new Heartbeat(config.healthcheckUrl, log);
  const stopping = new AbortController(); // stop claiming new jobs
  const shutdown = new AbortController(); // abort jobs still running after the grace period
  const onSignal = (sig: NodeJS.Signals): void => {
    if (stopping.signal.aborted) {
      log.warn('shutdown_forced', { signal: sig });
      process.exit(1);
    }
    log.info('shutdown_requested', { signal: sig, grace_ms: SHUTDOWN_GRACE_MS });
    stopping.abort();
    setTimeout(() => shutdown.abort(), SHUTDOWN_GRACE_MS).unref();
  };
  process.on('SIGTERM', onSignal);
  process.on('SIGINT', onSignal);

  const bell = new WakeBell();
  const newJobs = listenForNewJobs(db, () => bell.ring(), log);
  const runner = jobRunner(deps);
  const lanes: Lane[] = [...Array<Lane>(config.concurrency).fill('any'), ...Array<Lane>(config.quickSlots).fill('quick')];

  log.info('worker_started', {
    models,
    concurrency: config.concurrency,
    quick_slots: config.quickSlots,
    poll_ms: config.pollIntervalMs,
    ytdlp,
    cookies: config.ytdlpCookies !== null,
    heartbeat: config.healthcheckUrl !== null,
    ai_daily_limits: { tokens: config.aiDailyTokenLimit, calls: config.aiDailyCallLimit },
    node: process.version,
  });

  await Promise.all(
    lanes.map((lane, i) => {
      const slotLog = log.child({ slot: i + 1, lane });
      slotLog.info('slot_started');
      return runSlot({
        claim: () => claimJob(db, lane),
        run: (job) => runJob(runner, job, slotLog, { shutdown: shutdown.signal }),
        bell,
        pollMs: config.pollIntervalMs,
        stopping: stopping.signal,
        log: slotLog,
        onClaimed: () => heartbeat.beat(),
        // The server's own work (no one asked: created_by null) leaves the model's per-minute limits to people.
        pauseAfter: (job) => (job.created_by === null ? config.serverJobGapMs : 0),
      });
    }),
  );
  await newJobs.close();
  catalog.stop();
  mediaSweep.stop();
  log.info('worker_stopped');
  process.exit(0);
}

process.on('unhandledRejection', (reason) => {
  log.error('unhandled_rejection', { err: reason });
});
process.on('uncaughtException', (err) => {
  log.error('uncaught_exception', { err, stack: err.stack });
  process.exit(1);
});

main().catch((err: unknown) => {
  log.error('fatal', { err, stack: err instanceof Error ? err.stack : undefined });
  process.exit(1);
});
