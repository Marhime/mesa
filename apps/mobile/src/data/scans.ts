// Kitchen Sweep and Ticket In: film a zone or photograph a receipt; the worker proposes pantry (and list)
// changes. The review (ticking, correcting amounts) lives in scanReview.ts.
import { capitalize, formatQuantity, type Category, type PantryLevel, type Unit, type Zone } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { dayLabel } from '../lib/days';
import { useHouseholdId } from './household';
import { deleteJob, isWorking } from './jobs';
import { SCANS_KEY } from './keys';
import { usePoll } from './liveStatus';
import { captureScan, uploadScan } from './media';
import { askForPushOnce } from './push';
import { refresh } from './refresh';
import { rpc } from './rpc';
import { must, supabase } from './supabase';

export { SCANS_KEY };
const POLL_MS = 3_000;

export type ScanKind = 'sweep' | 'receipt';

export interface ScanJobView {
  id: string;
  kind: ScanKind;
  zone: Zone | null;
  status: 'queued' | 'processing' | 'failed';
  error: string | null;
  /** Why it failed (the worker's code), for the way out. */
  error_code: string | null;
}

export interface ProposalView {
  id: string;
  kind: ScanKind;
  zone: Zone | null;
  summary: { store?: string | null; total_mxn?: number | null; missed?: { id: string; label: string }[]; confirmed?: number };
  lines: number;
}

/** Scans on their way (or failed) and proposals waiting for review. Polls while a scan is read and live sync is down. */
export function useScanInbox() {
  const householdId = useHouseholdId();
  const poll = usePoll(POLL_MS);
  return useQuery({
    queryKey: SCANS_KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<{ jobs: ScanJobView[]; proposals: ProposalView[] }> => {
      const [jobs, proposals] = await Promise.all([
        supabase
          .from('import_jobs')
          .select('id, kind, zone, status, error, error_code')
          .in('kind', ['sweep', 'receipt'])
          .neq('status', 'done')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('pantry_proposals')
          .select('id, kind, zone, summary, pantry_proposal_lines(count)')
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),
      ]);
      const rows = must(proposals) as unknown as (Omit<ProposalView, 'lines'> & { pantry_proposal_lines: { count: number }[] })[];
      return {
        jobs: must(jobs) as ScanJobView[],
        proposals: rows.map(({ pantry_proposal_lines, ...p }) => ({ ...p, lines: pantry_proposal_lines[0]?.count ?? 0 })),
      };
    },
    refetchInterval: (q) => (poll !== false && q.state.data?.jobs.some(isWorking) ? poll : false),
  });
}

/** Opens the camera, uploads, queues the scan. Resolves false when cancelled. */
export function useStartScan() {
  const qc = useQueryClient();
  const householdId = useHouseholdId();
  return useMutation({
    mutationFn: async ({ kind, zone }: { kind: ScanKind; zone?: Zone }): Promise<boolean> => {
      if (!householdId) throw new Error('No household');
      const media = await captureScan(kind);
      if (!media) return false;
      const path = await uploadScan(media, householdId);
      must(await supabase.from('import_jobs').insert({ kind, zone: kind === 'sweep' ? (zone ?? 'fridge') : null, input_image_path: path }));
      // The result comes later: the moment to offer a notification for it.
      askForPushOnce();
      return true;
    },
    onSettled: () => refresh(qc, 'scans'),
  });
}

/** Calls back once when a new scan result is waiting for review (toast + haptic outside Pantry). */
export function useScanReadyEvents(onReady: (proposal: ProposalView) => void): void {
  const inbox = useScanInbox();
  const known = useRef<Set<string> | null>(null);
  const callback = useRef(onReady);
  callback.current = onReady;
  useEffect(() => {
    const proposals = inbox.data?.proposals;
    if (!proposals) return;
    const before = known.current;
    known.current = new Set(proposals.map((p) => p.id));
    if (!before) return;
    for (const p of proposals) if (!before.has(p.id)) callback.current(p);
  }, [inbox.data]);
}

/** Forgets a failed scan. */
export function useRemoveScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteJob,
    onSettled: () => refresh(qc, 'scans'),
  });
}

export interface ProposalLineView {
  id: string;
  action: 'add' | 'update' | 'out' | 'bought';
  product_id: string | null;
  name: string;
  category: Category;
  quantity: number | null;
  unit: Unit | null;
  level: PantryLevel | null;
  expires_on: string | null;
  price_mxn: number | null;
  grocery_item_id: string | null;
  suggested: boolean;
}

/** An amount corrected in the review, sent with the apply. */
export interface LineAmount {
  quantity: number | null;
  unit: Unit | null;
}

