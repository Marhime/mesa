import type { Product } from '@mesa/shared';
import { describe, expect, it } from 'vitest';

import { buildCatalog } from '../src/mapping';
import { missedLine, receiptLines, sweepLines, type ListLine, type ZoneStock } from '../src/scan';
import { normalizeReceipt, normalizeSweep } from '../src/scan-output';

const product = (id: string, name_en: string, category: Product['category'], zone: Product['default_zone'] = 'fridge'): Product => ({
  id,
  household_id: null,
  name_en,
  category,
  default_zone: zone,
  shelf_life_days: 7,
  is_staple: false,
  unit_family: 'count',
});

const catalog = buildCatalog(
  [product('milk', 'Milk', 'dairy'), product('egg', 'Egg', 'dairy'), product('crema', 'Mexican crema', 'dairy'), product('cilantro', 'Cilantro', 'produce'), product('tomato', 'Tomato', 'produce', 'cupboard')],
  [
    { product_id: 'crema', alias: 'crema', lang: 'es' },
    { product_id: 'tomato', alias: 'jitomate', lang: 'es' },
  ],
);

describe('normalizeSweep', () => {
  it('cleans sloppy items and drops empty ones', () => {
    const items = normalizeSweep({
      items: [
        { name_en: 'Milk', label: 'Leche Lala', category: 'Dairy', quantity: '2', unit: 'unit', level: 'LOW?', expires_on: '2026-11-20', confidence: 1.4 },
        { name_en: '', label: '' },
        { name_en: 'salsa macha', label: 'Salsa macha', category: 'sauces', quantity: null, level: 'half', expires_on: 'soon', confidence: 'x' },
      ],
    });
    expect(items).toEqual([
      { nameEn: 'milk', label: 'Leche Lala', category: 'dairy', quantity: 2, unit: 'unit', level: 'full', expiresOn: '2026-11-20', confidence: 1 },
      { nameEn: 'salsa macha', label: 'Salsa macha', category: 'cupboard', quantity: null, unit: null, level: 'half', expiresOn: null, confidence: 0.5 },
    ]);
  });
});

describe('sweepLines', () => {
  it('adds what is new, updates what changed, offers (unticked) what was not seen', () => {
    const stock: ZoneStock[] = [
      { product_id: 'milk', name: 'Milk', category: 'dairy', level: 'full', state: 'ok' },
      { product_id: 'egg', name: 'Egg', category: 'dairy', level: 'full', state: 'ok' },
      { product_id: 'cilantro', name: 'Cilantro', category: 'produce', level: 'full', state: 'ok' },
    ];
    const items = normalizeSweep({
      items: [
        { name_en: 'milk', label: 'leche', category: 'dairy', level: 'low', confidence: 0.9 },
        { name_en: 'egg', label: 'huevos', category: 'dairy', quantity: 6, unit: 'unit', level: 'full', confidence: 0.95 },
        { name_en: 'mexican crema', label: 'crema', category: 'dairy', level: 'half', confidence: 0.8 },
        { name_en: 'epazote', label: 'epazote', category: 'produce', level: 'full', confidence: 0.3 },
      ],
    });
    const { lines, confirmed } = sweepLines(items, 'fridge', stock, catalog);
    expect(confirmed).toBe(1);
    expect(lines.map((l) => [l.action, l.product_id, l.label, l.suggested])).toEqual([
      ['update', 'milk', 'Milk', true],
      ['add', 'crema', 'Mexican crema', true],
      ['add', null, 'Epazote', false],
      ['out', 'cilantro', 'Cilantro', false],
    ]);
  });
});

describe('receiptLines', () => {
  const list: ListLine[] = [
    { id: 'l-cilantro', label: 'Cilantro', product_id: 'cilantro', category: 'produce' },
    { id: 'l-crema', label: 'Crema', product_id: 'crema', category: 'dairy' },
    { id: 'l-tortillas', label: 'Tortillas', product_id: null, category: 'bakery' },
  ];

  it('matches the list by id, product, then name, converts units and keeps prices', () => {
    const receipt = normalizeReceipt({
      is_receipt: true,
      store: 'Soriana',
      total_mxn: '$118.50',
      lines: [
        { raw: 'CILANTRO MANOJO', name_en: 'cilantro', category: 'produce', quantity: 1, price_mxn: 12, list_item_id: 'l-cilantro', confidence: 0.9 },
        { raw: 'JITOMATE SALADET 1.234KG', name_en: 'tomato', category: 'produce', quantity: 1.234, unit: 'kg', price_mxn: '34.50', confidence: 0.8 },
        { raw: 'TORTILLAS', name_en: 'tortillas', category: 'bakery', quantity: 1, unit: 'kg', price_mxn: 22, list_item_id: 'made-up', confidence: 0.3 },
      ],
    });
    expect(receipt.totalMxn).toBe(118.5);
    const { lines, missed } = receiptLines(receipt, list, catalog);
    expect(lines.map((l) => [l.grocery_item_id, l.product_id, l.quantity, l.unit, l.price_mxn, l.suggested])).toEqual([
      ['l-cilantro', 'cilantro', 1, 'unit', 12, true],
      [null, 'tomato', 1234, 'g', 34.5, true],
      ['l-tortillas', null, 1000, 'g', 22, false],
    ]);
    expect(missed.map((m) => m.id)).toEqual(['l-crema']);
    expect(missedLine(missed)).toBe('You may have forgotten crema.');
  });

  it('is not a receipt without product lines', () => {
    expect(normalizeReceipt({ is_receipt: false, lines: [] }).isReceipt).toBe(false);
    expect(normalizeReceipt({ lines: [{ raw: 'TOTAL', name_en: '' }] }).isReceipt).toBe(false);
  });
});
