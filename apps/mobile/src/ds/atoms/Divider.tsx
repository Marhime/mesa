import { View } from 'react-native';

import { createStyles } from '../theme';
import { border, rowInset, type RowInset } from '../tokens';

export interface DividerProps {
  /** Indent from the leading edge: where the rows' text starts (`rowInset`). */
  inset?: RowInset;
}

/** Hairline separator inside lists. */
export function Divider({ inset = 'none' }: DividerProps) {
  const styles = useStyles();
  return <View style={[styles.line, { marginLeft: rowInset[inset] }]} />;
}

const useStyles = createStyles((t) => ({
  line: { height: border.hairline, backgroundColor: t.colors.line, alignSelf: 'stretch' },
}));
