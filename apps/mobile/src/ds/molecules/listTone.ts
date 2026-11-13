import { createContext, useContext } from 'react';

import { useTheme } from '../theme';

/** raised: a list on the screen · sunken: a list inside a sheet or a raised card. */
export type ListTone = 'raised' | 'sunken';

/** The background of the ListGroup a row sits in (set by ListGroup): rows take their press highlight from it. */
export const ListToneContext = createContext<ListTone>('raised');

/** Resting and pressed backgrounds of a row's `highlight` feedback, for the list it sits in. */
export function useRowHighlight(): { highlightFrom: string; highlightTo: string } {
  const { colors } = useTheme();
  return useContext(ListToneContext) === 'sunken'
    ? { highlightFrom: colors.surfaceSunken, highlightTo: colors.line }
    : { highlightFrom: colors.surfaceRaised, highlightTo: colors.surfaceSunken };
}
