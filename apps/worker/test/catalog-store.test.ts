// The catalog cache: the shared catalog once, each household's products on first use, again only when
// their stamp moved, a few households at most; and the names offered to the model.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Category, Product, ProductAlias } from '@mesa/shared';
import { describe, expect, it, vi } from 'vitest';

import { CatalogStore, memoryCatalogReader, supabaseCatalogReader, type CatalogReader } from '../src/catalog-store';
import { knownNames, MAX_KNOWN, MAX_RELEVANT } from '../src/known-names';
import { buildCatalog } from '../src/mapping';
import { silent } from './fake-deps';

const product = (id: string, name_en: string, household_id: string | null = null, category: Category = 'produce'): Product => ({
  id, household_id, name_en, category, default_zone: 'fridge', shelf_life_days: null, is_staple: false, unit_family: 'count',
});
const alias = (product_id: string, a: string): ProductAlias => ({ product_id, alias: a, lang: 'en' });

/** A reader whose calls are counted, with a stamp the test moves. */
function countingReader(products: Product[], aliases: ProductAlias[] = []) {
  const inner = memoryCatalogReader(products, aliases);
  const stamps = new Map<string, string>();
  const reader: CatalogReader = {
    shared: vi.fn(() => inner.shared()),
    household: vi.fn((h: string) => inner.household(h)),
    householdStamp: vi.fn(async (h: string) => stamps.get(h) ?? 'v1'),
  };
  return { reader, move: (h: string, stamp: string) => stamps.set(h, stamp) };
}

const SHARED = [product('tomato', 'Tomato'), product('lime', 'Lime')];

describe('CatalogStore', () => {
  it('loads the shared catalog once and a household only when its stamp moved', async () => {
    const { reader, move } = countingReader([...SHARED, product('h1-salsa', 'Salsa macha', 'h1')]);
    const store = new CatalogStore(reader, silent);
    await store.load();
    const first = await store.forHousehold('h1');
    expect(first.products.map((p) => p.name_en).sort()).toEqual(['Lime', 'Salsa macha', 'Tomato']);
    expect(await store.forHousehold('h1')).toBe(first);
    expect(reader.household).toHaveBeenCalledTimes(1);
    expect(reader.householdStamp).toHaveBeenCalledTimes(2);

    move('h1', 'v2');
    expect(await store.forHousehold('h1')).not.toBe(first);
    expect(reader.household).toHaveBeenCalledTimes(2);
    expect(reader.shared).toHaveBeenCalledTimes(1);
  });

  it('sees only its own household products, and loads the shared catalog on first use', async () => {
    const { reader } = countingReader([...SHARED, product('h1-salsa', 'Salsa macha', 'h1'), product('h2-mole', 'Mole', 'h2')]);
    const store = new CatalogStore(reader, silent);
    const h2 = await store.forHousehold('h2');
    expect(h2.products.map((p) => p.name_en)).not.toContain('Salsa macha');
    expect(h2.products.map((p) => p.name_en)).toContain('Mole');
    expect(reader.shared).toHaveBeenCalledTimes(1);
  });

  it('keeps a few households: the least recently used goes', async () => {
    const { reader } = countingReader(SHARED);
    const store = new CatalogStore(reader, silent, 2);
    await store.forHousehold('h1');
    await store.forHousehold('h2');
    await store.forHousehold('h1');
    await store.forHousehold('h3');
    expect(store.cachedHouseholds).toBe(2);
    await store.forHousehold('h1');
    expect(reader.household).toHaveBeenCalledTimes(3);
    await store.forHousehold('h2');
    expect(reader.household).toHaveBeenCalledTimes(4);
  });

  it('loads a household once for jobs that ask at the same time', async () => {
    const { reader } = countingReader(SHARED);
    const store = new CatalogStore(reader, silent);
    await store.load();
    const [a, b] = await Promise.all([store.forHousehold('h1'), store.forHousehold('h1')]);
    expect(a).toBe(b);
    expect(reader.householdStamp).toHaveBeenCalledTimes(1);
  });

  it('keeps what it has when the stamp cannot be read, and says so when it has nothing', async () => {
    const { reader } = countingReader(SHARED);
    const store = new CatalogStore(reader, silent);
    const cached = await store.forHousehold('h1');
    vi.mocked(reader.householdStamp).mockRejectedValue(new Error('timeout'));
    expect(await store.forHousehold('h1')).toBe(cached);
    await expect(store.forHousehold('h2')).rejects.toThrow('timeout');
  });

  it('rebuilds households on a new shared catalog', async () => {
    const products = [...SHARED];
    const store = new CatalogStore(memoryCatalogReader(products), silent);
    const before = await store.forHousehold('h1');
    products.push(product('epazote', 'Epazote'));
    await store.load();
    const after = await store.forHousehold('h1');
    expect(after).not.toBe(before);
    expect(after.products.map((p) => p.name_en)).toContain('Epazote');
  });
});

