import { describe, expect, it, vi } from 'vitest';

import { guessParts, MIN_LINES_FOR_PARTS, partsOf, partsUserPrompt } from '../src/section-guess';
import { withParts, type StoredLine } from '../src/reread';
import { silent } from './fake-deps';

// The reported chow mein, as saved before sections existed.
const LINES = [
  'beef 7 oz/200 g', 'soy sauce 3/4 tsp', 'dark soy sauce 1 1/2 tsp', 'corn starch 1 tbsp',
  'dark soy sauce 2 tbsp', 'sugar 1 1/2 tsp', 'fresh chow mein noodle 16 oz/450 g', 'dark soy sauce 1 tsp',
];
const STEPS = ['Marinate the beef with the soy sauces and corn starch.', 'Mix the sauce.', 'Fry the noodles with the dark soy sauce.'];
const ask = (answer: unknown) => ({ askJson: vi.fn(async () => answer) });
const signal = new AbortController().signal;

describe('guessParts', () => {
  it('asks with the numbered lines and the steps, and gives each line its part', async () => {
    const ai = ask({ parts: [{ name: 'Marinade', lines: [1, 2, 3, 4] }, { name: 'Sauce', lines: [5, 6] }, { name: 'Noodles', lines: [7, 8] }] });
    const parts = await guessParts(ai, { title: 'Beef chow mein', lines: LINES, steps: STEPS }, silent, signal);
    expect(parts).toEqual(['Marinade', 'Marinade', 'Marinade', 'Marinade', 'Sauce', 'Sauce', 'Noodles', 'Noodles']);
    const [request, what] = ai.askJson.mock.calls[0] as unknown as [{ parts: { text: string }[] }, string];
    expect(what).toBe('sections');
    expect(request.parts[0]!.text).toContain('3. dark soy sauce 1 1/2 tsp');
    expect(request.parts[0]!.text).toContain('2. Mix the sauce.');
  });

  it('asks nothing for a short list, and goes on without parts when the model fails', async () => {
    const ai = ask({ parts: [] });
    expect(await guessParts(ai, { title: 'Eggs', lines: LINES.slice(0, MIN_LINES_FOR_PARTS - 1), steps: [] }, silent, signal)).toEqual([null, null, null, null, null]);
    expect(ai.askJson).not.toHaveBeenCalled();
    const failing = { askJson: vi.fn(async () => { throw new Error('busy'); }) };
    expect(await guessParts(failing, { title: 'x', lines: LINES, steps: STEPS }, silent, signal)).toEqual(LINES.map(() => null));
  });

  it('reads only what it can: 1-based lines in range, a line in its first part', () => {
    expect(partsOf({ parts: [{ name: 'A', lines: [1, 9, 0, 2.5] }, { name: 'B', lines: [1, 2] }, { lines: [3] }] }, 3)).toEqual(['A', 'B', null]);
    expect(partsOf('nonsense', 2)).toEqual([null, null]);
    expect(partsUserPrompt({ title: 'T', lines: ['a'], steps: [] })).toContain('(none)');
  });
});

const stored = (i: number, section: string | null = null): StoredLine => ({
  id: `l${i}`, position: i, raw_text: LINES[i]!, name: LINES[i]!, product_id: null, quantity: null, unit: null,
  is_guessed: false, is_optional: false, section,
});

describe('withParts', () => {
  it('gives a recipe without sections its parts, part by part, positions 0…n-1', () => {
    const rows = [0, 1, 2, 3].map((i) => stored(i));
    const out = withParts(rows, ['Marinade', 'Sauce', 'marinade', null]);
    expect(out.map((r) => [r.id, r.position, r.section])).toEqual([
      ['l3', 0, null], ['l0', 1, 'Marinade'], ['l2', 2, 'Marinade'], ['l1', 3, 'Sauce'],
    ]);
  });

  it('keeps the sections a recipe has, and one part alone is no part', () => {
    const mine = [stored(0, 'Mine'), stored(1)];
    expect(withParts(mine, ['A', 'B'])).toEqual(mine);
    expect(withParts([stored(0), stored(1)], ['Sauce', 'Sauce']).map((r) => r.section)).toEqual([null, null]);
  });
});
