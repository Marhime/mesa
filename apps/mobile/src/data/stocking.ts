// Stocking the pantry by hand: the basics people already own, what their recipes use, staples on day one,
// and finding things by any of their names ("aguacate" finds Avocado).
import { matchProduct, normalizeText, type Category, type Product, type Zone } from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';

import { resolveGroceryInput, type ResolvedGroceryItem } from '../lib/groceryInput';
import { useCatalog, useCatalogIndex } from './catalog';
import { toAddInputs, type AddInput } from './groceries';
import { useHouseholdId } from './household';
import { usePantry, type PantryEntry } from './pantry';
import type { PantryAddInput } from './rpc';
import { useAddToPantry, useSetAlwaysHave, useStaples } from './pantryWrites';
import { must, supabase } from './supabase';

/** Basics most kitchens here already have, by where they live. Names are catalog products. */
const BASICS: { key: string; label: string; names: string[] }[] = [
  {
    key: 'cupboard',
    label: 'Cupboard',
    names: [
      'Rice', 'Black beans', 'Pinto beans', 'Pasta', 'Lentils', 'Flour', 'Corn masa flour', 'Canned tuna',
      'Chipotle in adobo', 'Tomato puree', 'Broth', 'Guajillo chile', 'Ancho chile', 'Árbol chile', 'Soy sauce',
      'Hot sauce', 'Ketchup', 'Mustard', 'Coffee', 'Honey', 'Oats', 'Tostadas',
    ],
  },
  {
    key: 'fridge',
    label: 'Fridge',
    names: ['Egg', 'Milk', 'Butter', 'Corn tortillas', 'Queso fresco', 'Mexican crema', 'Mayonnaise', 'Salsa', 'Lime', 'Serrano pepper', 'Cilantro'],
  },
  { key: 'produce', label: 'Fruit & veg', names: ['Onion', 'Garlic', 'Tomato', 'Avocado', 'Potato'] },
  { key: 'freezer', label: 'Freezer', names: ['Frozen vegetables', 'Frozen fries'] },
];

export interface StockOption {
  productId: string;
  name: string;
  category: Category;
}

export interface StockGroup {
  key: string;
  label: string;
  /** staples: pre-selected on day one; unselecting means "we don't keep it". */
  kind: 'recipes' | 'basics' | 'staples';
  items: StockOption[];
}

/** Products the household's recipes use, most used first. */
function useRecipeProducts() {
  const householdId = useHouseholdId();
  return useQuery({
    queryKey: ['recipeProducts'],
    enabled: !!householdId,
    queryFn: async (): Promise<string[]> => {
      const rows = must(
        await supabase.from('recipe_ingredients').select('product_id').not('product_id', 'is', null).eq('is_optional', false),
      ) as { product_id: string }[];
      const counts = new Map<string, number>();
      for (const r of rows) counts.set(r.product_id, (counts.get(r.product_id) ?? 0) + 1);
      return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
    },
  });
}

/**
 * What to offer in the "+" sheet, without what is already at home: what your recipes use, the basics,
 * and on day one (empty pantry) the staples, pre-selected.
 */
export function useStockOptions() {
  const { data: catalog } = useCatalog();
  const pantry = usePantry();
  const staples = useStaples();
  const recipeProducts = useRecipeProducts();
  return useMemo(() => {
    const products = catalog?.products ?? [];
    const byId = new Map(products.map((p) => [p.id, p]));
    const byName = new Map(products.filter((p) => p.household_id === null).map((p) => [p.name_en.toLowerCase(), p]));
    const atHome = new Set(pantry.items.map((e) => e.product_id));
    const stapleIds = new Set((staples.data ?? []).map((s) => s.productId));
    const offered = new Set<string>();
    const option = (p: Product | undefined): StockOption[] => {
      if (!p || atHome.has(p.id) || stapleIds.has(p.id) || offered.has(p.id)) return [];
      offered.add(p.id);
      return [{ productId: p.id, name: p.name_en, category: p.category }];
    };

    const groups: StockGroup[] = [];
    const firstRun = !!pantry.data && pantry.all.length === 0;
    if (firstRun && staples.data && staples.data.length > 0) {
      groups.push({
        key: 'staples',
        label: 'Always at home',
        kind: 'staples',
        items: staples.data.map((s) => ({ productId: s.productId, name: s.name, category: s.category })),
      });
    }
    const fromRecipes = (recipeProducts.data ?? []).slice(0, 16).flatMap((id) => option(byId.get(id)));
    if (fromRecipes.length > 0) groups.push({ key: 'recipes', label: 'Your recipes use these', kind: 'recipes', items: fromRecipes });
    for (const g of BASICS) {
      const items = g.names.flatMap((n) => option(byName.get(n.toLowerCase())));
      if (items.length > 0) groups.push({ key: g.key, label: g.label, kind: 'basics', items });
    }
    return { groups, firstRun, ready: !!catalog && !!pantry.data };
  }, [catalog, pantry.data, pantry.items, pantry.all.length, staples.data, recipeProducts.data]);
}

