import type { Picto } from '@mesa/shared';

import { Text } from '../atoms/Text';
import { AnimatedList } from '../molecules/AnimatedList';
import { AisleSection } from './AisleSection';
import { FoodRow } from './FoodRow';

export interface PantryListRow {
  key: string;
  name: string;
  picto: Picto;
  /** "6", "500 g", "Plenty", "Running low". */
  amount: string;
  /** Running low: the amount turns red. */
  low?: boolean;
  /** One more line, rarely ("In the freezer"). */
  detail?: string;
}

export interface PantryListProps {
  sections: { key: string; title: string; rows: PantryListRow[] }[];
  onOpen: (key: string) => void;
}

/**
 * What is at home, by type of food: "Vegetables · 4", then each food with how much is left on the right.
 * Foods and sections that come or go while it is on screen fade, and the rest slide into place.
 */
export function PantryList({ sections, onOpen }: PantryListProps) {
  return (
    <AnimatedList gap="xl">
      {sections.map((s) => (
        <AisleSection key={s.key} title={`${s.title} · ${s.rows.length}`} inset="picto">
          {s.rows.map((r) => (
            <FoodRow
              key={r.key}
              picto={r.picto}
              title={r.name}
              detail={r.detail}
              onPress={() => onOpen(r.key)}
              accessibilityLabel={[r.name, r.amount, r.detail].filter(Boolean).join(', ')}
              accessibilityHint="Change how much is left"
              trailing={
                <Text variant="label" color={r.low ? 'danger' : 'inkMuted'} tabular numberOfLines={1}>
                  {r.amount}
                </Text>
              }
            />
          ))}
        </AisleSection>
      ))}
    </AnimatedList>
  );
}
