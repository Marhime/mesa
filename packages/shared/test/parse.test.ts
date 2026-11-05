import { describe, expect, it } from 'vitest';
import { parseGroceryInput, parseIngredientLine, type Unit } from '../src/index';

type Row = [string, number | null, Unit | null];
const rows = (text: string): Row[] => parseGroceryInput(text).map((i) => [i.label, i.quantity, i.unit]);

describe('parseGroceryInput: one item at a time', () => {
  it.each<[string, string, number | null, Unit | null]>([
    // Spanish
    ['2 aguacates', 'Aguacates', 2, 'unit'],
    ['leche', 'Leche', null, null],
    ['1/2 kg de queso oaxaca', 'Queso oaxaca', 500, 'g'],
    ['1,5 kg de papas', 'Papas', 1500, 'g'],
    ['1.5 l de leche', 'Leche', 1500, 'ml'],
    ['medio kilo de jamón', 'Jamón', 500, 'g'],
    ['un kilo y medio de tortillas', 'Tortillas', 1500, 'g'],
    ['kilo de tortillas', 'Tortillas', 1000, 'g'],
    ['1/4 de kilo de jamón', 'Jamón', 250, 'g'],
    ['media docena de huevos', 'Huevos', 6, 'unit'],
    ['una docena de huevos', 'Huevos', 12, 'unit'],
    ['2 docenas de huevos', 'Huevos', 24, 'unit'],
    ['una lechuga', 'Lechuga', 1, 'unit'],
    ['dos o tres cebollas', 'Cebollas', 3, 'unit'],
    ['3 latas de chiles chipotles', 'Chiles chipotles', 3, 'can'],
    ['2 paquetes de tortillas de harina', 'Tortillas de harina', 2, 'pack'],
    ['1 manojo de cilantro', 'Cilantro', 1, 'bunch'],
    ['2 pz de pan dulce', 'Pan dulce', 2, 'unit'],
    ['2-3 limones', 'Limones', 3, 'unit'],
    ['½ sandía', 'Sandía', 0.5, 'unit'],
    ['1 ½ kg de naranjas', 'Naranjas', 1500, 'g'],
    ['2 bolsas de basura', 'Bolsas de basura', 2, 'unit'],
    ['media crema', 'Media crema', null, null],
    // English
    ['a dozen eggs', 'Eggs', 12, 'unit'],
    ['half a dozen eggs', 'Eggs', 6, 'unit'],
    ['2 lbs chicken thighs', 'Chicken thighs', 907.184, 'g'],
    ['3 cans of black beans', 'Black beans', 3, 'can'],
    ['milk', 'Milk', null, null],
    ['two avocados', 'Avocados', 2, 'unit'],
    // French
    ['une douzaine d\'œufs', 'Œufs', 12, 'unit'],
    ['500 g de farine', 'Farine', 500, 'g'],
    ['deux baguettes', 'Baguettes', 2, 'unit'],
    ['1 l de lait', 'Lait', 1000, 'ml'],
    // trailing quantities
    ['leche x2', 'Leche', 2, 'unit'],
    ['leche x 2', 'Leche', 2, 'unit'],
    ['tortillas 2x', 'Tortillas', 2, 'unit'],
    ['queso 500g', 'Queso', 500, 'g'],
    ['queso 500 g', 'Queso', 500, 'g'],
    ['huevos (12)', 'Huevos', 12, 'unit'],
    ['Huevos (12)', 'Huevos', 12, 'unit'],
    ['tortillas medio kilo', 'Tortillas', 500, 'g'],
    ['Leche: 2', 'Leche', 2, 'unit'],
    ['agua 2 litros', 'Agua', 2000, 'ml'],
    ['(2) aguacates', 'Aguacates', 2, 'unit'],
    // names with numbers are not quantities
    ['Coca 600', 'Coca 600', null, null],
    ['Pañales etapa 3', 'Pañales etapa 3', null, null],
    ['Pan 7 granos', 'Pan 7 granos', null, null],
    ['Leche (deslactosada)', 'Leche (deslactosada)', null, null],
  ])('%j → %j %s %s', (text, label, quantity, unit) => {
    const [item] = parseGroceryInput(text);
    expect(item).toEqual({ label, quantity, unit, raw: text });
  });
});