/** What someone typed in the "+" sheet, for add_to_pantry (typed things are likely fresh: dated). */
export function toPantryInputs(items: ResolvedGroceryItem[]): PantryAddInput[] {
  return items.map((i) => ({
    product_id: i.product?.id ?? null,
    label: i.label,
    category: i.category,
    quantity: i.quantity,
    unit: i.unit,
    dated: true,
  }));
}

/** Free text to grocery lines (a pantry search miss → "Add to groceries"). */
export function useResolveGroceryText(): (text: string) => AddInput[] {
  const index = useCatalogIndex();
  return (text: string) => toAddInputs(resolveGroceryInput(text, index));
}

/**
 * Pantry search by any name the catalog knows (English, Spanish, French aliases) as well as the shown name.
 * Returns the matches and the product the words name, for "I have it".
 */
export function usePantrySearch(query: string, items: PantryEntry[]): { results: PantryEntry[]; product: Product | null } {
  const index = useCatalogIndex();
  return useMemo(() => {
    const q = normalizeText(query);
    if (q === '') return { results: items, product: null };
    const product = index ? matchProduct(index, query) : null;
    const results = items.filter((e) => normalizeText(e.name).includes(q) || (product !== null && e.product_id === product.id));
    return { results, product };
  }, [query, items, index]);
}

/** Zone names for the "+" sheet chips' default placement. */
export const ZONE_LABEL: Record<Zone, string> = { fridge: 'Fridge', freezer: 'Freezer', cupboard: 'Cupboard' };

/**
 * The "+" sheet as a session: ticks, typed additions, and what confirming does — ticked basics go in the
 * pantry (no date: owned for a while); on day one, staples left unticked become "we don't keep it".
 */
export function usePantryStocking(onError: (e: unknown) => void) {
  const options = useStockOptions();
  const addToPantry = useAddToPantry();
  const setAlwaysHave = useSetAlwaysHave();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [justAdded, setJustAdded] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  const staples = options.groups.find((g) => g.kind === 'staples');
  const start = useCallback(() => {
    // Day one: staples start ticked (most kitchens have them); untick what you don't keep.
    setSelected(new Set(staples?.items.map((i) => i.productId) ?? []));
    setJustAdded([]);
    setOpen(true);
  }, [staples]);
  const toggle = useCallback(
    (key: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );
  const stapleIds = new Set(staples?.items.map((i) => i.productId) ?? []);
  const toAdd = [...selected].filter((id) => !stapleIds.has(id));

  const typed = (items: ResolvedGroceryItem[]) => {
    setJustAdded((prev) => [...prev, ...items.map((i) => i.label.toLowerCase())]);
    addToPantry.mutate(toPantryInputs(items), { onError });
  };

  const confirm = async (): Promise<number> => {
    const notKept = [...stapleIds].filter((id) => !selected.has(id)).map((productId) => ({ productId, value: false }));
    try {
      if (notKept.length > 0) await setAlwaysHave.mutateAsync(notKept);
      const added = toAdd.length > 0 ? await addToPantry.mutateAsync(toAdd.map((product_id) => ({ product_id }))) : 0;
      setOpen(false);
      return added + justAdded.length;
    } catch (e) {
      onError(e);
      return 0;
    }
  };

  return {
    ...options,
    open,
    start,
    close: () => setOpen(false),
    selected,
    toggle,
    addCount: toAdd.length,
    justAdded,
    typed,
    confirm,
    pending: addToPantry.isPending || setAlwaysHave.isPending,
  };
}
