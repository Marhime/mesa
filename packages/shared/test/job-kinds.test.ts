// The job kinds registry: sane on its own, and the same rows as the database's job_kinds table (as the
// migrations leave it: db-tests/schema.sql, written by db-tests/run.sh).
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { jobKindRows, jobKindsSql } from '../scripts/gen-job-kinds';
import { IMPORT_KINDS, isErrorCode, isImportKind, JOB_KINDS, JOB_LANES, jobKind, MESSAGES } from '../src/index';

const SCHEMA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../db-tests/schema.sql');

/** The job_kinds rows pg_dump wrote (--column-inserts). */
function sqlRows(): unknown[] {
  const insert = /^INSERT INTO public\.job_kinds \(kind, lane, counts_toward_quota, expires_in_queue\) VALUES \('([a-z_]+)', '([a-z]+)', (true|false), (true|false)\);$/gm;
  return [...readFileSync(SCHEMA, 'utf8').matchAll(insert)].map(([, kind, lane, quota, expires]) => ({
    kind,
    lane,
    counts_toward_quota: quota === 'true',
    expires_in_queue: expires === 'true',
  }));
}

describe('JOB_KINDS', () => {
  it('is the job_kinds table of the latest schema (run the db tests after a migration)', () => {
    const byKind = (a: { kind: string }, b: { kind: string }) => a.kind.localeCompare(b.kind);
    expect(sqlRows().sort(byKind as never)).toEqual(jobKindRows().sort(byKind));
  });

  it('prints the upsert a migration carries (the registry as it is now)', () => {
    const dir = resolve(dirname(SCHEMA), '../supabase/migrations');
    const carrying = readdirSync(dir).filter((f) => readFileSync(resolve(dir, f), 'utf8').includes(jobKindsSql()));
    expect(carrying.length).toBeGreaterThan(0);
  });

  it('leaves background work out of the quota and the expiry, and never pushes it', () => {
    for (const kind of IMPORT_KINDS) {
      const k = jobKind(kind);
      expect(JOB_LANES).toContain(k.lane);
      if (k.lane === 'background') expect([k.countsTowardQuota, k.expiresInQueue, k.readyTitle]).toEqual([false, false, null]);
      else expect(k.readyTitle).not.toBeNull();
    }
    expect(IMPORT_KINDS.filter((k) => jobKind(k).lane === 'background')).toEqual(['tidy', 'follow_check', 'for_you']);
    expect(IMPORT_KINDS.filter((k) => jobKind(k).lane === 'quick')).toEqual(['ask', 'reread']);
  });

  it('names failures the app knows', () => {
    for (const kind of IMPORT_KINDS) {
      const k = jobKind(kind);
      expect(isErrorCode(k.failure)).toBe(true);
      if (k.keeps !== 'every') for (const code of k.keeps) expect(MESSAGES[code]).toBeTruthy();
      expect(k.failureTitle.length).toBeGreaterThan(0);
    }
    expect(JOB_KINDS.creator.keeps).toEqual(['creatorUnsupported', 'creatorNotFound']);
  });

  it('knows its kinds, and adapt is gone', () => {
    expect(isImportKind('reread')).toBe(true);
    expect(isImportKind('adapt')).toBe(false);
    expect(isImportKind('toString')).toBe(false);
    expect(isErrorCode('aiBusy')).toBe(true);
    expect(isErrorCode('Something went wrong reading this recipe.')).toBe(false);
  });
});
