// Prints the SQL that makes public.job_kinds match JOB_KINDS (src/job-kinds.ts): one upsert, safe to run
// again. Migrations already applied never change: paste it into a NEW migration with the new kind.
// Run: pnpm -s --filter @mesa/shared gen:job-kinds
import { fileURLToPath } from 'node:url';
import { IMPORT_KINDS, jobKind, type ImportKind } from '../src/job-kinds';

/** The columns of public.job_kinds, as the registry says them. */
export interface JobKindRow {
  kind: ImportKind;
  lane: string;
  counts_toward_quota: boolean;
  expires_in_queue: boolean;
}

export const jobKindRows = (): JobKindRow[] =>
  IMPORT_KINDS.map((kind) => {
    const k = jobKind(kind);
    return { kind, lane: k.lane, counts_toward_quota: k.countsTowardQuota, expires_in_queue: k.expiresInQueue };
  });

export function jobKindsSql(): string {
  const values = jobKindRows().map((r) => `  ('${r.kind}', '${r.lane}', ${r.counts_toward_quota}, ${r.expires_in_queue})`);
  return `insert into public.job_kinds (kind, lane, counts_toward_quota, expires_in_queue) values
${values.join(',\n')}
on conflict (kind) do update set
  lane = excluded.lane,
  counts_toward_quota = excluded.counts_toward_quota,
  expires_in_queue = excluded.expires_in_queue;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.stdout.write(jobKindsSql());
