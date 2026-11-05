import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '../atoms/Text';
import { createStyles } from '../theme';
import { space } from '../tokens';

export interface FieldProps {
  label: string;
  hint?: string;
  /** Muted text at the end of the label row ("5 items"). */
  aside?: string;
  children: ReactNode;
  /** Label and control on one line (Stepper rows). */
  inline?: boolean;
}

/** A visible label above (or beside) a control. */
export function Field({ label, hint, aside, children, inline }: FieldProps) {
  const styles = useStyles();
  return (
    <View style={inline ? styles.inline : styles.stacked}>
      <View style={inline ? styles.inlineLabel : null}>
        <View style={styles.labelRow}>
          <Text variant="label" flex>
            {label}
          </Text>
          {aside ? (
            <Text variant="caption" color="inkMuted">
              {aside}
            </Text>
          ) : null}
        </View>
        {hint ? (
          <Text variant="caption" color="inkMuted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

const useStyles = createStyles(() => ({
  stacked: { gap: space.md },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  inline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  inlineLabel: { flex: 1 },
}));
