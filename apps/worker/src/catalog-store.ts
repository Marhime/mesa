// Product catalog cache: every product and alias, loaded page by page and refreshed every 10 minutes.
// Each household sees the shared catalog plus its own products.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product, ProductAlias } from '@mesa/shared';
import { buildCatalog, type Catalog } from './mapping';
import type { Logger } from './log';

const PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows per request on Supabase
export const CATALOG_REFRESH_MS = 10 * 60 * 1000;

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

export class CatalogStore {
  private products = new Map<string, Product>();
  private aliases = new Map<string, ProductAlias[]>();
  private memo = new Map<string, Catalog>();
  private timer: NodeJS.Timeout | null = null;
  private loadedAt = 0;

  constructor(
    private readonly db: SupabaseClient,
    private readonly log: Logger,
  ) {}

  get size(): number {
    return this.products.size;
  }

  async load(): Promise<void> {
    const started = Date.now();
    const products = await fetchAllPages<Product>((from, to) =>
      this.db.from('products').select(PRODUCT_COLUMNS).order('id').range(from, to),
    );
    const aliases = await fetchAllPages<ProductAlias>((from, to) =>
      this.db.from('product_aliases').select('product_id, alias, lang').order('id').range(from, to),
    );
    const byId = new Map(products.map((p) => [p.id, p]));
    const byProduct = new Map<string, ProductAlias[]>();
    for (const a of aliases) {
      if (!byId.has(a.product_id)) continue;
      const list = byProduct.get(a.product_id) ?? [];
      list.push(a);
      byProduct.set(a.product_id, list);
    }
    this.products = byId;
    this.aliases = byProduct;
    this.memo.clear();
    this.loadedAt = Date.now();
    this.log.info('catalog_loaded', {
      products: products.length,
      household_products: products.filter((p) => p.household_id !== null).length,
      aliases: aliases.length,
      ms: Date.now() - started,
    });
  }

  startAutoRefresh(intervalMs = CATALOG_REFRESH_MS): void {
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

  /** Shared catalog + this household's products, indexed for matchProduct. */
  forHousehold(householdId: string): Catalog {
    const cached = this.memo.get(householdId);
    if (cached) return cached;
    const products: Product[] = [];
    const aliases: ProductAlias[] = [];
    for (const p of this.products.values()) {
      if (p.household_id !== null && p.household_id !== householdId) continue;
      products.push(p);
      aliases.push(...(this.aliases.get(p.id) ?? []));
    }
    const catalog = buildCatalog(products, aliases);
    this.memo.set(householdId, catalog);
    return catalog;
  }

  /** Product names offered to the model so it reuses them for name_en (household products first). */
  knownNames(householdId: string, max = 400): string[] {
    const products = [...this.forHousehold(householdId).products];
    products.sort((a, b) => Number(b.household_id !== null) - Number(a.household_id !== null));
    return products.slice(0, max).map((p) => p.name_en);
  }

  /** Remembers a product the worker just created (or found) so the next ingredient reuses it. */
  remember(product: Product, aliases: ProductAlias[]): void {
    this.products.set(product.id, product);
    const list = this.aliases.get(product.id) ?? [];
    for (const a of aliases) if (!list.some((x) => x.alias === a.alias)) list.push(a);
    this.aliases.set(product.id, list);
    if (product.household_id === null) this.memo.clear();
    else this.memo.delete(product.household_id);
  }
}
