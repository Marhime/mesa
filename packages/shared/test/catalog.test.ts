import { describe, expect, it } from 'vitest';
import catalog from '../catalog/catalog.json';
import { type CatalogEntry, validate } from '../scripts/gen-catalog';
import {
  buildCatalogIndex,
  matchProduct,
  normalizeText,
  parseGroceryInput,
  parseIngredientLine,
  type Product,
  type ProductAlias,
} from '../src/index';

const entries = catalog as CatalogEntry[];
const products: Product[] = entries.map((p, i) => ({
  id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
  household_id: null,
  name_en: p.name_en,
  category: p.category,
  default_zone: p.default_zone,
  shelf_life_days: p.shelf_life_days,
  is_staple: p.is_staple,
  unit_family: p.unit_family,
}));
const aliases: ProductAlias[] = entries.flatMap((p, i) =>
  (['en', 'es', 'fr'] as const).flatMap((lang) => p.aliases[lang].map((alias) => ({ product_id: products[i]!.id, alias, lang }))),
);
const index = buildCatalogIndex(products, aliases);
const match = (label: string): string | null => matchProduct(index, label)?.name_en ?? null;

describe('matchProduct against catalog.json', () => {
  it.each([
    // Spanish, as people type it
    ['pechuga de pollo', 'Chicken breast'],
    ['Pechugas de pollo', 'Chicken breast'],
    ['pollo', 'Chicken'],
    ['jitomates', 'Tomato'],
    ['Jitomate', 'Tomato'],
    ['papel de baño', 'Toilet paper'],
    ['leche', 'Milk'],
    ['Leche deslactosada', 'Milk'],
    ['leche de coco', 'Coconut milk'],
    ['cilantro', 'Cilantro'],
    ['Huevos (12)', 'Egg'],
    ['aguacates', 'Avocado'],
    ['tomate verde', 'Tomatillo'],
    ['cebolla morada', 'Red onion'],
    ['cebollas', 'Onion'],
    ['chiles serranos', 'Serrano pepper'],
    ['chiles jalapeños', 'Jalapeño pepper'],
    ['chipotle en adobo', 'Chipotle in adobo'],
    ['limones', 'Lime'],
    ['plátano macho', 'Plantain'],
    ['plátanos', 'Banana'],
    ['papas', 'Potato'],
    ['camote', 'Sweet potato'],
    ['betabel', 'Beet'],
    ['ejotes', 'Green beans'],
    ['chícharos', 'Peas'],
    ['duraznos', 'Peach'],
    ['elotes', 'Corn on the cob'],
    ['tortillas de harina', 'Flour tortillas'],
    ['tortillas', 'Corn tortillas'],
    ['carne molida', 'Ground beef'],
    ['queso oaxaca', 'Oaxaca cheese'],
    ['queso', 'Cheese'],
    ['jabón para trastes', 'Dish soap'],
    ['aceite de oliva', 'Olive oil'],
    ['aceite', 'Cooking oil'],
    ['crema de cacahuate', 'Peanut butter'],
    ['pasta de dientes', 'Toothpaste'],
    ['pasta', 'Pasta'],
    ['salsa de soya', 'Soy sauce'],
    ['consomé de pollo', 'Chicken bouillon powder'],
    ['bolsas de basura', 'Trash bags'],
    ['nopalitos', 'Nopal'],
    // English
    ['chicken breasts', 'Chicken breast'],
    ['tomatoes', 'Tomato'],
    ['toilet paper', 'Toilet paper'],
    ['eggs', 'Egg'],
    ['red bell peppers', 'Bell pepper'],
    ['black pepper', 'Black pepper'],
    ['coconut milk', 'Coconut milk'],
    ['strawberries', 'Strawberry'],
    // French
    ['œufs', 'Egg'],
    ['pommes de terre', 'Potato'],
    ['pommes', 'Apple'],
    ['lait de coco', 'Coconut milk'],
    ['lait', 'Milk'],
    ["huile d'olive", 'Olive oil'],
    ['citron vert', 'Lime'],
    ['citron', 'Lemon'],
  ])('%j → %s', (label, expected) => {
    expect(match(label)).toBe(expected);
  });

  it.each(['', 'xyz', '12', 'algo raro'])('%j → null', (label) => {
    expect(match(label)).toBeNull();
  });

  it('works on parsed grocery labels and recipe lines', () => {
    const labels = parseGroceryInput('2 aguacates, Huevos (12), 1/2 kg de queso oaxaca').map((i) => match(i.label));
    expect(labels).toEqual(['Avocado', 'Egg', 'Oaxaca cheese']);
    expect(match(parseIngredientLine('2 jitomates, picados').label)).toBe('Tomato');
    expect(match(parseIngredientLine('3 dientes de ajo').label)).toBe('Garlic');
  });

  it('prefers a household product on equal length, but the longest alias still wins', () => {
    const lala: Product = { ...products[0]!, id: 'household-lala', household_id: 'h1', name_en: 'Leche Lala' };
    const withHousehold = buildCatalogIndex([...products, lala], [...aliases, { product_id: lala.id, alias: 'leche', lang: 'es' }]);
    expect(matchProduct(withHousehold, 'leche')?.name_en).toBe('Leche Lala');
    expect(matchProduct(withHousehold, 'leche de coco')?.name_en).toBe('Coconut milk');
  });

  it('normalizes aliases that arrive with accents or capitals', () => {
    const p = products[0]!;
    const idx = buildCatalogIndex([p], [{ product_id: p.id, alias: 'Aguacáte Hass', lang: 'es' }]);
    expect(matchProduct(idx, 'aguacate hass')?.id).toBe(p.id);
    expect(idx.size).toBe(1);
  });
});

describe('catalog.json', () => {
  it('passes the generator checks (no alias points to two products)', () => {
    expect(() => validate(entries)).not.toThrow();
  });

  it('rejects an alias shared by two products', () => {
    const broken = [entries[0]!, { ...entries[1]!, aliases: { en: ['avocados'], es: [], fr: [] } }];
    expect(() => validate(broken)).toThrow(/also matches Avocado/);
  });

  it('has about 160 products, all aliases normalized', () => {
    expect(entries.length).toBeGreaterThanOrEqual(150);
    expect(entries.length).toBeLessThanOrEqual(200);
    for (const p of entries) {
      for (const a of [...p.aliases.en, ...p.aliases.es, ...p.aliases.fr]) expect(a).toBe(normalizeText(a));
    }
  });

  it('marks the staples', () => {
    const staples = entries.filter((p) => p.is_staple).map((p) => p.name_en).sort();
    expect(staples).toEqual(
      ['Bay leaf', 'Black pepper', 'Chicken bouillon powder', 'Chili powder', 'Cinnamon', 'Cooking oil', 'Cumin',
        'Garlic powder', 'Olive oil', 'Oregano', 'Salt', 'Sugar', 'Vinegar', 'Water'].sort(),
    );
  });

  it('puts things in the right aisle', () => {
    const byName = new Map(entries.map((p) => [p.name_en, p]));
    expect(byName.get('Corn tortillas')?.category).toBe('bakery');
    expect(byName.get('Chipotle in adobo')?.category).toBe('cupboard');
    expect(byName.get('Coconut milk')?.category).toBe('cupboard');
    expect(byName.get('Toilet paper')?.category).toBe('household');
    expect(byName.get('Egg')?.category).toBe('dairy');
  });
});
