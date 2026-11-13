import { Children, isValidElement, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { Divider } from '../atoms/Divider';
import { enter, exit, reflow } from '../motion';
import { createStyles } from '../theme';
import { radius, type RowInset } from '../tokens';
import { ListToneContext, type ListTone } from './listTone';

export interface ListGroupProps {
  children: ReactNode;
  /** Separator indent, where the rows' text starts: `row` (text only), `icon` (after an icon or a checkbox), `picto`, `avatar`. */
  inset?: RowInset;
  /** sunken: inside a sheet or a raised card. Rows take their press highlight from it. */
  tone?: ListTone;
  accessibilityLabel?: string;
}

/**
 * Raised container, radius lg, hairline separators between its rows. Rows added or removed while it is on
 * screen fade in and out and their neighbours slide into place (the divider travels with its row); the rows it
 * opens with are just there.
 */
export function ListGroup({ children, inset = 'row', tone = 'raised', accessibilityLabel }: ListGroupProps) {
  const styles = useStyles();
  const rows = Children.toArray(children).filter(isValidElement);
  if (rows.length === 0) return null;
  return (
    <ListToneContext value={tone}>
      <View style={[styles.group, tone === 'sunken' ? styles.sunken : null]} accessibilityLabel={accessibilityLabel} accessibilityRole="list">
        <LayoutAnimationConfig skipEntering>
          {rows.map((row, i) => (
            <Animated.View key={row.key ?? i} entering={enter()} exiting={exit()} layout={reflow()}>
              {i > 0 ? <Divider inset={inset} /> : null}
              {row}
            </Animated.View>
          ))}
        </LayoutAnimationConfig>
      </View>
    </ListToneContext>
  );
}

const useStyles = createStyles((t) => ({
  group: { backgroundColor: t.colors.surfaceRaised, borderRadius: radius.lg, overflow: 'hidden' },
  sunken: { backgroundColor: t.colors.surfaceSunken },
}));
