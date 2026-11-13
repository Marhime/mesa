import { describe, expect, it } from 'vitest';

import { MESSAGES } from '../src/errors';
import { digitRuns, guardTranslation, sameNumbers, targetLang, translateSystemPrompt } from '../src/translate-recipe';

describe('digit guard', () => {
  it('compares the multiset of digit runs, whatever their order', () => {
    expect(digitRuns('Bake 25 min at 180 °C, then 5 more')).toEqual(['180', '25', '5']);
    expect(sameNumbers('Bake 25 min at 180 °C', 'Cuire à 180 °C pendant 25 min')).toBe(true);
    expect(sameNumbers('Stir well', 'Bien mélanger')).toBe(true);
  });

  it('notices a changed, converted, dropped or added number', () => {
    expect(sameNumbers('Bake at 350 °F', 'Cuire à 175 °C')).toBe(false);
    expect(sameNumbers('Add 1/2 cup', 'Ajouter ½ tasse')).toBe(false);
    expect(sameNumbers('Add 2 eggs', 'Ajouter deux œufs')).toBe(false);
    expect(sameNumbers('Add 2 eggs', 'Ajouter 2 œufs et 2 jaunes')).toBe(false);
    expect(sameNumbers('Cook 10 to 12 min', 'Cuire 12 à 10 min')).toBe(true);
  });
});

describe('guardTranslation', () => {
  const source = { title: 'Pasta in 15 minutes', steps: ['Boil 2 l of water.', 'Cook the pasta 8 min.', 'Serve.'] };

  it('keeps the original text of a step whose numbers changed, or that came back empty', () => {
    const out = guardTranslation(source, {
      title: 'Pâtes en 15 minutes',
      steps: ['Faire bouillir 2 l d’eau.', 'Cuire les pâtes huit minutes.', '  '],
    });
    expect(out).toEqual({
      title: 'Pâtes en 15 minutes',
      steps: ['Faire bouillir 2 l d’eau.', 'Cook the pasta 8 min.', 'Serve.'],
      kept: 2,
    });
  });

  it('keeps the original title when its numbers changed', () => {
    expect(guardTranslation(source, { title: 'Pâtes en quinze minutes', steps: ['a 2', 'b 8', 'c'] }).title).toBe('Pasta in 15 minutes');
  });

  it('fails when the steps cannot be matched one to one', () => {
    expect(() => guardTranslation(source, { title: 'x', steps: ['a 2', 'b 8'] })).toThrow(MESSAGES.translateFailed);
    expect(() => guardTranslation(source, { title: 'x' })).toThrow(MESSAGES.translateFailed);
    expect(guardTranslation({ title: 'Toast', steps: [] }, { title: 'Pain grillé', steps: [] })).toEqual({ title: 'Pain grillé', steps: [], kept: 0 });
  });
});

describe('targetLang', () => {
  it('takes two-letter ISO 639-1 codes only', () => {
    expect(targetLang(' FR ')).toBe('fr');
    expect(targetLang('es')).toBe('es');
    expect(targetLang('fra')).toBeNull();
    expect(targetLang('pt-BR')).toBeNull();
    expect(targetLang(null)).toBeNull();
  });

  it('names the language and asks to keep every number', () => {
    const prompt = translateSystemPrompt('fr');
    expect(prompt).toContain('French (fr)');
    expect(prompt).toMatch(/one translated step for each step/);
    expect(prompt).toMatch(/never converted/);
  });
});
