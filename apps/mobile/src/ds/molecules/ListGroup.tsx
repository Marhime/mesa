import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';

import { Divider } from '../atoms/Divider';
import { createStyles } from '../theme';
import { radius } from '../tokens';

export interface ListGroupProps {
  children: ReactNode;
  /** Separator indent: `row` aligns with text, `leading` clears a checkbox or avatar. */
  inset?: 'none' | 'row' | 'leading';
  /** sunken: inside a sheet or a raised card. */
  tone?: 'raised' | 'sunken';
  accessibilityLabel?: string;
}

/** Raised container, radius lg, hairline separators between its rows. */
export function ListGroup({ children, inset = 'row', tone = 'raised', accessibilityLabel }: ListGroupProps) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <View style={[styles.group, tone === 'sunken' ? styles.sunken : null]} accessibilityLabel={accessibilityLabel} accessibilityRole="list">
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? <Divider inset={inset} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  group: { backgroundColor: t.colors.surfaceRaised, borderRadius: radius.lg, overflow: 'hidden' },
  sunken: { backgroundColor: t.colors.surfaceSunken },
}));
