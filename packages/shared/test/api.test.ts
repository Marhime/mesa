import { describe, expect, it } from 'vitest';
import * as shared from '../src/index';

describe('public API', () => {
  it('exports exactly the runtime names of docs/CONTRACT.md', () => {
    expect(Object.keys(shared).sort()).toEqual(
      [
        'normalizeText', 'singularize', 'capitalize',
        'isGenericName', 'isVaguePhrase',
        'parseUnit', 'unitFamily', 'scaleQuantity', 'roundForShopping', 'formatQuantity',
        'parseGroceryInput', 'parseIngredientLine', 'measureWord',
        'buildCatalogIndex', 'matchProduct',
        'AISLE_ORDER', 'CATEGORY_LABEL',
        'FAMILIES', 'FAMILY_LABEL', 'PICTOS', 'familyOf', 'pictoOf',
        'JOB_KINDS', 'JOB_LANES', 'IMPORT_KINDS', 'isImportKind', 'jobKind',
        'MESSAGES', 'isErrorCode',
        'MAX_SECTION_CHARS', 'cleanSection', 'sectionHeading', 'headingLine', 'groupBySection', 'linesWithHeadings',
        'readSections', 'meaningfulSections', 'inSectionOrder',
      ].sort(),
    );
  });

  it('falls back from category for products without a family or picto', () => {
    expect(shared.familyOf({ family: 'fruit', category: 'produce' })).toBe('fruit');
    expect(shared.familyOf({ family: null, category: 'dairy' })).toBe('dairy_eggs');
    expect(shared.pictoOf({ picto: 'not-a-picto', category: 'drinks' })).toBe('drink');
    expect(shared.FAMILIES.every((f) => shared.FAMILY_LABEL[f].length > 0)).toBe(true);
  });

  it('keeps the aisle order and labels', () => {
    expect(shared.AISLE_ORDER).toEqual(['produce', 'bakery', 'meat', 'dairy', 'frozen', 'cupboard', 'drinks', 'household', 'other']);
    expect(shared.AISLE_ORDER.map((c) => shared.CATEGORY_LABEL[c])).toEqual(
      ['Produce', 'Bakery', 'Meat & fish', 'Dairy & eggs', 'Frozen', 'Cupboard', 'Drinks', 'Household', 'Other'],
    );
  });
});
