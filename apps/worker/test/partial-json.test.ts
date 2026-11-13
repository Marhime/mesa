import { describe, expect, it } from 'vitest';

import { partialStringField } from '../src/partial-json';

const answer = (json: string) => partialStringField(json, 'answer');

describe('partialStringField', () => {
  it('is null until the opening quote of the value is in', () => {
    for (const cut of ['', '{', '{"on_topic": true', '{"on_topic": true, "ans', '{"on_topic": true, "answer"', '{"on_topic": true, "answer": ']) {
      expect(answer(cut)).toBeNull();
    }
    expect(answer('{"on_topic": true, "answer": "')).toEqual({ value: '', done: false });
  });

  it('gives the text so far, then the whole text once the closing quote is in', () => {
    expect(answer('{"on_topic": true, "answer": "Una tortilla de esp')).toEqual({ value: 'Una tortilla de esp', done: false });
    expect(answer('{"on_topic":true,"answer":"Una tortilla.","recipes":[')).toEqual({ value: 'Una tortilla.', done: true });
    expect(answer('{\n  "on_topic": false,\n  "answer" :\n  "Only the kitchen."\n}')).toEqual({ value: 'Only the kitchen.', done: true });
  });

  it('decodes escapes like JSON.parse does', () => {
    const full = JSON.stringify({ on_topic: true, answer: 'Say "olé"\n\tthen \\ / é 🍳 done', recipes: [] });
    expect(answer(full)).toEqual({ value: JSON.parse(full).answer, done: true });
    expect(answer('{"answer": "caf\\u00e9 \\ud83c\\udf73 \\b\\f\\r"}')).toEqual({ value: 'café 🍳 \b\f\r', done: true });
  });

  it('leaves out an escape cut in the middle until it is whole', () => {
    expect(answer('{"answer": "a\\')).toEqual({ value: 'a', done: false });
    expect(answer('{"answer": "a\\"')).toEqual({ value: 'a"', done: false });
    expect(answer('{"answer": "caf\\u00')).toEqual({ value: 'caf', done: false });
    expect(answer('{"answer": "caf\\u00e9')).toEqual({ value: 'café', done: false });
    // An emoji is two escapes: its first half waits for the second.
    expect(answer('{"answer": "pan \\ud83c')).toEqual({ value: 'pan ', done: false });
    expect(answer('{"answer": "pan \\ud83c\\udf')).toEqual({ value: 'pan ', done: false });
    expect(answer('{"answer": "pan \\ud83c\\udf73')).toEqual({ value: 'pan 🍳', done: false });
    // Every cut of a full answer is a beginning of it.
    const full = JSON.stringify({ on_topic: true, answer: 'Tu as "du riz"\net des œufs 🍳 — fais un \\ riz sauté.' });
    const final = (JSON.parse(full) as { answer: string }).answer;
    for (let n = 0; n <= full.length; n++) {
      const got = answer(full.slice(0, n));
      if (got) expect(final.startsWith(got.value)).toBe(true);
    }
  });

  it('only reads the top-level field: not a nested key, not text inside another string', () => {
    expect(answer('{"note": "the \\"answer\\": \\"no\\"", "answer": "yes"}')).toEqual({ value: 'yes', done: true });
    expect(answer('{"recipes": [{"answer": "inner"}], "answer": "outer"}')).toEqual({ value: 'outer', done: true });
    expect(answer('{"recipes": [{"answer": "inn')).toBeNull();
    expect(answer('{"meta": {"answer": "inner"}}')).toBeNull();
  });

  it('is null when the value is not a string, or the field is not there', () => {
    expect(answer('{"answer": null, "recipes": []}')).toBeNull();
    expect(answer('{"answer": 42}')).toBeNull();
    expect(answer('{"on_topic": true, "recipes": []}')).toBeNull();
    expect(answer('not json at all')).toBeNull();
  });

  it('skips what comes before the object (a code fence)', () => {
    expect(answer('```json\n{"answer": "Hola')).toEqual({ value: 'Hola', done: false });
  });
});
