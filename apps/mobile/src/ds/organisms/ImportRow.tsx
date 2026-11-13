import { View } from 'react-native';

import { Button } from '../atoms/Button';
import { Icon } from '../atoms/Icon';
import type { IconName } from '../atoms/icons';
import { Simmer } from '../atoms/Simmer';
import { Text } from '../atoms/Text';
import { DismissButton } from '../molecules/DismissButton';
import { StageProgress, type StageProgressProps } from '../molecules/StageProgress';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';
import { RecipeCover } from './RecipeCover';

export interface ImportRowAction {
  key: string;
  label: string;
  onPress: () => void;
  icon?: IconName;
  loading?: boolean;
}

export interface ImportRowProps {
  state: 'working' | 'ready' | 'failed';
  /** The dish when known, else what was shared ("Instagram post"); a scan's "Looking through your fridge…". */
  title: string;
  /** "Instagram · 2 min ago", "New in Recipes", or why it failed. */
  caption?: string;
  thumbnailUri?: string | null;
  /** What it is when there is no thumbnail (a scan: sparkle once read); a link by default, a dish once ready. */
  icon?: IconName;
  /** While working: the step and its bar. Without one, the simmer says it is working. */
  progress?: Omit<StageProgressProps, 'bare'> | null;
  /** When failed: the ways out, most useful first (the first one is the outlined button). */
  actions?: ImportRowAction[];
  /** When ready: opens the recipe (or the review). */
  onOpen?: () => void;
  openLabel?: string;
  /** Hides a ready or failed card (the × at its top right, like every card's): seen, or removed. */
  onDismiss?: () => void;
  /** What the × says to VoiceOver (default "Hide …"). */
  dismissLabel?: string;
}

/**
 * One thing on its way in, the same card for shares and scans: its progression while it works, a card to open
 * when it's ready, the ways out when it failed; the × hides it.
 */
export function ImportRow({
  state,
  title,
  caption,
  thumbnailUri,
  icon,
  progress,
  actions = [],
  onOpen,
  openLabel = 'Open',
  onDismiss,
  dismissLabel,
}: ImportRowProps) {
  const styles = useStyles();
  const failed = state === 'failed';
  const ready = state === 'ready';
  const working = state === 'working';

  const lead = thumbnailUri ? (
    <RecipeCover uri={thumbnailUri} shape="thumb" />
  ) : failed ? (
    <LeadIcon name="warning" danger />
  ) : working && !progress ? (
    <View style={styles.lead}>
      <Simmer size="sm" accessibilityLabel="Working" />
    </View>
  ) : icon ? (
    <LeadIcon name={icon} />
  ) : ready ? (
    <RecipeCover uri={null} shape="thumb" />
  ) : (
    <LeadIcon name="link" />
  );

  return (
    <View style={[styles.card, failed ? styles.failed : null]} accessibilityLiveRegion="polite">
      <View style={styles.row}>
        {lead}
        <View style={styles.text}>
          <Text variant="label" numberOfLines={2}>
            {title}
          </Text>
          {caption ? (
            <Text variant="caption" color={failed ? 'ink' : 'inkMuted'} numberOfLines={failed ? 4 : 1}>
              {caption}
            </Text>
          ) : null}
        </View>
        {onDismiss && !working ? <DismissButton label={dismissLabel ?? `Hide ${title}`} onPress={onDismiss} /> : null}
      </View>
      {working && progress ? <StageProgress {...progress} bare /> : null}
      {ready && onOpen ? (
        <Button label={openLabel} variant="secondary" fullWidth accessibilityLabel={`${openLabel}: ${title}`} onPress={onOpen} />
      ) : null}
      {failed && actions.length > 0 ? (
        <View style={styles.actions}>
          {actions.map((a, i) => (
            <Button
              key={a.key}
              label={a.label}
              iconStart={a.icon}
              // The best way out first, full width; the others quieter under it.
              variant={i === 0 ? 'secondary' : 'ghost'}
              fullWidth
              loading={a.loading}
              onPress={a.onPress}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function LeadIcon({ name, danger }: { name: IconName; danger?: boolean }) {
  const styles = useStyles();
  return (
    <View style={styles.lead}>
      <Icon name={name} color={danger ? 'danger' : 'inkMuted'} />
    </View>
  );
}

const useStyles = createStyles((t) => ({
  card: { backgroundColor: t.colors.surfaceRaised, borderRadius: radius.lg, padding: space.lg, gap: space.md },
  failed: { backgroundColor: t.colors.dangerSoft },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  lead: { width: size.thumb, alignItems: 'center' },
  text: { flex: 1, gap: space.xs },
  actions: { gap: space.xs },
}));
