// "Done shopping": where each item in the cart goes and how long it keeps (the Put away sheet).
import { capitalize, type Category, type Zone } from '@mesa/shared';
import { useCallback, useMemo, useState } from 'react';

import { dayLabel, daysUntil, isoInDays } from '../lib/days';
import { useCatalog } from './catalog';
import { lineQuantity, resolveId, type GroceryLine } from './groceries';
import type { PutAwayChoice } from './rpc';

export const KEEPS_OPTIONS: { days: number | null; label: string }[] = [
  { days: 2, label: '2 days' },
  { days: 4, label: '4 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
  { days: 30, label: '1 month' },
  { days: null, label: 'No date' },
];

export interface PutAwayLine {
  key: string;
  id: string;
  name: string;
  category: Category;
  quantity: string;
  zone: Zone;
  keepsDays: number | null;
  expiryLabel: string | null;
}

interface Choice {
  zone?: Zone;
  keepsDays?: number | null;
}

/** Where food of a category goes by default (mirrors public.default_zone_for, for lines without a product). */
function defaultZoneFor(category: Category): Zone {
  if (category === 'produce' || category === 'meat' || category === 'dairy') return 'fridge';
  return category === 'frozen' ? 'freezer' : 'cupboard';
}

/** Days from today to a "YYYY-MM-DD" date, for the Keeps chips (null when there is no date). */
export function keepsDaysFrom(iso: string | null): number | null {
  return iso === null ? null : Math.max(0, daysUntil(iso));
}

/**
 * The cart as put-away lines: the product's default zone and shelf life, then the person's changes.
 * Frozen food keeps (no date) unless a date is picked. Things the catalog doesn't know go by their
 * aisle's zone, without a date (they become household products when put away).
 */
export function usePutAway(cart: GroceryLine[]) {
  const { data: catalog } = useCatalog();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const products = useMemo(() => new Map((catalog?.products ?? []).map((p) => [p.id, p])), [catalog]);

  const items = useMemo<PutAwayLine[]>(
    () =>
      cart.flatMap((line) => {
        const product = line.product_id ? products.get(line.product_id) : undefined;
        const choice = choices[line.key] ?? {};
        const zone = choice.zone ?? product?.default_zone ?? defaultZoneFor(line.category);
        const keepsDays =
          choice.keepsDays !== undefined ? choice.keepsDays : zone === 'freezer' ? null : (product?.shelf_life_days ?? null);
        return [
          {
            key: line.key,
            id: resolveId(line.id),
            name: capitalize(line.label),
            category: product?.category ?? line.category,
            quantity: lineQuantity(line),
            zone,
            keepsDays,
            expiryLabel: keepsDays === null ? null : dayLabel(isoInDays(keepsDays)),
          },
        ];
      }),
    [cart, products, choices],
  );

  const change = useCallback((key: string, next: Choice) => setChoices((prev) => ({ ...prev, [key]: { ...prev[key], ...next } })), []);
  const reset = useCallback(() => setChoices({}), []);
  const payload = useCallback(
    (): PutAwayChoice[] => items.map((i) => ({ id: i.id, zone: i.zone, expires_on: i.keepsDays === null ? null : isoInDays(i.keepsDays) })),
    [items],
  );

  return { items, change, reset, payload };
}
