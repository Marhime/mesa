// For you / Find me: what the model is asked (searches, then one batched verdict) and how its answers
// are cleaned before anything is searched or shown.
import { describe, expect, it } from 'vitest';

import { cleanWhy, fitScore, judgeRequest, MAX_WHY, normalizeVerdicts } from '../src/discover-judge';
import type { TasteProfile } from '../src/discover-profile';
import { cleanQuery, cleanWish, findQueries, findQueriesRequest, FOR_YOU_QUERIES, forYouQueriesRequest, normalizeQueries } from '../src/discover-queries';
import { candidate, NOW_MS, vid } from './discover-helpers';

const profile: TasteProfile = {
  language: 'es',
  cooked: [{ title: 'Tinga de pollo', creator: 'Food is Love', minutes: 35 }],
  recent: [{ title: 'Pad kra pao', creator: null, minutes: null }],
  followed: ['Food is Love'],
  soon: [{ name: 'Poblano', expiresOn: '2026-11-08' }],
  liked: ['Pozole rojo — Abuela Rosa'],
  disliked: ['10 hacks with eggs — Clickbait Kitchen'],
};
const today = new Date(NOW_MS);
const textOf = (r: { parts: { text?: string }[] }): string => r.parts[0]!.text!;

describe('search queries', () => {
  it('tells the model the household profile and asks for ~6 searches, mostly in its zone', () => {
    const req = forYouQueriesRequest(profile, today);
    expect(req.systemInstruction).toContain(`Return ${FOR_YOU_QUERIES} searches`);
    expect(req.systemInstruction).toContain('step to the side');
    expect(req.systemInstruction).toContain('Never assume a country');
    const text = textOf(req);
    expect(text).toContain('Household language: es');
    expect(text).toContain('- Tinga de pollo (Food is Love), 35 min');
    expect(text).toContain('- Poblano (by Sunday 2026-11-08)');
    expect(text).toContain('Today: 2026-11-06 (Friday)');
    expect(text).toContain('10 hacks with eggs — Clickbait Kitchen');
  });

  it('puts the wish first for Find me', () => {
    const req = findQueriesRequest('spicy chicken, 30 min', profile, today);
    expect(textOf(req).startsWith('Wish: spicy chicken, 30 min\n')).toBe(true);
    expect(req.systemInstruction).toContain('At least one in the household language');
  });

  it('cleans, dedupes (case and accents ignored) and caps the searches; languages are ISO 639-1', () => {
    const raw = {
      queries: [
        { q: 'ytsearch8: Cochinita Pibil receta 🔥 #mexico', lang: 'es-MX', dish: 'cochinita pibil' },
        { q: '  cochinita   píbil RECETA ', lang: 'es', dish: null },
        { q: '"one pan chicken thighs 30 min"', lang: 'EN', dish: 'One-pan chicken' },
        { q: 'ab', lang: 'en', dish: null },
        { q: 'poulet basquaise recette', lang: 'French', dish: 'Basque chicken' },
        { q: 'pad kra pao', lang: 'th', dish: '🌶️' },
        null,
        { q: 42 },
      ],
    };
    expect(normalizeQueries(raw, 6, 'en')).toEqual([
      { q: 'Cochinita Pibil receta', lang: 'es', dish: 'cochinita pibil' },
      { q: 'one pan chicken thighs 30 min', lang: 'en', dish: 'One-pan chicken' },
      { q: 'poulet basquaise recette', lang: 'en', dish: 'Basque chicken' },
      { q: 'pad kra pao', lang: 'th', dish: null },
    ]);
    expect(normalizeQueries(raw, 2, 'en')).toHaveLength(2);
    expect(normalizeQueries({ nope: [] }, 6, 'en')).toEqual([]);
    expect(normalizeQueries(null, 6, 'en')).toEqual([]);
  });

  it('searches the wish itself when the model gave nothing usable', () => {
    expect(findQueries({ queries: [] }, 'pollo picante 30 min', 'es')).toEqual([{ q: 'pollo picante 30 min', lang: 'es', dish: null }]);
    expect(findQueries({ queries: [{ q: 'x' }] }, '', 'es')).toEqual([]);
    expect(findQueries({ queries: [{ q: 'spicy chicken', lang: 'en', dish: null }] }, 'w', 'es')).toEqual([{ q: 'spicy chicken', lang: 'en', dish: null }]);
  });

  it('reads queries and wishes as one tidy line', () => {
    expect(cleanQuery('  a\nb  c ')).toBe('a b c');
    expect(cleanQuery('x'.repeat(200))).toHaveLength(80);
    expect(cleanQuery(null)).toBeNull();
    expect(cleanWish('  spicy\n chicken ')).toBe('spicy chicken');
    expect(cleanWish(null)).toBe('');
  });
});