type LineRow = Omit<ProposalLineView, 'name'> & { label: string };

const LEVEL_TEXT: Record<PantryLevel, string> = { full: 'Full', half: 'About half', low: 'Almost out', out: 'Out' };

/** "2 pcs · until Nov 12", "1 bunch · $18.00 · on your list", "Not seen · out?". */
export function lineDetail(l: Omit<ProposalLineView, 'id' | 'name' | 'category' | 'suggested' | 'product_id'>): string {
  const amount = l.quantity !== null ? formatQuantity(l.quantity, l.unit) : null;
  if (l.action === 'out') return 'Not seen · out?';
  if (l.action === 'bought') {
    if (l.quantity === 0) return 'Not bought';
    return [amount, l.price_mxn !== null ? `$${l.price_mxn.toFixed(2)}` : null, l.grocery_item_id ? 'on your list' : 'not on the list']
      .filter(Boolean)
      .join(' · ');
  }
  if (l.quantity === 0) return 'None left · out';
  return [amount, l.level && l.level !== 'full' ? LEVEL_TEXT[l.level] : null, l.expires_on ? `until ${dayLabel(l.expires_on)}` : null]
    .filter(Boolean)
    .join(' · ') || (l.action === 'add' ? 'New' : 'Still there');
}

/** A line with the amount the person typed (an amount replaces a rough level, as in apply_pantry_proposal). */
export function withAmount(l: ProposalLineView, amount: LineAmount | undefined): ProposalLineView {
  if (!amount) return l;
  return { ...l, quantity: amount.quantity, unit: amount.quantity === null ? null : amount.unit, level: amount.quantity === null ? l.level : 'full' };
}

/** The lines of one proposal, for the review sheet. */
export function useProposalLines(proposalId: string | null) {
  return useQuery({
    queryKey: [...SCANS_KEY, 'lines', proposalId],
    enabled: !!proposalId,
    queryFn: async (): Promise<ProposalLineView[]> => {
      const rows = must(
        await supabase
          .from('pantry_proposal_lines')
          .select('id, action, product_id, label, category, quantity, unit, level, expires_on, price_mxn, grocery_item_id, suggested')
          .eq('proposal_id', proposalId!)
          .order('position'),
      ) as LineRow[];
      return rows.map(({ label, ...l }) => ({
        ...l,
        name: capitalize(label),
        quantity: l.quantity === null ? null : Number(l.quantity),
        price_mxn: l.price_mxn === null ? null : Number(l.price_mxn),
      }));
    },
  });
}

/** Applies the ticked lines, with the amounts corrected for them. Resolves with how many changed something. */
export function useApplyProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, lineIds, amounts }: { proposalId: string; lineIds: string[]; amounts: ReadonlyMap<string, LineAmount> }) =>
      rpc('apply_pantry_proposal', {
        p_proposal_id: proposalId,
        p_line_ids: lineIds,
        p_edits: lineIds.flatMap((id) => {
          const a = amounts.get(id);
          return a ? [{ id, quantity: a.quantity, unit: a.unit }] : [];
        }),
      }),
    onSettled: () => refresh(qc, 'scans.applied'),
  });
}

export function useDismissProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => rpc('dismiss_pantry_proposal', { p_proposal_id: proposalId }),
    onSettled: () => refresh(qc, 'scans'),
  });
}

const ZONE_NAME: Record<Zone, string> = { fridge: 'fridge', freezer: 'freezer', cupboard: 'cupboard' };

/** "Fridge scan · 8 changes", "Soriana receipt · 12 things". */
export function proposalTitle(p: ProposalView): { title: string; subtitle: string } {
  if (p.kind === 'sweep') {
    const zone = ZONE_NAME[p.zone ?? 'fridge'];
    return { title: `${capitalize(zone)} scan ready`, subtitle: p.lines > 0 ? `${p.lines} ${p.lines === 1 ? 'thing' : 'things'} to check` : 'Everything matches' };
  }
  const missed = p.summary.missed?.length ?? 0;
  return {
    title: p.summary.store ? `${p.summary.store} receipt read` : 'Receipt read',
    subtitle: [`${p.lines} ${p.lines === 1 ? 'thing' : 'things'} to put away`, missed > 0 ? `${missed} not bought` : null].filter(Boolean).join(' · '),
  };
}

/** "Reading your fridge video…" */
export function scanJobTitle(j: ScanJobView): string {
  if (j.status === 'failed') return j.kind === 'sweep' ? "Couldn't read the scan" : "Couldn't read the receipt";
  return j.kind === 'sweep' ? `Looking through your ${ZONE_NAME[j.zone ?? 'fridge']}… usually under a minute` : 'Reading your receipt…';
}
