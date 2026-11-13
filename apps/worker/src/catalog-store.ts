// The product catalog the worker matches against. The shared catalog (≈150 products, written by the
// migrations) is loaded once at startup and refreshed now and then. A household's own products are loaded
// when one of its jobs needs them, kept for a few households (least recently used out), and loaded again
// as soon as they changed: their count or their latest products.updated_at, which their aliases bump too
// (migration 25). Memory grows with the households working right now, not with every household.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product, ProductAlias } from '@mesa/shared';
import type { Logger } from './log';
import { buildCatalog, type Catalog } from './mapping';

const PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows per request on Supabase
export const SHARED_REFRESH_MS = 30 * 60 * 1000;
/** Households whose products stay in memory between their jobs. */
export const MAX_HOUSEHOLDS = 32;

const PRODUCT_COLUMNS = 'id, household_id, name_en, category, default_zone, shelf_life_days, is_staple, unit_family';

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Reads every row with .range() pages until a short page comes back. */
export async function fetchAllPages<T>(page: (from: number, to: number) => Page<T>, pageSize = PAGE_SIZE): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
}

export interface ProductSet {
  products: Product[];
  aliases: ProductAlias[];
}

/** Where the catalog comes from (the database in production, arrays in tests). */
export interface CatalogReader {
  shared(): Promise<ProductSet>;
  household(householdId: string): Promise<ProductSet>;
  /** Changes whenever the household's products or their aliases change. */
  householdStamp(householdId: string): Promise<string>;
}

type ProductRow = Product & { product_aliases?: { alias: string; lang: string }[] | null };

function productSet(rows: readonly ProductRow[]): ProductSet {
  const products: Product[] = [];
  const aliases: ProductAlias[] = [];
  for (const { product_aliases, ...p } of rows) {
    products.push(p);
    for (const a of product_aliases ?? []) aliases.push({ product_id: p.id, alias: a.alias, lang: a.lang });
  }
  return { products, aliases };
}

export function supabaseCatalogReader(db: SupabaseClient): CatalogReader {
  /** The shared catalog (null) or a household's products, each with its aliases. */
  const ownedBy = (householdId: string | null): Promise<ProductSet> =>
    fetchAllPages<ProductRow>((from, to) => {
      const q = db.from('products').select(`${PRODUCT_COLUMNS}, product_aliases(alias, lang)`);
      return (householdId === null ? q.is('household_id', null) : q.eq('household_id', householdId)).order('id').range(from, to);
    }).then(productSet);
  return {
    shared: () => ownedBy(null),
    household: (householdId) => ownedBy(householdId),
    async householdStamp(householdId) {
      const { data, count, error } = await db
        .from('products')
        .select('updated_at', { count: 'exact' })
        .eq('household_id', householdId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (error) throw new Error(`products stamp: ${error.message}`);
      return `${count ?? 0}:${(data as { updated_at: string }[] | null)?.[0]?.updated_at ?? ''}`;
    },
  };
}

interface HouseholdEntry {
  stamp: string;
  /** The shared catalog version it was built with. */
  sharedVersion: number;
  own: ProductSet;
  catalog: Catalog;
}

/** What jobs need from the catalog: the matching index of one household. */
export interface HouseholdCatalogs {
  forHousehold(householdId: string): Promise<Catalog>;
}

export class CatalogStore implements HouseholdCatalogs {
  private shared: ProductSet = { products: [], aliases: [] };
  private sharedVersion = 0;
  private loadedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  /** Insertion order is recency: the first key is the least recently used. */
  private readonly households = new Map<string, HouseholdEntry>();
  private readonly loading = new Map<string, Promise<Catalog>>();

  constructor(
    private readonly reader: CatalogReader,
    private readonly log: Logger,
    private readonly maxHouseholds = MAX_HOUSEHOLDS,
  ) {}

  /** The shared catalog (startup, then every SHARED_REFRESH_MS). */
  async load(): Promise<void> {
    const started = Date.now();
    this.shared = await this.reader.shared();
    this.sharedVersion += 1;
    this.loadedAt = Date.now();
    this.log.info('catalog_loaded', { products: this.shared.products.length, aliases: this.shared.aliases.length, ms: Date.now() - started });
  }

  startAutoRefresh(intervalMs = SHARED_REFRESH_MS): void {
    this.stop();
    this.timer = setInterval(() => {
      this.load().catch((err: unknown) => this.log.warn('catalog_refresh_failed', { err, age_s: Math.round((Date.now() - this.loadedAt) / 1000) }));
    }, intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** How many households are in memory now. */
  get cachedHouseholds(): number {
    return this.households.size;
  }

  /**
   * Shared catalog + this household's products, indexed for matching (vague household products left out:
   * buildCatalog). Checks the household's stamp each time: one small query, the products only when changed.
   */
  forHousehold(householdId: string): Promise<Catalog> {
    const pending = this.loading.get(householdId);
    if (pending) return pending;
    const work = this.fresh(householdId).finally(() => this.loading.delete(householdId));
    this.loading.set(householdId, work);
    return work;
  }

  private async fresh(householdId: string): Promise<Catalog> {
    // Startup loads it (index.ts); a store used before that loads it on first use.
    if (this.sharedVersion === 0) await this.load();
    const cached = this.households.get(householdId);
    let stamp: string;
    try {
      stamp = await this.reader.householdStamp(householdId);
    } catch (err) {
      if (!cached) throw err;
      this.log.warn('catalog_stamp_failed', { household: householdId, err });
      return this.touch(householdId, cached).catalog;
    }
    if (cached && cached.stamp === stamp) {
      if (cached.sharedVersion !== this.sharedVersion) this.rebuild(cached);
      return this.touch(householdId, cached).catalog;
    }
    // Read after the stamp: a change in between only means one more load next time.
    const own = await this.reader.household(householdId);
    const entry: HouseholdEntry = { stamp, sharedVersion: this.sharedVersion, own, catalog: this.build(own) };
    this.touch(householdId, entry);
    this.log.debug('catalog_household_loaded', { household: householdId, products: own.products.length, cached: this.households.size });
    return entry.catalog;
  }

  private build(own: ProductSet): Catalog {
    return buildCatalog([...this.shared.products, ...own.products], [...this.shared.aliases, ...own.aliases]);
  }

  private rebuild(entry: HouseholdEntry): void {
    entry.catalog = this.build(entry.own);
    entry.sharedVersion = this.sharedVersion;
  }

  /** Most recently used last; the least recently used household goes past the limit. */
  private touch(householdId: string, entry: HouseholdEntry): HouseholdEntry {
    this.households.delete(householdId);
    this.households.set(householdId, entry);
    while (this.households.size > this.maxHouseholds) {
      const oldest = this.households.keys().next().value as string;
      this.households.delete(oldest);
    }
    return entry;
  }
}

/** A reader over arrays (tests, tools): the stamp changes with the household's rows. */
export function memoryCatalogReader(products: readonly Product[], aliases: readonly ProductAlias[] = []): CatalogReader {
  const setOf = (keep: (p: Product) => boolean): ProductSet => {
    const kept = products.filter(keep);
    const ids = new Set(kept.map((p) => p.id));
    return { products: [...kept], aliases: aliases.filter((a) => ids.has(a.product_id)) };
  };
  return {
    shared: async () => setOf((p) => p.household_id === null),
    household: async (householdId) => setOf((p) => p.household_id === householdId),
    householdStamp: async (householdId) => {
      const own = setOf((p) => p.household_id === householdId);
      return `${own.products.length}:${own.aliases.length}`;
    },
  };
}
