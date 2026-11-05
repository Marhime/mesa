import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collectSteps, extractReadableText, findRecipeNode, parseJsonLoose, parsePage, pickImage } from '../src/jsonld';

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parsePage: @graph + HowToSection (WordPress, Spanish)', () => {
  const page = parsePage(fixture('tinga-graph.html'), 'https://cocinaconlupita.example/tinga-de-pollo/');
  const recipe = page.recipe!;

  it('finds the Recipe inside @graph with an @type array', () => {
    expect(recipe).not.toBeNull();
    expect(recipe.title).toBe('Tinga de pollo fácil');
  });

  it('reads yield, times, language and the first image', () => {
    expect(recipe.servings).toBe(4);
    expect(recipe.totalMinutes).toBe(45);
    expect(recipe.language).toBe('es');
    expect(recipe.image).toBe('https://cocinaconlupita.example/wp-content/uploads/2025/03/tinga-de-pollo-500x500.jpg');
  });

  it('keeps ingredient lines as written and drops section headers', () => {
    expect(recipe.ingredients).toEqual([
      '2 pechugas de pollo (aprox. 800 g)',
      '3 jitomates',
      '1/2 cebolla blanca, fileteada',
      '2 chiles chipotles en adobo',
      '1 cucharada de aceite',
      '1 taza de caldo de pollo',
      'Sal al gusto',
      'Tostadas (opcional)',
    ]);
  });

  it('flattens HowToSection steps and decodes entities', () => {
    expect(recipe.steps).toEqual([
      'Cuece las pechugas en agua con sal durante 25 minutos.',
      'Deja enfriar, deshebra el pollo y reserva.',
      'Licúa los jitomates con los chipotles & el caldo.',
      'Sofríe la cebolla en el aceite, agrega la salsa y el pollo, y cocina 10 minutos.',
    ]);
  });

  it('reads og:title and og:image', () => {
    expect(page.title).toBe('Tinga de Pollo Fácil y Rápida');
    expect(page.image).toBe('https://cocinaconlupita.example/wp-content/uploads/2025/03/tinga-de-pollo-1200x630.jpg');
    expect(page.language).toBe('es');
  });
});

describe('parsePage: top-level array, ImageObject, string instructions (English)', () => {
  const page = parsePage(fixture('guacamole-array.html'), 'https://simplyweeknight.example/recipes/guacamole');
  const recipe = page.recipe!;

  it('skips the broken block and finds the Recipe in the array', () => {
    expect(recipe).not.toBeNull();
    expect(recipe.title).toBe('Classic Guacamole');
    expect(recipe.language).toBe('en');
  });

  it('resolves a relative ImageObject url against the page', () => {
    expect(recipe.image).toBe('https://simplyweeknight.example/img/recipes/guacamole-1x1.jpg');
  });

  it('reads "Serves 4-6" and PT10M', () => {
    expect(recipe.servings).toBe(4);
    expect(recipe.totalMinutes).toBe(10);
  });

  it('splits a single instructions string into steps without numbering', () => {
    expect(recipe.steps).toEqual([
      'Halve the avocados, remove the pits and scoop the flesh into a bowl.',
      'Mash with a fork, leaving it a little chunky.',
      'Stir in the onion, chiles, cilantro, lime juice and salt. Taste and adjust.',
    ]);
    expect(recipe.ingredients).toHaveLength(6);
    expect(recipe.ingredients[0]).toBe('3 ripe Hass avocados');
  });
});

describe('parsePage: a page without a recipe', () => {
  const html = fixture('no-recipe.html');
  const page = parsePage(html, 'https://viajesabroso.example/blog/mercados-cdmx/');

  it('has no recipe but keeps the Open Graph data', () => {
    expect(page.recipe).toBeNull();
    expect(page.title).toBe('Los 5 mejores mercados de la CDMX');
    expect(page.description).toBe('Guía de mercados para comer rico en la Ciudad de México.');
    expect(page.image).toBe('https://viajesabroso.example/uploads/mercado-coyoacan.jpg');
  });

  it('extracts readable text without scripts, navigation, ads or comments', () => {
    const text = extractReadableText(html);
    expect(text).toContain('Los 5 mejores mercados de la CDMX');
    expect(text).toContain('Famoso por sus tostadas de pata');
    expect(text.split('\n')).toContain('Pregunta por los insectos comestibles.');
    expect(text).toContain('Horario: 8:00 a 17:00');
    for (const noise of ['tracking pixel', 'do not read me', 'Tienda', 'Publicidad', 'Juan:', 'Aviso de privacidad', 'font-family']) {
      expect(text).not.toContain(noise);
    }
  });

  it('caps the text length', () => {
    expect(extractReadableText(html, 50).length).toBeLessThanOrEqual(50);
  });
});

describe('JSON-LD helpers', () => {
  it('finds a Recipe nested in mainEntity and accepts schema.org IRIs as @type', () => {
    const data = { '@type': 'WebPage', mainEntity: { '@type': 'http://schema.org/Recipe', name: 'Pozole' } };
    expect(findRecipeNode(data)?.name).toBe('Pozole');
    expect(findRecipeNode([{ '@type': 'Person' }, { '@graph': [{ '@type': ['Thing'] }] }])).toBeNull();
  });

  it('repairs common JSON-LD mistakes', () => {
    expect(parseJsonLoose('{"a": [1, 2,], }')).toEqual({ a: [1, 2] });
    expect(parseJsonLoose('<!--{"a": 1}-->')).toEqual({ a: 1 });
    expect(parseJsonLoose('not json')).toBeUndefined();
  });

  it('reads instructions given as HowToStep objects with only a name, or nested lists', () => {
    expect(
      collectSteps([
        { '@type': 'HowToStep', name: 'Paso 1: Lava el arroz.' },
        { '@type': 'ItemList', itemListElement: ['Fríe el arroz.', { '@type': 'HowToStep', text: '<p>Agrega el caldo.</p>' }] },
      ]),
    ).toEqual(['Lava el arroz.', 'Fríe el arroz.', 'Agrega el caldo.']);
  });

  it('picks images from strings, arrays and ImageObjects', () => {
    const base = 'https://a.example/r/';
    expect(pickImage(['', { url: 'img/x.png' }], base)).toBe('https://a.example/r/img/x.png');
    expect(pickImage({ contentUrl: 'https://cdn.example/y.webp' }, base)).toBe('https://cdn.example/y.webp');
    expect(pickImage('data:image/png;base64,AAAA', base)).toBeNull();
  });
});