describe('the batched verdict', () => {
  it('asks once about every video, with how it was found, and the wish when there is one', () => {
    const list = [candidate(1, { duration: 1500, uploadedAt: Date.parse('2026-09-15T00:00:00Z') / 1000, description: 'x'.repeat(400) }), candidate(2, { origin: { kind: 'followed' } })];
    const forYou = judgeRequest(profile, list, null, today);
    const text = textOf(forYou);
    expect(text).toContain(`"id": "${vid(1)}"`);
    expect(text).toContain('"minutes": 25');
    expect(text).toContain('"uploaded": "2026-09"');
    expect(text).toContain('"found_by": "search \\"q1\\""');
    expect(text).toContain('"found_by": "a creator they follow"');
    expect(text).not.toContain('x'.repeat(251));
    expect(text).not.toContain('Wish:');
    expect(forYou.systemInstruction).toContain('Never invent a fact');

    const find = judgeRequest(profile, list, 'spicy chicken', today);
    expect(textOf(find).startsWith('Wish: spicy chicken')).toBe(true);
    expect(find.systemInstruction).toContain('matches the wish first');
  });

  it('keeps real recipes with a why, for ids asked about, first answer winning', () => {
    const asked = new Set([vid(1), vid(2), vid(3), vid(4), vid(5)]);
    const raw = {
      videos: [
        { id: vid(1), recipe: true, dish: 'Tinga de pollo 🌮', cuisine: ' Mexican ', language: 'es-419', fit: 5, why: '"Like the tinga you made"' },
        { id: vid(1), recipe: false, dish: null, cuisine: null, language: null, fit: 1, why: 'second answer' },
        { id: vid(2), recipe: false, dish: 'Vlog', cuisine: null, language: 'en', fit: 1, why: 'Not a recipe' },
        { id: vid(3), recipe: true, dish: 'Pozole', cuisine: '', language: 'Spanish', fit: 'high', why: '  ' },
        { id: vid(4), recipe: true, dish: null, cuisine: null, language: null, fit: 9, why: `Uses the poblanos before Friday ${'and more '.repeat(20)}` },
        { id: 'other', recipe: true, dish: 'x', cuisine: null, language: null, fit: 5, why: 'Not asked about' },
        null,
      ],
    };
    const verdicts = normalizeVerdicts(raw, asked)!;
    expect([...verdicts.keys()]).toEqual([vid(1), vid(4)]);
    expect(verdicts.get(vid(1))).toEqual({ dish: 'Tinga de pollo', cuisine: 'Mexican', language: 'es', fit: 1, why: 'Like the tinga you made' });
    expect(verdicts.get(vid(4))!.fit).toBe(1);
    expect(verdicts.get(vid(4))!.why.length).toBeLessThanOrEqual(MAX_WHY);
    expect(verdicts.get(vid(4))!.cuisine).toBeNull();
    expect(normalizeVerdicts({ answer: 'none' }, asked)).toBeNull();
    expect(normalizeVerdicts({ videos: [] }, asked)!.size).toBe(0);
  });

  it('maps fit 1–5 to 0–1 and treats a missing one as the middle', () => {
    expect([1, 2, 3, 4, 5].map(fitScore)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(fitScore(0)).toBe(0);
    expect(fitScore(4.4)).toBe(0.75);
    expect(fitScore(undefined)).toBe(0.5);
    expect(cleanWhy('ok')).toBe('');
  });
});
