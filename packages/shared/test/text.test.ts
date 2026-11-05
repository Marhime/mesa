import { describe, expect, it } from 'vitest';
import { capitalize, normalizeText, singularize } from '../src/index';

describe('normalizeText', () => {
  it.each([
    ['  Jalapeño  ', 'jalapeno'],
    ['Plátano   MACHO', 'platano macho'],
    ['Crème fraîche', 'creme fraiche'],
    ['Œufs', 'oeufs'],
    ['Papel de baño', 'papel de bano'],
    ['d’ail', "d'ail"],
    ['', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });
});

describe('capitalize', () => {
  it.each([
    ['aguacates', 'Aguacates'],
    ['  queso oaxaca ', 'Queso oaxaca'],
    ['élote', 'Élote'],
    ['', ''],
    ['2 kg', '2 kg'],
  ])('%j → %j', (input, expected) => {
    expect(capitalize(input)).toBe(expected);
  });
});

describe('singularize', () => {
  it.each([
    // Spanish
    ['aguacates', 'aguacate'],
    ['limones', 'limon'],
    ['jitomates', 'jitomate'],
    ['chiles', 'chile'],
    ['frijoles', 'frijol'],
    ['nopales', 'nopal'],
    ['champiñones', 'champiñon'],
    ['coliflores', 'coliflor'],
    ['nueces', 'nuez'],
    ['huevos', 'huevo'],
    ['leches', 'leche'],
    // English
    ['tomatoes', 'tomato'],
    ['potatoes', 'potato'],
    ['berries', 'berry'],
    ['cookies', 'cookie'],
    ['leaves', 'leaf'],
    ['peaches', 'peach'],
    ['radishes', 'radish'],
    ['cloves', 'clove'],
    ['olives', 'olive'],
    ['eggs', 'egg'],
    // French
    ['oeufs', 'oeuf'],
    ['œufs', 'oeuf'],
    ['choux', 'chou'],
    ['poireaux', 'poireau'],
    ['gousses', 'gousse'],
    ['tranches', 'tranche'],
    ['carottes', 'carotte'],
    // left alone
    ['sal', 'sal'],
    ['gas', 'gas'],
    ['glass', 'glass'],
    ['asparagus', 'asparagus'],
    ['radis', 'radis'],
    ['ananas', 'ananas'],
    ['arroz', 'arroz'],
    ['leche', 'leche'],
  ])('%s → %s', (input, expected) => {
    expect(singularize(input)).toBe(expected);
  });

  it('keeps a leading capital', () => {
    expect(singularize('Aguacates')).toBe('Aguacate');
  });

  it('singularizes each word of a phrase', () => {
    expect(singularize('pechugas de pollo')).toBe('pechuga de pollo');
  });
});
