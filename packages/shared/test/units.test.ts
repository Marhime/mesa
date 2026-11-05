import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatQuantity, parseUnit, roundForShopping, scaleQuantity, unitFamily, type Unit } from '../src/index';

describe('parseUnit', () => {
  it.each<[string, Unit, number]>([
    // mass
    ['g', 'g', 1], ['gr', 'g', 1], ['grs', 'g', 1], ['gramos', 'g', 1], ['gram', 'g', 1], ['grammes', 'g', 1],
    ['kg', 'g', 1000], ['Kg.', 'g', 1000], ['kilo', 'g', 1000], ['kilos', 'g', 1000], ['kilogramos', 'g', 1000],
    ['lb', 'g', 453.592], ['lbs', 'g', 453.592], ['libra', 'g', 453.592], ['oz', 'g', 28.35], ['onzas', 'g', 28.35],
    // volume
    ['ml', 'ml', 1], ['mililitros', 'ml', 1], ['l', 'ml', 1000], ['lt', 'ml', 1000], ['lts', 'ml', 1000],
    ['litro', 'ml', 1000], ['litros', 'ml', 1000], ['liter', 'ml', 1000], ['litres', 'ml', 1000],
    ['cl', 'ml', 10], ['dl', 'ml', 100],
    // count
    ['unit', 'unit', 1], ['units', 'unit', 1], ['pz', 'unit', 1], ['pza', 'unit', 1], ['piezas', 'unit', 1],
    ['unidades', 'unit', 1], ['u', 'unit', 1],
    // spoons and cups
    ['tbsp', 'tbsp', 1], ['tablespoons', 'tbsp', 1], ['cda', 'tbsp', 1], ['cdas', 'tbsp', 1], ['cucharadas', 'tbsp', 1],
    ['c. à s.', 'tbsp', 1], ['cuillère à soupe', 'tbsp', 1], ['cuillères à soupe', 'tbsp', 1], ['T', 'tbsp', 1],
    ['tsp', 'tsp', 1], ['teaspoon', 'tsp', 1], ['cdta', 'tsp', 1], ['cdita', 'tsp', 1], ['cucharaditas', 'tsp', 1],
    ['c. à c.', 'tsp', 1], ['cuillère à café', 'tsp', 1], ['t', 'tsp', 1],
    ['cup', 'cup', 1], ['cups', 'cup', 1], ['taza', 'cup', 1], ['tazas', 'cup', 1], ['tasse', 'cup', 1],
    // containers and the rest
    ['can', 'can', 1], ['lata', 'can', 1], ['latas', 'can', 1], ['boîte', 'can', 1], ['boîtes', 'can', 1],
    ['bunch', 'bunch', 1], ['manojo', 'bunch', 1], ['ramo', 'bunch', 1], ['botte', 'bunch', 1],
    ['pack', 'pack', 1], ['paquete', 'pack', 1], ['sobre', 'pack', 1], ['bolsa', 'pack', 1], ['package', 'pack', 1],
    ['packet', 'pack', 1], ['sachet', 'pack', 1],
    ['clove', 'clove', 1], ['dientes', 'clove', 1], ['dientes de ajo', 'clove', 1], ['gousse', 'clove', 1], ['gousses', 'clove', 1],
    ['pinch', 'pinch', 1], ['pizca', 'pinch', 1], ['pincée', 'pinch', 1],
    ['slice', 'slice', 1], ['rebanadas', 'slice', 1], ['tranches', 'slice', 1], ['rodajas', 'slice', 1],
  ])('%j → %s ×%d', (token, unit, factor) => {
    expect(parseUnit(token)).toEqual({ unit, factor });
  });

  it.each(['', 'aguacate', 'de', 'x'])('%j is not a unit', (token) => {
    expect(parseUnit(token)).toBeNull();
  });
});

describe('unitFamily', () => {
  it.each<[Unit | null, string]>([
    ['g', 'mass'], ['ml', 'volume'], ['cup', 'volume'], ['tbsp', 'volume'], ['unit', 'count'], ['can', 'count'],
    ['clove', 'count'], ['pinch', 'other'], [null, 'other'],
  ])('%s → %s', (unit, family) => {
    expect(unitFamily(unit)).toBe(family);
  });
});

