// Turns what someone typed or pasted into grocery items, with catalog products when known. Pure.
import {
  formatQuantity,
  matchProduct,
  parseGroceryInput,
  type CatalogIndex,
  type Category,
  type Product,
  type Unit,
} from '@mesa/shared';

export interface ResolvedGroceryItem {
  /** The person's words, cleaned by the parser ("Aguacates"). */
  label: string;
  quantity: number | null;
  unit: Unit | null;
  product: Product | null;
  category: Category;
  raw: string;
}

export function resolveGroceryInput(text: string, index: CatalogIndex | null): ResolvedGroceryItem[] {
  return parseGroceryInput(text).map((item) => {
    const product = index ? matchProduct(index, item.label) : null;
    return {
      label: item.label,
      quantity: item.quantity,
      unit: item.unit,
      product,
      category: product?.category ?? 'other',
      raw: item.raw,
    };
  });
}

/** What the app understood, for preview chips: "Avocado · 2", "Milk", "Rice · 1 kg". */
export function previewLabel(item: ResolvedGroceryItem): string {
  const name = item.product?.name_en ?? item.label;
  const qty = formatQuantity(item.quantity, item.unit);
  return qty ? `${name} · ${qty}` : name;
}
