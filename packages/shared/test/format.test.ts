import { describe, expect, it } from 'vitest';
import { formatQuantity, scaleQuantity, type Unit } from '../src/index';

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
    [3, null, '3'],
    [2, 'tbsp', '2 tbsp'],
    [0.5, 'cup', '½ cup'],
    [1.5, 'cup', '1½ cups'],
    [0.25, 'tsp', '¼ tsp'],
    [0.75, 'tbsp', '¾ tbsp'],
    [0.33, 'cup', '⅓ cup'],
    [1, 'can', '1 can'],
    [2, 'can', '2 cans'],
    [1, 'bunch', '1 bunch'],
    [3, 'clove', '3 cloves'],
    [2, 'slice', '2 slices'],
    [1, 'pinch', '1 pinch'],
    [0, 'unit', '0'],
    [null, 'g', ''],
    [null, null, ''],
  ])('(%s, %s) → %j', (q, unit, expected) => {
    expect(formatQuantity(q, unit)).toBe(expected);
  });

  it('never prints a decimal for things you count: fractions under 1, wholes and halves above', () => {
    const counts: Array<[number, string]> = [
      [0.75, '¾'], [0.5, '½'], [0.25, '¼'], [1 / 3, '⅓'], [2 / 3, '⅔'], [0.6, '⅔'], [0.1, '¼'], [0.95, '1'],
      [1.5, '1½'], [2.25, '2'], [2.4, '2½'], [2.6, '2½'], [3.75, '4'], [3, '3'], [1.2, '1'], [12.2, '12'], [12.3, '12½'],
    ];
    for (const [q, text] of counts) {
      expect(formatQuantity(q, 'unit'), `${q}`).toBe(text);
      expect(formatQuantity(q, null), `${q}`).toBe(text);
    }
    expect(formatQuantity(0.75, 'can')).toBe('¾ can');
    expect(formatQuantity(1.5, 'pack')).toBe('1½ packs');
    expect(formatQuantity(2.25, 'clove')).toBe('2 cloves');
    expect(formatQuantity(0.75, 'pinch')).toBe('¾ pinch');
  });

  it('rounds spoons and cups to the nearest kitchen fraction', () => {
    expect(formatQuantity(1.125, 'tbsp')).toBe('1⅛ tbsp');
    expect(formatQuantity(0.6, 'cup')).toBe('⅔ cup');
    expect(formatQuantity(0.125, 'tsp')).toBe('⅛ tsp');
    expect(formatQuantity(0.01, 'tsp')).toBe('⅛ tsp'); // above zero never reads "0"
    expect(formatQuantity(1.004, 'cup')).toBe('1 cup'); // singular on what is shown
    expect(formatQuantity(2.97, 'cup')).toBe('3 cups');
    expect(formatQuantity(1.4, 'tbsp')).toBe('1⅓ tbsp');
  });

  it('reads the Bò Kho for 3 (the recipe serves 4)', () => {
    const for3 = (q: number, unit: Unit | null, word?: string) => formatQuantity(scaleQuantity(q, 4, 3), unit, word);
    expect(for3(2, 'tbsp')).toBe('1½ tbsp'); // fish sauce
    expect(for3(1.5, 'tbsp')).toBe('1⅛ tbsp'); // Bò Kho seasoning
    expect(for3(3, 'unit')).toBe('2'); // bay leaves: 2.25
    expect(for3(1, 'unit')).toBe('¾'); // onion
    expect(for3(4, 'unit')).toBe('3'); // carrots
    expect(for3(5, 'unit')).toBe('4'); // carrots: 3.75
    expect(for3(1, null, 'thumb')).toBe('¾ thumb'); // ginger
    expect(for3(1400, 'g')).toBe('1.05 kg'); // beef
  });

  it('shows the line’s own measure only when there is no unit code', () => {
    expect(formatQuantity(2, null, 'sprigs')).toBe('2 sprigs');
    expect(formatQuantity(2, 'unit', 'large')).toBe('2');
    expect(formatQuantity(2, 'tbsp', 'thumb')).toBe('2 tbsp');
    expect(formatQuantity(null, null, 'thumb')).toBe('');
  });
});
