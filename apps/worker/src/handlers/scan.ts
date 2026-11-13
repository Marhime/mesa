// Kitchen Sweep and Ticket In: the proposal is written (scan.ts); the person who scanned is told it is
// ready to review.
import type { ImportPlatform } from '@mesa/shared';
import type { ScanResult } from '../scan';
import type { Done, JobHandler, JobRun } from './types';

export type ReadScan = (r: JobRun, kind: 'sweep' | 'receipt') => Promise<ScanResult>;

export const scanDone = (scan: ScanResult): Done => ({
  columns: { proposal_id: scan.proposalId },
  platform: scan.platform,
  logged: { proposal: scan.proposalId, changes: scan.changes },
  ready: { push: scan.push, tell: 'always' },
});

export function scanHandler(kind: 'sweep' | 'receipt', read: ReadScan): JobHandler {
  return {
    platform: (): ImportPlatform => 'image',
    tellFailure: 'always',
    async run(r) {
      r.progress.stage(kind === 'sweep' ? 'watching' : 'reading');
      return scanDone(await read(r, kind));
    },
  };
}
