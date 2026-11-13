import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PLACEHOLDER_WORDS, VAGUE_HEADS, VAGUE_PHRASES } from '../src/generic';
import { buildCatalogIndex, isGenericName, isVaguePhrase, matchProduct, measureWord, type Product } from '../src/index';

const product = (id: string, name_en: string, household_id: string | null = null): Product => ({
  id, household_id, name_en, category: 'cupboard', default_zone: 'cupboard', shelf_life_days: null, is_staple: false, unit_family: 'count',
});

describe('isGenericName', () => {
  it.each(['Other', 'others', 'MISC', 'Sauce', 'sauces', ' Spices ', 'seasoning', 'herbs', 'Vegetables', 'oil', 'paste', 'powder', 'N/A', 'spice mix', 'misc grocery', 'other items', 'Other sauce', 'assorted vegetables', 'otros'])(
    '%j is vague',
    (name) => expect(isGenericName(name)).toBe(true),
  );

  it.each(['Fish sauce', 'Star anise', 'Bò Kho seasoning', 'Lemongrass', 'Vegetable oil', 'Soy sauce', 'Mixed herbs', 'Fresh herbs', 'Salsa', 'Broth', 'Juice', ''])(
    '%j is specific',
    (name) => expect(isGenericName(name)).toBe(false),
  );

  it('only household products and aliases are left out of matching', () => {
    expect(isVaguePhrase({ household_id: 'h1' }, 'Other')).toBe(true);
    expect(isVaguePhrase({ household_id: null }, 'oil')).toBe(false); // a curated catalog alias
    expect(isVaguePhrase({ household_id: 'h1' }, 'Fish sauce')).toBe(false);
  });

  it('has the same lists as the SQL repair (public.is_vague_name)', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/20261106000021_vague_products.sql', import.meta.url), 'utf8');
    const body = /function public\.is_vague_name[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? '';
    const list = (name: string): string[] => {
      const m = new RegExp(String.raw`array\[([^\]]*)\]::text\[\] as ${name}`).exec(body);
      return (m?.[1]?.match(/'[^']+'/g) ?? []).map((s) => s.slice(1, -1));
    };
    expect(list('placeholders')).toEqual([...PLACEHOLDER_WORDS]);
    expect(list('heads')).toEqual([...VAGUE_HEADS]);
    expect(list('phrases')).toEqual([...VAGUE_PHRASES]);
  });
});

describe('buildCatalogIndex leaves vague household products out', () => {
  const products = [
    product('soy', 'Soy sauce'),
    product('oil', 'Cooking oil'),
    product('h-other', 'Other', 'h1'),
    product('h-sauce', 'Sauce', 'h1'),
    product('h-achiote', 'Achiote paste', 'h1'),
  ];
  const aliases = [
    { product_id: 'oil', alias: 'oil', lang: 'en' },
    { product_id: 'h-other', alias: 'star anise', lang: 'en' },
    { product_id: 'h-sauce', alias: 'fish sauce', lang: 'en' },
    { product_id: 'h-achiote', alias: 'paste', lang: 'en' },
  ];
  const index = buildCatalogIndex(products, aliases);
  const match = (label: string) => matchProduct(index, label)?.name_en ?? null;

  it('with every label they collected', () => {
    expect(match('star anise')).toBeNull();
    expect(match('2 tbsp fish sauce')).toBeNull();
    expect(match('other')).toBeNull();
    expect(match('curry paste')).toBeNull();
  });

  it('but keeps the catalog and specific household products', () => {
    expect(match('soy sauce')).toBe('Soy sauce');
    expect(match('oil')).toBe('Cooking oil');
    expect(match('achiote paste')).toBe('Achiote paste');
    expect(index.size).toBe(3);
  });
});

describe('measureWord', () => {
  it.each<[string, string, string | null]>([
    ['1 thumb ginger, sliced', 'Ginger', 'thumb'],
    ['1 large thumb ginger', 'Ginger', 'large thumb'],
    ['1 thumb-sized piece ginger', 'Ginger', 'thumb-sized piece'],
    ['3 ramitas de cilantro', 'Cilantro', 'ramitas'],
    ['1 rama de canela', 'Cinnamon', 'rama'],
    ['A knob of butter', 'Butter', 'knob'],
    ['4 sprigs thyme (fresh)', 'Thyme', 'sprigs'],
    // nothing to show
    ['2 Ginger', 'Ginger', null], // written back by the ingredient editor
    ['2 tbsp fish sauce', 'Fish sauce', null], // a known unit
    ['3 bay leaves', 'Bay leaf', null],
    ['Salt to taste', 'Salt', null],
    ['1 thumb', 'Ginger', null], // nothing left for the ingredient
  ])('%j (%s) → %j', (line, name, word) => {
    expect(measureWord(line, name)).toBe(word);
  });
});
