import type { ReactNode } from 'react';
import { View } from 'react-native';
import { CATEGORY_LABEL, type Category } from '@mesa/shared';

import { CategoryDot } from '../atoms/CategoryDot';
import { ListGroup } from '../molecules/ListGroup';
import { SectionHeader } from '../molecules/SectionHeader';
import { createStyles } from '../theme';
import { space, type RowInset } from '../tokens';

export interface AisleSectionProps {
  /** The aisle; omit with `title` for non-aisle groups ("In the cart · 3"). */
  category?: Category;
  title?: string;
  children: ReactNode;
  /** Where the rows' text starts (ListGroup `inset`): `icon` after a checkbox, `picto` after a food picto. */
  inset: RowInset;
}

/** Overline aisle label with its CategoryDot, then the rows in a ListGroup. */
export function AisleSection({ category, title, children, inset }: AisleSectionProps) {
  const styles = useStyles();
  const label = title ?? (category ? CATEGORY_LABEL[category] : '');
  return (
    <View style={styles.section}>
      <SectionHeader overline title={label} leading={category ? <CategoryDot category={category} /> : undefined} />
      <ListGroup inset={inset} accessibilityLabel={label}>
        {children}
      </ListGroup>
    </View>
  );
}

const useStyles = createStyles(() => ({
  section: { gap: space.sm },
}));
