// Reviewing a scan or a receipt: what is pre-ticked, amounts corrected before applying, and the inbox rows.
import type { Zone } from '@mesa/shared';
import { useCallback, useEffect, useState } from 'react';

import { usePictoLookup } from './catalog';
import { failsUntilTomorrow } from './errors';
import { notifyError, type Notify } from './notice';
import {
  lineDetail,
  proposalTitle,
  scanJobTitle,
  useApplyProposal,
  useDismissProposal,
  useProposalLines,
  useRemoveScan,
  useScanInbox,
  useStartScan,
  withAmount,
  type LineAmount,
  type ProposalLineView,
  type ScanKind,
} from './scans';

/** Review sheet groups, in order. */
export const PROPOSAL_GROUPS: { action: ProposalLineView['action']; label: string; note?: string }[] = [
  { action: 'bought', label: 'Bought' },
  { action: 'add', label: 'New in the pantry' },
  { action: 'update', label: 'Less left' },
  { action: 'out', label: 'Not seen', note: 'A video rarely shows everything: tick only what is really gone.' },
];

/** The review differs from what was proposed: other ticks than the suggested ones, or a corrected amount. */
export function reviewChanged(
  lines: readonly ProposalLineView[],
  selected: ReadonlySet<string>,
  amounts: ReadonlyMap<string, LineAmount>,
): boolean {
  const suggested = lines.filter((l) => l.suggested);
  if (selected.size !== suggested.length || suggested.some((l) => !selected.has(l.id))) return true;
  return lines.some((l) => {
    const a = amounts.get(l.id);
    return a !== undefined && (a.quantity !== l.quantity || (a.quantity !== null && a.unit !== l.unit));
  });
}

const toggled = (set: ReadonlySet<string>, key: string, on?: boolean): ReadonlySet<string> => {
  const next = new Set(set);
  if (on ?? !next.has(key)) next.add(key);
  else next.delete(key);
  return next;
};

/**
 * Everything a screen needs to offer scans: the inbox (working / failed / ready), the review sheet
 * (sure lines pre-ticked, amounts you can fix) and starting a new scan. `notify` shows outcomes (a toast).
 */
export function useScanReview(notify: Notify) {
  const inbox = useScanInbox();
  const start = useStartScan();
  const remove = useRemoveScan();
  const apply = useApplyProposal();
  const dismiss = useDismissProposal();
  const pictoFor = usePictoLookup();
  const [openId, setOpenId] = useState<string | null>(null);
  const lines = useProposalLines(openId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [amounts, setAmounts] = useState<ReadonlyMap<string, LineAmount>>(new Map());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  useEffect(() => {
    if (lines.data) setSelected(new Set(lines.data.filter((l) => l.suggested).map((l) => l.id)));
  }, [lines.data]);

  const openReview = useCallback((id: string | null) => {
    setOpenId(id);
    setAmounts(new Map());
    setEditingKey(null);
  }, []);

  const fail = (e: unknown) => notifyError(notify, e, "Couldn't do that. Try again.");
  const jobs = inbox.data?.jobs ?? [];
  const proposals = inbox.data?.proposals ?? [];
  const open = proposals.find((p) => p.id === openId);
  const close = () => openReview(null);
  const missed = open?.summary.missed ?? [];

  // The new job appears in the inbox as soon as it is queued: no toast needed for "started".
  const scan = (kind: ScanKind, zone?: Zone) => start.mutate({ kind, zone }, { onError: fail });
  const uploading = start.isPending && start.variables
    ? [{ key: 'uploading', title: start.variables.kind === 'sweep' ? 'Uploading your video…' : 'Uploading your photo…' }]
    : [];

  return {
    scan,
    scanning: start.isPending,
    /** Opens the review of one result (a notification tap, a toast). */
    openReview,
    inbox: {
      working: [...uploading, ...jobs.filter((j) => j.status !== 'failed').map((j) => ({ key: j.id, title: scanJobTitle(j) }))],
      failed: jobs
        .filter((j) => j.status === 'failed')
        .map((j) => ({
          key: j.id,
          title: scanJobTitle(j),
          text: j.error ?? 'Try again.',
          // After Mesa's daily limit another photo would fail the same way: only the × until tomorrow.
          again: failsUntilTomorrow(j.error_code)
            ? null
            : {
                label: j.kind === 'sweep' ? 'Film again' : 'Take another photo',
                onPress: () => {
                  remove.mutate(j.id);
                  scan(j.kind, j.zone ?? undefined);
                },
              },
          onDismiss: () => remove.mutate(j.id, { onError: fail }),
        })),
      ready: proposals.map((p) => ({ key: p.id, ...proposalTitle(p), onReview: () => openReview(p.id) })),
    },
    sheet: {
      visible: !!open,
      onClose: close,
      title: open ? proposalTitle(open).title : '',
      description:
        open?.kind === 'receipt'
          ? 'Ticked lines are put away with their amounts. Tap a line to fix one.'
          : 'Tick what is right, tap a line to fix its amount. Nothing changes until you apply.',
      loading: lines.isLoading,
      groups: PROPOSAL_GROUPS.map((g) => ({
        key: g.action,
        label: g.label,
        note: g.note,
        lines: (lines.data ?? [])
          .filter((l) => l.action === g.action)
          .map((raw) => {
            const l = withAmount(raw, amounts.get(raw.id));
            return {
              key: l.id,
              name: l.name,
              picto: pictoFor(l.product_id, l.category),
              detail: lineDetail(l),
              // "Not seen" lines have no amount to fix.
              amount: l.action === 'out' ? undefined : { quantity: l.quantity, unit: l.unit },
            };
          }),
      })).filter((g) => g.lines.length > 0),
      selected,
      onToggle: (key: string) => setSelected((prev) => toggled(prev, key)),
      editingKey,
      onEdit: setEditingKey,
      /** A fixed amount ticks its line: the person cares about it. */
      onAmount: (key: string, amount: LineAmount) => {
        setAmounts((prev) => new Map(prev).set(key, amount));
        setSelected((prev) => toggled(prev, key, true));
      },
      footnote:
        missed.length > 0
          ? `Not on the receipt: ${missed.map((m) => m.label.toLowerCase()).join(', ')}. ${missed.length === 1 ? 'It stays' : 'They stay'} on your list.`
          : undefined,
      onApply: () => {
        if (!open) return;
        apply.mutate(
          { proposalId: open.id, lineIds: [...selected], amounts },
          { onSuccess: (n) => notify(n > 0 ? `Pantry updated · ${n} ${n === 1 ? 'change' : 'changes'}` : 'All good'), onError: fail },
        );
        close();
      },
      onDismiss: () => {
        if (open) dismiss.mutate(open.id, { onError: fail });
        close();
      },
      applying: apply.isPending,
      // Nothing to lose while the lines load.
      unsaved: lines.data ? reviewChanged(lines.data, selected, amounts) : false,
    },
  };
}
