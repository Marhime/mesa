// Mesa import worker: polls import_jobs, turns shared links/images/text into recipes.
import { access, constants } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { CatalogStore } from './catalog-store';
import { ConfigError, loadConfig, type Config } from './config';
import { RecipeAI } from './gemini';
import { claimJob, processJob } from './jobs';
import { log, setLogLevel } from './log';
import { ModelChain } from './model-chain';
import type { PipelineDeps } from './pipeline';
import { sleep } from './retry';
import { ytDlpVersion } from './ytdlp';

/** How long in-flight jobs may run after SIGTERM before they are put back in the queue. */
const SHUTDOWN_GRACE_MS = 45_000;
const MAX_CLAIM_BACKOFF_MS = 60_000;

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
  const catalog = new CatalogStore(db, log);
  const ai = new RecipeAI(new GoogleGenAI({ apiKey: config.geminiApiKey }), new ModelChain([config.geminiModel, ...config.geminiFallbackModels]), log);
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

  log.info('worker_started', {
    models,
    concurrency: config.concurrency,
    poll_ms: config.pollIntervalMs,
    ytdlp,
    cookies: config.ytdlpCookies !== null,
    node: process.version,
  });

  const slot = async (n: number): Promise<void> => {
    const slotLog = log.child({ slot: n });
    let backoff = config.pollIntervalMs;
    while (!stopping.signal.aborted) {
      let job;
      try {
        job = await claimJob(db);
        backoff = config.pollIntervalMs;
      } catch (err) {
        slotLog.error('claim_failed', { err, retry_ms: backoff });
        await sleep(backoff, stopping.signal).catch(() => undefined);
        backoff = Math.min(backoff * 2, MAX_CLAIM_BACKOFF_MS);
        continue;
      }
      if (!job) {
        await sleep(config.pollIntervalMs, stopping.signal).catch(() => undefined);
        continue;
      }
      try {
        await processJob(deps, job, slotLog, { shutdown: shutdown.signal });
      } catch (err) {
        slotLog.error('process_crashed', { job: job.id, err, stack: err instanceof Error ? err.stack : undefined });
      }
    }
  };

  await Promise.all(Array.from({ length: config.concurrency }, (_, i) => slot(i + 1)));
  catalog.stop();
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
