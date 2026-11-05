import { buildCatalogIndex, type CatalogIndex, type Product, type ProductAlias } from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useHouseholdId } from './household';
import { DAY, WEEK } from './queryClient';
import { must, supabase } from './supabase';

const PAGE = 1000; // PostgREST caps responses at 1000 rows

async function fetchAll<T>(table: 'products' | 'product_aliases', columns: string, orderBy: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const page = must(await supabase.from(table).select(columns).order(orderBy).range(from, from + PAGE - 1)) as T[];
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}

export interface Catalog {
  products: Product[];
  aliases: ProductAlias[];
}

/** Products + aliases (shared catalog and the household's own), loaded once and kept 24 h. */
export function useCatalog() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: ['catalog', householdId],
    enabled: !!householdId,
    staleTime: DAY,
    gcTime: WEEK,
    queryFn: async (): Promise<Catalog> => {
      const [products, aliases] = await Promise.all([
        fetchAll<Product>('products', 'id, household_id, name_en, category, default_zone, shelf_life_days, is_staple, unit_family', 'id'),
        fetchAll<ProductAlias>('product_aliases', 'product_id, alias, lang', 'id'),
      ]);
      return { products, aliases };
    },
  });
}

/** The matching index, rebuilt only when the catalog changes. Null while loading. */
export function useCatalogIndex(): CatalogIndex | null {
  const { data } = useCatalog();
  return useMemo(() => (data ? buildCatalogIndex(data.products, data.aliases) : null), [data]);
}
