import { AnimatedList } from '../molecules/AnimatedList';
import { ImportRow } from './ImportRow';

export interface ScanInboxProps {
  /** Scans uploading or being read ("Looking through your fridge…"). */
  working: { key: string; title: string }[];
  /** Scans that couldn't be read, with a way to try again ("Film again"; null when it can't work today) and to forget them. */
  failed: { key: string; title: string; text: string; again: { label: string; onPress: () => void } | null; onDismiss: () => void }[];
  /** Proposals waiting for review. */
  ready: { key: string; title: string; subtitle: string; onReview: () => void }[];
}

/**
 * Fridge scans and receipts on their way, and what's ready to review: the same cards as your shares
 * (ImportRow), coming and going smoothly. Renders nothing when empty.
 */
export function ScanInbox({ working, failed, ready }: ScanInboxProps) {
  if (working.length + failed.length + ready.length === 0) return null;
  return (
    <AnimatedList gap="md">
      {ready.map((r) => (
        <ImportRow key={r.key} state="ready" icon="sparkle" title={r.title} caption={r.subtitle} openLabel="Review" onOpen={r.onReview} />
      ))}
      {working.map((w) => (
        <ImportRow key={w.key} state="working" title={w.title} />
      ))}
      {failed.map((f) => (
        <ImportRow
          key={f.key}
          state="failed"
          title={f.title}
          caption={f.text}
          actions={f.again ? [{ key: 'again', ...f.again }] : []}
          onDismiss={f.onDismiss}
          dismissLabel={`Remove ${f.title}`}
        />
      ))}
    </AnimatedList>
  );
}
