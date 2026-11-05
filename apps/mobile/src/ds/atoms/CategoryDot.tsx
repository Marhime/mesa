import { View } from 'react-native';
import type { Category } from '@mesa/shared';

import { categoryColor, createStyles, useTheme } from '../theme';
import { border, radius, size } from '../tokens';

export interface CategoryDotProps {
  category: Category;
}

/** Small pastel dot naming a food category. Decorative: the aisle label carries the meaning. */
export function CategoryDot({ category }: CategoryDotProps) {
  const theme = useTheme();
  const styles = useStyles();
  return <View style={[styles.dot, { backgroundColor: categoryColor(theme, category) }]} />;
}

const useStyles = createStyles((t) => ({
  dot: {
    width: size.dot,
    height: size.dot,
    borderRadius: radius.full,
    borderWidth: border.hairline,
    borderColor: t.colors.line,
  },
}));
