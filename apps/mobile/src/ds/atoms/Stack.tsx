import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import { layout, space, type SpaceToken } from '../tokens';

export interface StackProps {
  children: ReactNode;
  /** Vertical by default; `row` lays children out horizontally. */
  direction?: 'column' | 'row';
  gap?: SpaceToken;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
  /** Take the remaining space in the parent. */
  flex?: boolean;
  /** Vertical padding from the space scale (horizontal alignment is the Screen's job). */
  paddingY?: SpaceToken;
  /** Apply the 20 pt screen margin (inside full-bleed screens). */
  inset?: boolean;
  accessibilityLabel?: string;
  accessible?: boolean;
}

const ALIGN: Record<NonNullable<StackProps['align']>, ViewStyle['alignItems']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
};
const JUSTIFY: Record<NonNullable<StackProps['justify']>, ViewStyle['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
};

/** Layout primitive: spacing between children comes only from the space scale. */
export function Stack({
  children,
  direction = 'column',
  gap = 'md',
  align,
  justify,
  wrap,
  flex,
  paddingY,
  inset,
  accessibilityLabel,
  accessible,
}: StackProps) {
  const style: ViewStyle = {
    flexDirection: direction,
    gap: space[gap],
    alignItems: align ? ALIGN[align] : direction === 'row' ? 'center' : 'stretch',
    justifyContent: justify ? JUSTIFY[justify] : undefined,
    flexWrap: wrap ? 'wrap' : undefined,
    flex: flex ? 1 : undefined,
    flexShrink: direction === 'row' ? 1 : undefined,
    paddingVertical: paddingY ? space[paddingY] : undefined,
    paddingHorizontal: inset ? layout.screenMargin : undefined,
  };
  return (
    <View style={style} accessible={accessible} accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

/** Horizontal Stack. */
export function Inline(props: Omit<StackProps, 'direction'>) {
  return <Stack {...props} direction="row" gap={props.gap ?? 'sm'} />;
}
