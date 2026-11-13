// What people showed Mesa doesn't stay: every 15 minutes (and once at startup) the worker removes the media
// the database lists (shared_media_to_delete, migration 28): in 'scans', what a finished job used and
// anything a day old; in 'recipe-images', every file a day old that is no recipe's picture (the screenshots
// shared before private media). A failed listing is logged and tried again next time.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Logger } from './log';

export const SWEEP_EVERY_MS = 15 * 60_000;
/** Rows asked for per call. */
const PAGE = 200;
/** Files removed per storage call. */
const BATCH = 100;
/** Calls per sweep: a big backlog goes over a few sweeps, and a file that won't go can't loop forever. */
const MAX_PAGES = 5;

interface MediaRow {
  bucket: string;
  path: string;
}

export interface SweepCounts {
  listed: number;
  removed: number;
}

export class MediaSweep {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly db: Pick<SupabaseClient, 'rpc' | 'storage'>,
    private readonly log: Logger,
  ) {}

  /** Sweeps now, then every `everyMs`; a sweep still running when the next is due is not doubled. */
  start(everyMs = SWEEP_EVERY_MS): void {
    this.stop();
    const tick = (): void => void this.sweep().catch((err: unknown) => this.log.warn('media_sweep_failed', { err }));
    tick();
    this.timer = setInterval(tick, everyMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One sweep: lists and removes until the list is short, or MAX_PAGES calls. */
  async sweep(): Promise<SweepCounts> {
    const counts: SweepCounts = { listed: 0, removed: 0 };
    if (this.running) return counts;
    this.running = true;
    try {
      for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await this.list();
        if (rows === null) break;
        counts.listed += rows.length;
        const removed = await this.remove(rows);
        counts.removed += removed;
        // A short page is the end; a page where nothing went would only come back the same.
        if (rows.length < PAGE || removed === 0) break;
      }
      if (counts.listed > 0) this.log.info('media_swept', { ...counts });
      return counts;
    } finally {
      this.running = false;
    }
  }

  /** The rows to remove; null when there is nothing to do this time (no function yet, or a failure). */
  private async list(): Promise<MediaRow[] | null> {
    const { data, error } = await this.db.rpc('shared_media_to_delete', { p_limit: PAGE });
    if (error) {
      this.log.warn('media_sweep_failed', { err: error.message });
      return null;
    }
    return ((data ?? []) as MediaRow[]).filter((r) => typeof r.bucket === 'string' && typeof r.path === 'string' && r.path !== '');
  }

  /** Removes the files, bucket by bucket, BATCH at a time; returns how many went. */
  private async remove(rows: readonly MediaRow[]): Promise<number> {
    const byBucket = new Map<string, string[]>();
    for (const r of rows) byBucket.set(r.bucket, [...(byBucket.get(r.bucket) ?? []), r.path]);
    let removed = 0;
    for (const [bucket, paths] of byBucket) {
      for (let i = 0; i < paths.length; i += BATCH) {
        const { data, error } = await this.db.storage.from(bucket).remove(paths.slice(i, i + BATCH));
        if (error) this.log.warn('media_remove_failed', { bucket, files: Math.min(BATCH, paths.length - i), err: error.message });
        else removed += data?.length ?? 0;
      }
    }
    return removed;
  }
}
