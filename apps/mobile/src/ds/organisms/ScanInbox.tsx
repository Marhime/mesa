import { View } from 'react-native';

import { Banner } from '../molecules/Banner';
import { FieldButton } from '../molecules/FieldButton';
import { ProgressNote } from '../molecules/ProgressNote';
import { createStyles } from '../theme';
import { space } from '../tokens';

export interface ScanInboxProps {
  /** Scans being read ("Looking through your fridge…"). */
  working: { key: string; title: string }[];
  failed: { key: string; title: string; text: string; onDismiss: () => void }[];
  /** Proposals waiting for review. */
  ready: { key: string; title: string; subtitle: string; onReview: () => void }[];
}

/** Fridge scans and receipts on their way, and what's ready to review. Renders nothing when empty. */
export function ScanInbox({ working, failed, ready }: ScanInboxProps) {
  const styles = useStyles();
  if (working.length + failed.length + ready.length === 0) return null;
  return (
    <View style={styles.list}>
      {ready.map((r) => (
        <FieldButton key={r.key} icon="sparkle" title={r.title} subtitle={r.subtitle} action="Review" onPress={r.onReview} />
      ))}
      {working.map((w) => (
        <ProgressNote key={w.key} text={w.title} />
      ))}
      {failed.map((f) => (
        <Banner key={f.key} tone="danger" title={f.title} text={f.text} action={{ label: 'Dismiss', onPress: f.onDismiss }} />
      ))}
    </View>
  );
}

const useStyles = createStyles(() => ({
  list: { gap: space.md },
}));
