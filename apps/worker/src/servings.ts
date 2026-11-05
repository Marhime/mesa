// recipeYield → number of people. "4 servings", "4-6", ["4", "4 porciones"], "Serves four" → 4.
// Yields that count things ("24 cookies", "12 tacos") are not people: null, so the default applies.

const MAX_SERVINGS = 50;

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10,
};

const SERVING_WORDS = new Set([
  'serving', 'servings', 'serves', 'serve', 'people', 'persons', 'person', 'portion', 'portions', 'pax', 'plates',
  'porcion', 'porciones', 'racion', 'raciones', 'persona', 'personas', 'comensal', 'comensales', 'platos', 'plato',
  'personne', 'personnes', 'parts', 'part', 'couverts',
]);

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

type Reading = { n: number; kind: 'servings' | 'items' };

function readString(text: string): Reading | null {
  const s = fold(text).replace(/[()[\]]/g, ' ').trim();
  if (s === '') return null;
  const words = s.split(/[\s:,;/]+/).filter((w) => w.length > 0);
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    let n: number | null = null;
    const digits = /^(\d+(?:[.,]\d+)?)(?:[-–—~](\d+(?:[.,]\d+)?))?([a-z]*)$/.exec(w);
    if (digits) n = Number(digits[1]!.replace(',', '.'));
    else if (WORD_NUMBERS[w] !== undefined && i + 1 < words.length && SERVING_WORDS.has(words[i + 1]!)) n = WORD_NUMBERS[w]!;
    else if (WORD_NUMBERS[w] !== undefined && i > 0 && /^(serves|para|pour|rinde|makes)$/.test(words[i - 1]!)) n = WORD_NUMBERS[w]!;
    if (n === null) continue;

    // the word after the number (skipping a "to 6" / "a 6" range) says what is counted
    let j = i + 1;
    if (/^(?:-|–|to|a|o|or|ou|y|al)$/.test(words[j] ?? '') && /^\d/.test(words[j + 1] ?? '')) j += 2;
    else if (/^[-–]\d/.test(words[j] ?? '')) j += 1;
    const glued = digits?.[3] ?? '';
    const next = glued !== '' ? glued : (words[j] ?? '');
    const before = words.slice(0, i).join(' ');
    if (next === '' || SERVING_WORDS.has(next) || /\b(serves|para|pour|rinde|yield|porciones|servings)\b/.test(before)) {
      return { n, kind: 'servings' };
    }
    return { n, kind: 'items' };
  }
  return null;
}

function valid(n: number): number | null {
  const r = Math.round(n);
  return r >= 1 && r <= MAX_SERVINGS ? r : null;
}

export function parseServings(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? valid(value) : null;
  if (typeof value === 'string') {
    const r = readString(value);
    return r && r.kind === 'servings' ? valid(r.n) : null;
  }
  if (Array.isArray(value)) {
    const readings = value
      .map((v) => (typeof v === 'number' ? ({ n: v, kind: 'servings' } as Reading) : typeof v === 'string' ? readString(v) : null))
      .filter((r): r is Reading => r !== null);
    // ["24", "24 cookies"]: the bare number repeats an item count
    if (readings.some((r) => r.kind === 'items')) {
      const explicit = value.some((v) => typeof v === 'string' && /[a-z]/i.test(v) && readString(v)?.kind === 'servings');
      if (!explicit) return null;
    }
    for (const r of readings) if (r.kind === 'servings') return valid(r.n);
    return null;
  }
  if (value !== null && typeof value === 'object') {
    const v = (value as Record<string, unknown>).value ?? (value as Record<string, unknown>).name;
    return v === undefined ? null : parseServings(v);
  }
  return null;
}
