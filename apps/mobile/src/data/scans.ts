// Kitchen Sweep and Ticket In: film a zone or photograph a receipt; the worker proposes pantry (and list)
// changes; the household reviews and applies them.
import { capitalize, formatQuantity, type Category, type PantryLevel, type Unit, type Zone } from '@mesa/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { dayLabel } from '../lib/days';
import { friendlyError } from './errors';
import { GROCERIES_KEY } from './groceries';
import { useHouseholdId } from './household';
import { refreshPantryViews } from './keys';
import { captureScan, uploadScan } from './media';
import { rpc } from './rpc';
import { must, supabase } from './supabase';

export const SCANS_KEY = ['scans'] as const;
const POLL_MS = 3_000;

export type ScanKind = 'sweep' | 'receipt';

export interface ScanJobView {
  id: string;
  kind: ScanKind;
  zone: Zone | null;
  status: 'queued' | 'processing' | 'failed';
  error: string | null;
}

export interface ProposalView {
  id: string;
  kind: ScanKind;
  zone: Zone | null;
  summary: { store?: string | null; total_mxn?: number | null; missed?: { id: string; label: string }[]; confirmed?: number };
  lines: number;
}

/** Scans on their way (or failed) and proposals waiting for review. Polls while a scan is being read. */
export function useScanInbox() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: SCANS_KEY,
    enabled: !!householdId,
    queryFn: async (): Promise<{ jobs: ScanJobView[]; proposals: ProposalView[] }> => {
      const [jobs, proposals] = await Promise.all([
        supabase
          .from('import_jobs')
          .select('id, kind, zone, status, error')
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
    refetchInterval: (q) => (q.state.data?.jobs.some((j) => j.status !== 'failed') ? POLL_MS : false),
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
      return true;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
}

/** Forgets a failed scan. */
export function useRemoveScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (jobId: string) => {
      must(await supabase.from('import_jobs').delete().eq('id', jobId));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
}

export interface ProposalLineView {
  id: string;
  action: 'add' | 'update' | 'out' | 'bought';
  name: string;
  category: Category;
  detail: string;
  suggested: boolean;
}

type LineRow = {
  id: string;
  action: ProposalLineView['action'];
  label: string;
  category: Category;
  quantity: number | null;
  unit: Unit | null;
  level: PantryLevel | null;
  expires_on: string | null;
  price_mxn: number | null;
  grocery_item_id: string | null;
  suggested: boolean;
};

const LEVEL_TEXT: Record<PantryLevel, string> = { full: 'Full', half: 'About half', low: 'Almost out', out: 'Out' };

function lineDetail(l: LineRow): string {
  const amount = l.quantity !== null ? formatQuantity(Number(l.quantity), l.unit) : null;
  if (l.action === 'out') return 'Not seen · out?';
  if (l.action === 'bought') {
    return [amount, l.price_mxn !== null ? `$${Number(l.price_mxn).toFixed(2)}` : null, l.grocery_item_id ? 'on your list' : 'not on the list']
      .filter(Boolean)
      .join(' · ');
  }
  return [amount, l.level && l.level !== 'full' ? LEVEL_TEXT[l.level] : null, l.expires_on ? `until ${dayLabel(l.expires_on)}` : null]
    .filter(Boolean)
    .join(' · ') || (l.action === 'add' ? 'New' : 'Still there');
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
          .select('id, action, label, category, quantity, unit, level, expires_on, price_mxn, grocery_item_id, suggested')
          .eq('proposal_id', proposalId!)
          .order('position'),
      ) as LineRow[];
      return rows.map((l) => ({ id: l.id, action: l.action, name: capitalize(l.label), category: l.category, detail: lineDetail(l), suggested: l.suggested }));
    },
  });
}

export function useApplyProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, lineIds }: { proposalId: string; lineIds: string[] }) =>
      rpc('apply_pantry_proposal', { p_proposal_id: proposalId, p_line_ids: lineIds }),
    onSettled: () => {
      refreshPantryViews(qc);
      void qc.invalidateQueries({ queryKey: GROCERIES_KEY });
      void qc.invalidateQueries({ queryKey: SCANS_KEY });
    },
  });
}

export function useDismissProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (proposalId: string) => rpc('dismiss_pantry_proposal', { p_proposal_id: proposalId }),
    onSettled: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
}

const ZONE_NAME: Record<Zone, string> = { fridge: 'fridge', freezer: 'freezer', cupboard: 'cupboard' };

