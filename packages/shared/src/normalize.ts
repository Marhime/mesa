// Text helpers shared by parsing and catalog matching. Pure functions, no runtime deps.

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Lowercase, strip accents (and the œ/æ ligatures), trim, collapse whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/ß/g, 'ss')
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Accent-free lowercase form used to look words up in rule tables (same length for composed input). */
function foldWord(s: string): string {
  return s.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/** Uppercases the first letter of the trimmed string; the rest is left as typed. */
export function capitalize(s: string): string {
  const t = s.trim();
  if (t.length === 0) return t;
  const first = t.codePointAt(0)!;
  const ch = String.fromCodePoint(first);
  return ch.toUpperCase() + t.slice(ch.length);
}

// Plural forms whose singular is not reachable by the suffix rules below (accent-free keys).
const IRREGULAR: Record<string, string> = {
  // English
  leaves: 'leaf',
  loaves: 'loaf',
  halves: 'half',
  knives: 'knife',
  shelves: 'shelf',
  calves: 'calf',
  wolves: 'wolf',
  scarves: 'scarf',
  children: 'child',
  geese: 'goose',
  mice: 'mouse',
  teeth: 'tooth',
  feet: 'foot',
  people: 'person',
  // Spanish
  nueces: 'nuez',
  raices: 'raiz',
  peces: 'pez',
  lapices: 'lapiz',
  veces: 'vez',
  cruces: 'cruz',
  maices: 'maiz',
  panes: 'pan',
  flanes: 'flan',
  azucares: 'azucar',
  cebollines: 'cebollin',
  calabacines: 'calabacin',
  budines: 'budin',
  pudines: 'pudin',
  jabalies: 'jabali',
  // French
  choux: 'chou',
  genoux: 'genou',
  cailloux: 'caillou',
  oeufs: 'oeuf',
  boeufs: 'boeuf',
  yeux: 'oeil',
};

// Words that end like a plural but are singular (or invariable): left untouched.
const INVARIABLE = new Set([
  'ananas', 'tres', 'seis', 'lunes', 'martes', 'jueves', 'viernes', 'gratis', 'menos', 'atlas',
  'chips', 'species', 'series', 'news', 'molasses', 'brussels', 'oats', 'grits', 'swiss',
  'nachos', 'pancakes', 'hummus', 'couscous', 'tapas', 'tamis', 'mais', 'anis', 'pois', 'noix',
  'riz', 'jus', 'cous', 'tofus',
]);

// English -ies plurals whose singular ends in -ie, not -y.
const IES_TO_IE = new Set([
  'cookies', 'brownies', 'smoothies', 'movies', 'calories', 'veggies', 'zombies', 'rookies',
  'selfies', 'hoagies', 'sweeties', 'cuties', 'aunties', 'goalies', 'pies', 'ties', 'lies',
]);

// English -ches plurals whose singular ends in -ch (Spanish/French -ches usually come from -che).
const CHES_TO_CH = new Set([
  'peaches', 'lunches', 'sandwiches', 'bunches', 'branches', 'pouches', 'inches', 'batches',
  'matches', 'patches', 'starches', 'spinaches', 'crunches', 'beaches', 'couches', 'punches',
]);

// English -sses plurals of -ss words (French -sses come from -sse: gousses, saucisses, mousses).
const SSES_TO_SS = new Set([
  'glasses', 'classes', 'dresses', 'grasses', 'cresses', 'watercresses', 'kisses', 'masses', 'passes', 'bosses', 'brasses',
]);

// -oes plurals that only add "s" (shoe → shoes); every other -oes drops "es" (tomatoes → tomato).
const OES_TO_OE = new Set(['shoes', 'canoes', 'toes', 'hoes', 'oboes', 'floes', 'aloes', 'throes', 'does']);

// Vowel + "les" words that are -le singulars (chile, mole) rather than Spanish -l + es (frijol).
const LES_TO_LE = new Set([
  'moles', 'guacamoles', 'sales', 'tales', 'scales', 'whales', 'males', 'bales', 'ales', 'pales',
  'holes', 'poles', 'roles', 'soles', 'casseroles', 'profiteroles', 'stoles', 'paroles', 'eles',
]);

// English -ones words that only add "s" (Spanish -ones drop "es": limones → limon).
const ONES_TO_ONE = new Set(['scones', 'cones', 'bones', 'stones', 'phones', 'zones', 'ozones', 'ones', 'hones', 'tones', 'clones', 'drones']);

// English -ores words that only add "s" (Spanish -ores drop "es": flores → flor).
const ORES_TO_ORE = new Set(['stores', 'chores', 'cores', 'pores', 'spores', 'scores', 'mores', 'snores', 'shores', 'ores', 'smores']);

/**
 * Practical singular for Spanish, English and French grocery words.
 * Accents and case are kept; only the ending changes. Phrases are singularized word by word.
 */
export function singularize(word: string): string {
  if (/\s/.test(word.trim())) {
    return word
      .trim()
      .split(/\s+/)
      .map((w) => singularize(w))
      .join(' ');
  }
  const w = word.trim().normalize('NFC');
  if (w.length <= 3 || /\d/.test(w)) return w;
  const key = foldWord(w).replace(/œ/g, 'oe');
  const upper = w !== w.toLowerCase() && w.charAt(0) === w.charAt(0).toUpperCase();
  const withCase = (s: string): string => (upper ? capitalize(s) : s);

  const irregular = IRREGULAR[key];
  if (irregular !== undefined) return withCase(irregular);
  if (INVARIABLE.has(key)) return w;
  // œufs / bœufs: replace the ligature so the result matches the "oeuf" spelling.
  if (/œ/i.test(w) && IRREGULAR[key] === undefined && key.endsWith('s')) {
    return singularize(w.replace(/œ/g, 'oe').replace(/Œ/g, 'Oe'));
  }
  if (key.endsWith('ss') || key.endsWith('us') || key.endsWith('is')) return w;

  const cut = (n: number, add = ''): string => w.slice(0, w.length - n) + add;

  // French -eaux → -eau (poireaux, gâteaux, morceaux)
  if (key.endsWith('eaux')) return cut(1);
  if (key.endsWith('x')) return w; // other French -x words are invariable or singular (noix, prix)
  if (!key.endsWith('s')) return w;

  if (key.endsWith('ies')) {
    if (IES_TO_IE.has(key) || key.length <= 4) return cut(1);
    return cut(3, 'y'); // berries → berry
  }
  if (key.endsWith('ches')) return CHES_TO_CH.has(key) ? cut(2) : cut(1); // peaches → peach, leches → leche
  if (key.endsWith('sses')) return SSES_TO_SS.has(key) ? cut(2) : cut(1); // glasses → glass, gousses → gousse
  if (key.endsWith('shes') || key.endsWith('xes') || key.endsWith('zzes')) return cut(2);
  if (key.endsWith('oes')) return OES_TO_OE.has(key) ? cut(1) : cut(2); // tomatoes → tomato
  if (key.endsWith('ones')) return ONES_TO_ONE.has(key) ? cut(1) : cut(2); // limones → limon
  if (key.endsWith('ores')) return ORES_TO_ORE.has(key) ? cut(1) : cut(2); // flores → flor
  if (/[aeo]les$/.test(key)) return LES_TO_LE.has(key) ? cut(1) : cut(2); // frijoles → frijol, nopales → nopal
  return cut(1); // aguacates → aguacate, chiles → chile, olives → olive, oeufs → oeuf
}
