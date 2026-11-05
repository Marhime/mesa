import { describe, expect, it } from 'vitest';
import * as shared from '../src/index';

describe('public API', () => {
  it('exports exactly the runtime names of docs/CONTRACT.md', () => {
    expect(Object.keys(shared).sort()).toEqual(
      [
        'normalizeText', 'singularize', 'capitalize',
        'parseUnit', 'unitFamily', 'scaleQuantity', 'roundForShopping', 'formatQuantity',
        'parseGroceryInput', 'parseIngredientLine',
        'buildCatalogIndex', 'matchProduct',
        'AISLE_ORDER', 'CATEGORY_LABEL',
      ].sort(),
    );
  });

  it('keeps the aisle order and labels', () => {
    expect(shared.AISLE_ORDER).toEqual(['produce', 'bakery', 'meat', 'dairy', 'frozen', 'cupboard', 'drinks', 'household', 'other']);
    expect(shared.AISLE_ORDER.map((c) => shared.CATEGORY_LABEL[c])).toEqual(
      ['Produce', 'Bakery', 'Meat & fish', 'Dairy & eggs', 'Frozen', 'Cupboard', 'Drinks', 'Household', 'Other'],
    );
  });
});