describe('parseGroceryInput: lists', () => {
  it('splits a typed Spanish line on commas', () => {
    expect(rows('2 aguacates, leche, 1/2 kg de queso oaxaca')).toEqual([
      ['Aguacates', 2, 'unit'],
      ['Leche', null, null],
      ['Queso oaxaca', 500, 'g'],
    ]);
  });

  it('reads a list pasted from Apple Notes with bullets, checkboxes and numbering', () => {
    const text = `Súper:
- [ ] Leche
- [x] 2 aguacates
• Jamón
* Tortillas
· Cilantro
☐ Huevos (12)
1. Pan de caja
2) Papel de baño

–  Cebolla morada`;
    expect(rows(text)).toEqual([
      ['Leche', null, null],
      ['Aguacates', 2, 'unit'],
      ['Jamón', null, null],
      ['Tortillas', null, null],
      ['Cilantro', null, null],
      ['Huevos', 12, 'unit'],
      ['Pan de caja', null, null],
      ['Papel de baño', null, null],
      ['Cebolla morada', null, null],
    ]);
  });

  it('reads a WhatsApp message with a header and a final "y"', () => {
    expect(rows('Compra: leche, 2 aguacates y tortillas')).toEqual([
      ['Leche', null, null],
      ['Aguacates', 2, 'unit'],
      ['Tortillas', null, null],
    ]);
  });

  it('splits the last "and" / "et" of a comma list', () => {
    expect(rows('milk, eggs and bread').map((r) => r[0])).toEqual(['Milk', 'Eggs', 'Bread']);
    expect(rows('lait, oeufs et pain').map((r) => r[0])).toEqual(['Lait', 'Oeufs', 'Pain']);
    expect(rows('tortillas, sal y pimienta').map((r) => r[0])).toEqual(['Tortillas', 'Sal', 'Pimienta']);
  });

  it('never splits names that contain "and" / "y"', () => {
    expect(rows('bread, mac and cheese').map((r) => r[0])).toEqual(['Bread', 'Mac and cheese']);
    expect(rows('pan, half and half').map((r) => r[0])).toEqual(['Pan', 'Half and half']);
    expect(rows('pan, 1 kilo y medio de tortillas')).toEqual([
      ['Pan', null, null],
      ['Tortillas', 1500, 'g'],
    ]);
  });

  it('does not split a lone "y" without a comma list', () => {
    expect(rows('sal y pimienta').map((r) => r[0])).toEqual(['Sal y pimienta']);
  });

  it('splits on semicolons and newlines, keeps decimal commas', () => {
    expect(rows('1,5 kg de papas; 2 limones\nleche')).toEqual([
      ['Papas', 1500, 'g'],
      ['Limones', 2, 'unit'],
      ['Leche', null, null],
    ]);
  });

  it('drops empty items and duplicates', () => {
    expect(rows('leche,, Leche ,\n\n leche. ,')).toEqual([['Leche', null, null]]);
    expect(parseGroceryInput('')).toEqual([]);
    expect(parseGroceryInput(' , ; \n - ')).toEqual([]);
  });

  it('keeps what the person typed in raw', () => {
    expect(parseGroceryInput('- 2 aguacates, leche').map((i) => i.raw)).toEqual(['2 aguacates', 'leche']);
  });
});

describe('parseIngredientLine', () => {
  it.each<[string, string, number | null, Unit | null]>([
    ['2 cdas de aceite', 'Aceite', 2, 'tbsp'],
    ['2 jitomates, picados', 'Jitomates', 2, 'unit'],
    ['1 cebolla blanca, finamente picada', 'Cebolla blanca', 1, 'unit'],
    ['3 dientes de ajo', 'Ajo', 3, 'clove'],
    ['1 cdta de comino molido', 'Comino molido', 1, 'tsp'],
    ['1/2 taza de crema', 'Crema', 0.5, 'cup'],
    ['½ taza de crema', 'Crema', 0.5, 'cup'],
    ['1 lata (400 ml) de leche de coco', 'Leche de coco', 1, 'can'],
    ['500 g de pechuga de pollo (sin piel)', 'Pechuga de pollo', 500, 'g'],
    ['Pechuga de pollo (500 g)', 'Pechuga de pollo', 500, 'g'],
    ['Sal al gusto', 'Sal', null, null],
    ['Sal y pimienta al gusto', 'Sal y pimienta', null, null],
    ['un poco de sal', 'Sal', null, null],
    ['1 1/2 cups of flour', 'Flour', 1.5, 'cup'],
    ['a pinch of salt', 'Salt', 1, 'pinch'],
    ['4 oz cream cheese, softened', 'Cream cheese', 113.4, 'g'],
    ['2 tablespoons olive oil', 'Olive oil', 2, 'tbsp'],
    ['1 tsp. baking soda', 'Baking soda', 1, 'tsp'],
    ['2 c. à s. d\'huile d\'olive', 'Huile d\'olive', 2, 'tbsp'],
    ['1 c. à c. de sel', 'Sel', 1, 'tsp'],
    ['2 gousses d\'ail', 'Ail', 2, 'clove'],
    ['Farine : 200 g', 'Farine', 200, 'g'],
    ['3 œufs', 'Œufs', 3, 'unit'],
    ['1 pincée de sel', 'Sel', 1, 'pinch'],
    ['2-3 chiles serranos', 'Chiles serranos', 3, 'unit'],
    ['4 rebanadas de jamón', 'Jamón', 4, 'slice'],
    ['of sugar', 'Sugar', null, null],
    ['- 2 tazas de arroz', 'Arroz', 2, 'cup'],
  ])('%j → %j %s %s', (line, label, quantity, unit) => {
    expect(parseIngredientLine(line)).toEqual({ label, quantity, unit, raw: line.trim() });
  });

  it('keeps the words when the line is only a quantity', () => {
    expect(parseIngredientLine('2 latas')).toEqual({ label: 'Latas', quantity: 2, unit: 'unit', raw: '2 latas' });
  });
});