/** "Fridge scan · 8 changes", "Soriana receipt · 12 things". */
export function proposalTitle(p: ProposalView): { title: string; subtitle: string } {
  if (p.kind === 'sweep') {
    const zone = ZONE_NAME[p.zone ?? 'fridge'];
    return { title: `${capitalize(zone)} scan ready`, subtitle: p.lines > 0 ? `${p.lines} ${p.lines === 1 ? 'change' : 'changes'} to check` : 'Everything matches' };
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
  return j.kind === 'sweep' ? `Looking through your ${ZONE_NAME[j.zone ?? 'fridge']}…` : 'Reading your receipt…';
}

/** Review sheet groups, in order. */
export const PROPOSAL_GROUPS: { action: ProposalLineView['action']; label: string; note?: string }[] = [
  { action: 'bought', label: 'Bought' },
  { action: 'add', label: 'New in the pantry' },
  { action: 'update', label: 'Less left' },
  { action: 'out', label: 'Not seen', note: 'A video rarely shows everything: tick only what is really gone.' },
];

/**
 * Everything a screen needs to offer scans: the inbox (working / failed / ready), the review sheet
 * (sure lines pre-ticked) and starting a new scan. `notify` shows outcomes (a toast).
 */
export function useScanReview(notify: (message: string) => void) {
  const inbox = useScanInbox();
  const start = useStartScan();
  const remove = useRemoveScan();
  const apply = useApplyProposal();
  const dismiss = useDismissProposal();
  const [openId, setOpenId] = useState<string | null>(null);
  const lines = useProposalLines(openId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (lines.data) setSelected(new Set(lines.data.filter((l) => l.suggested).map((l) => l.id)));
  }, [lines.data]);

  const fail = (e: unknown) => notify(friendlyError(e, "Couldn't do that. Try again."));
  const jobs = inbox.data?.jobs ?? [];
  const proposals = inbox.data?.proposals ?? [];
  const open = proposals.find((p) => p.id === openId);
  const close = () => setOpenId(null);
  const missed = open?.summary.missed ?? [];

  return {
    scan: (kind: ScanKind, zone?: Zone) =>
      start.mutate(
        { kind, zone },
        { onSuccess: (started) => started && notify(kind === 'sweep' ? 'Got it. Mesa is looking.' : 'Got it. Reading the receipt.'), onError: fail },
      ),
    scanning: start.isPending,
    inbox: {
      working: jobs.filter((j) => j.status !== 'failed').map((j) => ({ key: j.id, title: scanJobTitle(j) })),
      failed: jobs
        .filter((j) => j.status === 'failed')
        .map((j) => ({ key: j.id, title: scanJobTitle(j), text: j.error ?? 'Try again.', onDismiss: () => remove.mutate(j.id, { onError: fail }) })),
      ready: proposals.map((p) => ({ key: p.id, ...proposalTitle(p), onReview: () => setOpenId(p.id) })),
    },
    sheet: {
      visible: !!open,
      onClose: close,
      title: open ? proposalTitle(open).title : '',
      description: open?.kind === 'receipt' ? 'Ticked lines are put away with their real amounts.' : 'Tick what is right. Nothing changes until you apply.',
      loading: lines.isLoading,
      groups: PROPOSAL_GROUPS.map((g) => ({
        key: g.action,
        label: g.label,
        note: g.note,
        lines: (lines.data ?? []).filter((l) => l.action === g.action).map((l) => ({ key: l.id, name: l.name, category: l.category, detail: l.detail })),
      })).filter((g) => g.lines.length > 0),
      selected,
      onToggle: (key: string) =>
        setSelected((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        }),
      footnote:
        missed.length > 0
          ? `Not on the receipt: ${missed.map((m) => m.label.toLowerCase()).join(', ')}. ${missed.length === 1 ? 'It stays' : 'They stay'} on your list.`
          : undefined,
      onApply: () => {
        if (!open) return;
        apply.mutate(
          { proposalId: open.id, lineIds: [...selected] },
          { onSuccess: (n) => notify(n > 0 ? `Pantry updated · ${n} ${n === 1 ? 'change' : 'changes'}` : 'All good'), onError: fail },
        );
        close();
      },
      onDismiss: () => {
        if (open) dismiss.mutate(open.id, { onError: fail });
        close();
      },
      applying: apply.isPending,
    },
  };
}
