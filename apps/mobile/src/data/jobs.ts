// import_jobs rows, whatever they are (an import, a scan, something asked): whether one still works, and
// deleting one (cancel, dismiss: the worker then sends no push).
import type { ImportStatus } from '@mesa/shared';

import { must, supabase } from './supabase';

/** Queued or being worked on. */
export function isWorking(job: { status: ImportStatus } | null | undefined): boolean {
  return job?.status === 'queued' || job?.status === 'processing';
}

export async function deleteJob(id: string): Promise<void> {
  must(await supabase.from('import_jobs').delete().eq('id', id));
}
