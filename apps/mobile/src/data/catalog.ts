import { buildCatalogIndex, pictoOf, type CatalogIndex, type Category, type Picto, type Product, type ProductAlias } from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

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
    // v2: products carry family and picto (a cache from before lacks them).
    queryKey: ['catalog', 2, householdId],
    enabled: !!householdId,
    staleTime: DAY,
    gcTime: WEEK,
    queryFn: async (): Promise<Catalog> => {
      const [products, aliases] = await Promise.all([
        fetchAll<Product>('products', 'id, household_id, name_en, category, default_zone, shelf_life_days, is_staple, unit_family, family, picto', 'id'),
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

/** A product's drawing by id (catalog or household product), else its category's. */
export function usePictoLookup(): (productId: string | null | undefined, category: Category) => Picto {
  const { data } = useCatalog();
  const byId = useMemo(() => new Map((data?.products ?? []).map((p) => [p.id, p])), [data]);
  return useCallback((productId, category) => pictoOf({ picto: productId ? byId.get(productId)?.picto : null, category }), [byId]);
}
