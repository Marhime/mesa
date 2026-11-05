import { View } from 'react-native';

import { Button } from '../atoms/Button';
import { Equalizer } from '../atoms/Equalizer';
import { Icon } from '../atoms/Icon';
import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { iconSize, radius, space } from '../tokens';

export interface ImportRowProps {
  /** Where it comes from: "YouTube", "bonappetit.com", "Screenshot". */
  source: string;
  status: 'queued' | 'processing' | 'failed';
  error?: string | null;
  onRetry?: () => void;
  onRemove?: () => void;
  retrying?: boolean;
}

/** A recipe being imported: Equalizer while it works; the error, Retry and Remove when it failed. */
export function ImportRow({ source, status, error, onRetry, onRemove, retrying }: ImportRowProps) {
  const styles = useStyles();
  const failed = status === 'failed';
  return (
    <View style={[styles.card, failed ? styles.failed : null]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        <View style={styles.lead}>
          {failed ? <Icon name="warning" color="danger" /> : <Equalizer size="sm" accessibilityLabel="Preparing" />}
        </View>
        <View style={styles.text}>
          <Text variant="label" numberOfLines={1}>
            {failed ? "Couldn't import this recipe" : status === 'queued' ? 'Waiting to import' : 'Preparing your recipe'}
          </Text>
          <Text variant="caption" color="inkMuted" numberOfLines={failed ? 3 : 1}>
            {failed && error ? `${source} · ${error}` : source}
          </Text>
        </View>
      </View>
      {failed ? (
        <View style={styles.actions}>
          {onRemove ? <Button label="Remove" variant="ghost" onPress={onRemove} /> : null}
          {onRetry ? <Button label="Retry" variant="secondary" iconStart="retry" onPress={onRetry} loading={retrying} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  card: { backgroundColor: t.colors.surfaceRaised, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  failed: { backgroundColor: t.colors.dangerSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lead: { minWidth: iconSize.lg, alignItems: 'center' },
  text: { flex: 1, gap: space.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.sm },
}));
