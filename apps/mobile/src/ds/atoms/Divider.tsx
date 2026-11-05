import { View } from 'react-native';

import { createStyles } from '../theme';
import { border, space } from '../tokens';

export interface DividerProps {
  /** Indent from the leading edge (aligns with row text). */
  inset?: 'none' | 'row' | 'leading';
}

/** Hairline separator inside lists. */
export function Divider({ inset = 'none' }: DividerProps) {
  const styles = useStyles();
  return <View style={[styles.line, inset === 'row' ? styles.row : inset === 'leading' ? styles.leading : null]} />;
}

const useStyles = createStyles((t) => ({
  line: { height: border.hairline, backgroundColor: t.colors.line, alignSelf: 'stretch' },
  row: { marginLeft: space.lg },
  leading: { marginLeft: space.huge + space.sm },
}));