describe('supabaseCatalogReader', () => {
  /** Records each query's chain; answers rows and a count. */
  function db(rows: unknown[], count = rows.length) {
    const queries: unknown[][][] = [];
    const from = (table: string) => {
      const chain: unknown[][] = [['from', table]];
      queries.push(chain);
      const builder: Record<string, unknown> = {};
      for (const name of ['select', 'eq', 'is', 'order', 'range', 'limit']) {
        builder[name] = (...args: unknown[]) => (chain.push([name, ...args]), builder);
      }
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, count, error: null }).then(resolve);
      return builder;
    };
    return { client: { from } as unknown as SupabaseClient, queries };
  }

  it('reads products with their aliases, by owner, and a stamp from the count and the latest change', async () => {
    const shared = db([{ ...product('tomato', 'Tomato'), product_aliases: [{ alias: 'jitomate', lang: 'es' }] }]);
    const set = await supabaseCatalogReader(shared.client).shared();
    expect(set).toEqual({ products: [product('tomato', 'Tomato')], aliases: [{ product_id: 'tomato', alias: 'jitomate', lang: 'es' }] });
    expect(shared.queries[0]).toContainEqual(['is', 'household_id', null]);
    expect(shared.queries[0]).toContainEqual(['range', 0, 999]);

    const own = db([]);
    await supabaseCatalogReader(own.client).household('h1');
    expect(own.queries[0]).toContainEqual(['eq', 'household_id', 'h1']);

    const stamp = db([{ updated_at: '2026-11-07T10:00:00Z' }], 12);
    expect(await supabaseCatalogReader(stamp.client).householdStamp('h1')).toBe('12:2026-11-07T10:00:00Z');
    expect(stamp.queries[0]).toContainEqual(['select', 'updated_at', { count: 'exact' }]);
    expect(stamp.queries[0]).toContainEqual(['order', 'updated_at', { ascending: false }]);
  });
});

describe('knownNames', () => {
  const catalog = buildCatalog(
    [
      product('tomato', 'Tomato'),
      product('lime', 'Lime'),
      product('soy', 'Soy sauce', null, 'cupboard'),
      product('fish', 'Fish sauce', null, 'cupboard'),
      product('h-chile', 'Chile de árbol', 'h1'),
      product('h-other', 'Other', 'h1', 'other'),
    ],
    [alias('tomato', 'jitomate'), alias('h-chile', 'arbol chili')],
  );

  it('offers only the names the text mentions, household products first', () => {
    expect(knownNames(catalog, '3 jitomates, 2 chiles de árbol, juice of 1 lime')).toEqual(['Chile de árbol', 'Lime', 'Tomato']);
    expect(knownNames(catalog, ['A taco', null, 'with fish sauce'])).toEqual(['Fish sauce', 'Soy sauce']);
  });

  it('never offers a vague household product, and offers everything without a text', () => {
    expect(knownNames(catalog, 'other things')).toEqual([]);
    expect(knownNames(catalog)).toEqual(['Chile de árbol', 'Tomato', 'Lime', 'Soy sauce', 'Fish sauce']);
    expect(knownNames(null, 'tomato')).toEqual([]);
  });

  it('stays small', () => {
    const many = buildCatalog(Array.from({ length: 1000 }, (_, i) => product(`p${i}`, `Chile ${i}`)), []);
    expect(knownNames(many, 'chile')).toHaveLength(MAX_RELEVANT);
    expect(knownNames(many)).toHaveLength(MAX_KNOWN);
  });
});