describe('scaleQuantity', () => {
  it('multiplies then divides, like plan_recipe', () => {
    expect(scaleQuantity(2, 4, 3)).toBe(1.5);
    expect(scaleQuantity(100, 4, 3)).toBe(75);
    expect(scaleQuantity(1, 2, 6)).toBe(3);
  });
  it('keeps null and ignores impossible servings', () => {
    expect(scaleQuantity(null, 4, 3)).toBeNull();
    expect(scaleQuantity(2, 0, 3)).toBe(2);
  });
});

describe('roundForShopping (same rule as SQL round_for_shopping)', () => {
  it.each<[number | null, Unit | null, number | null]>([
    [null, 'g', null],
    [1.5, 'unit', 2],
    [1.5, null, 2],
    [0.2, 'can', 1],
    [2.01, 'pack', 3],
    [1.1, 'bunch', 2],
    [2.5, 'clove', 3],
    [0.5, 'slice', 1],
    [74.2, 'g', 75],
    [75, 'ml', 75],
    [0, 'unit', 0],
    [0.75, 'tsp', 0.75],
    [1 / 3, 'tbsp', 0.33],
    [2 / 3, 'cup', 0.67],
    [1.005, 'cup', 1.01], // numeric rounds half away from zero, no binary drift
    [0.125, 'pinch', 0.13],
    [1.1 * 10, 'unit', 11], // 11.000000000000002 in floating point, 11 in numeric
  ])('round(%s, %s) = %s', (q, unit, expected) => {
    expect(roundForShopping(q, unit)).toBe(expected);
  });

  it('matches plan_recipe for the db-tests recipe (2 avocados and 100 ml crema for 4, cooked for 3)', () => {
    expect(roundForShopping(scaleQuantity(2, 4, 3), 'unit')).toBe(2);
    expect(roundForShopping(scaleQuantity(100, 4, 3), 'ml')).toBe(75);
    expect(roundForShopping(scaleQuantity(1, 4, 3), 'tsp')).toBe(0.75);
  });

  it('uses the same unit list as the SQL function', () => {
    const sql = readFileSync(new URL('../../../supabase/migrations/20261105000003_functions.sql', import.meta.url), 'utf8');
    const body = /function public\.round_for_shopping[\s\S]*?\$\$([\s\S]*?)\$\$/.exec(sql)?.[1] ?? '';
    const ceilLists = [...body.matchAll(/in \(([^)]*)\) then ceil/g)].flatMap((m) => m[1]!.match(/'[^']+'/g) ?? []);
    expect(ceilLists.map((s) => s.slice(1, -1)).sort()).toEqual(['bunch', 'can', 'clove', 'g', 'ml', 'pack', 'slice', 'unit']);
    expect(body).toMatch(/p_unit is null or/);
    expect(body).toMatch(/else round\(p_quantity, 2\)/);
  });
});

describe('formatQuantity', () => {
  it.each<[number | null, Unit | null, string]>([
    [500, 'g', '500 g'],
    [1500, 'g', '1.5 kg'],
    [1000, 'g', '1 kg'],
    [1234, 'g', '1.23 kg'],
    [907.184, 'g', '907.18 g'],
    [250, 'ml', '250 ml'],
    [1500, 'ml', '1.5 L'],
    [2000, 'ml', '2 L'],
    [2, 'unit', '2'],
    [1.5, 'unit', '1.5'],
    [3, null, '3'],
    [2, 'tbsp', '2 tbsp'],
    [0.5, 'cup', '½ cup'],
    [1.5, 'cup', '1½ cups'],
    [0.25, 'tsp', '¼ tsp'],
    [0.75, 'tbsp', '¾ tbsp'],
    [0.33, 'cup', '⅓ cup'],
    [0.6, 'cup', '0.6 cup'],
    [1, 'can', '1 can'],
    [2, 'can', '2 cans'],
    [1, 'bunch', '1 bunch'],
    [3, 'clove', '3 cloves'],
    [2, 'slice', '2 slices'],
    [1, 'pinch', '1 pinch'],
    [null, 'g', ''],
    [null, null, ''],
  ])('(%s, %s) → %j', (q, unit, expected) => {
    expect(formatQuantity(q, unit)).toBe(expected);
  });
});
