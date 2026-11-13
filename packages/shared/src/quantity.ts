// Reading quantities ("2", "1,5", "1 1/2", "½", "2-3", "x2", "media docena", "un kilo y medio")
// and units from a token list. Used by parse.ts for grocery input and recipe lines.
import type { Unit } from './types';
import { normalizeText } from './normalize';
import { MAX_UNIT_WORDS, lookupUnit, roundTo } from './units';

const GLYPHS: Record<string, number> = {
  '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅕': 1 / 5, '⅖': 2 / 5, '⅗': 3 / 5,
  '⅘': 4 / 5, '⅙': 1 / 6, '⅚': 5 / 6, '⅛': 1 / 8, '⅜': 3 / 8, '⅝': 5 / 8, '⅞': 7 / 8,
};
const GLYPH_CLASS = '½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞';

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
  deux: 2, trois: 3, quatre: 4, cinq: 5, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
};
/** Indefinite articles that mean "one" when they start an item ("una lechuga", "a can of beans"). */
const ONE_WORDS = new Set(['un', 'una', 'uno', 'a', 'an', 'one', 'une']);
const HALF_WORDS = new Set(['medio', 'media', 'half', 'demi', 'demie']);
const QUARTER_WORDS = new Set(['cuarto', 'quarter', 'quart']);
const THIRD_WORDS = new Set(['tercio', 'third', 'tiers']);
const PAIR_WORDS = new Set(['par', 'couple', 'paire']);
const DOZEN_WORDS = new Set(['docena', 'docenas', 'dozen', 'dozens', 'douzaine', 'douzaines']);
const HALF_DOZEN_WORDS = new Set(['demi-douzaine', 'demi-douzaines', 'media-docena']);
const RANGE_WORDS = new Set(['-', '–', '—', '~', 'a', 'to', 'o', 'or', 'ou', 'al']);
const TIMES_WORDS = new Set(['x', '×', '*']);
const CONNECTORS = new Set(['de', 'del', 'of', 'du', 'des']);
const ARTICLES_AFTER_CONNECTOR = new Set(['la', 'las', 'los', 'el', 'the', 'les']);

/** Names that start like a quantity or unit but are product names ("media crema", "2 bolsas de basura"). */
const PROTECTED_PHRASES = [
  'media crema', 'tres leches', 'half and half', 'half & half', 'bolsa de basura', 'bolsas de basura',
  'bolsa para basura', 'bolsas para basura', 'bolsa de plastico', 'bolsas de plastico', 'bolsas para congelar',
  'bolsas ziploc', 'bolsas hermeticas', 'cinco quesos', 'siete mares',
];

export const norm = (t: string | undefined): string => (t === undefined ? '' : normalizeText(t));

function isProtectedAt(tokens: string[], pos: number): boolean {
  const rest = normalizeText(tokens.slice(pos, pos + 4).join(' '));
  return PROTECTED_PHRASES.some((p) => rest === p || rest.startsWith(`${p} `));
}

const NUM = String.raw`\d+(?:[.,]\d+)?`;
const FRACTION_RE = /^(\d+)\/(\d+)$/;
const DECIMAL_RE = new RegExp(`^${NUM}$`);
const MIXED_GLYPH_RE = new RegExp(`^(\\d+)?([${GLYPH_CLASS}])$`);
const TIMES_RE = new RegExp(`^(?:[x×*](${NUM})|(${NUM})[x×])$`, 'i');
const RANGE_TOKEN_RE = new RegExp(`^(${NUM}|\\d+\\/\\d+|\\d*[${GLYPH_CLASS}])[-–—~](${NUM}|\\d+\\/\\d+|\\d*[${GLYPH_CLASS}])$`);
/** A token that starts with a number glued to a known unit ("500g", "1.5kg", "½kg"). */
const GLUED_RE = new RegExp(`^(${NUM}|\\d+\\/\\d+|\\d*[${GLYPH_CLASS}])([^\\d\\s/].*)$`);

/** Plain number token: "2", "1,5", "1/2", "½", "1½". Null when the token is not one. */
function simpleNumber(token: string): number | null {
  const t = token.replace(/⁄/g, '/');
  if (DECIMAL_RE.test(t)) return Number(t.replace(',', '.'));
  const f = FRACTION_RE.exec(t);
  if (f) {
    const den = Number(f[2]);
    return den === 0 ? null : Number(f[1]) / den;
  }
  const g = MIXED_GLYPH_RE.exec(t);
  if (g) return (g[1] ? Number(g[1]) : 0) + (GLYPHS[g[2]!] ?? 0);
  return null;
}

function isPureFraction(token: string | undefined): number | null {
  if (token === undefined) return null;
  const v = simpleNumber(token);
  return v !== null && v < 1 && !DECIMAL_RE.test(token) ? v : null;
}

/** Numeric token including "(2)", "x2", "2x" and in-token ranges "2-3" (larger wins, "1-1/2" is 1½). */
function numericToken(token: string): number | null {
  const t = token.replace(/^\((.*)\)$/, '$1').replace(/[:,;]$/, '');
  const plain = simpleNumber(t);
  if (plain !== null) return plain;
  const times = TIMES_RE.exec(t);
  if (times) return Number((times[1] ?? times[2])!.replace(',', '.'));
  const range = RANGE_TOKEN_RE.exec(t);
  if (range) {
    const a = simpleNumber(range[1]!);
    const b = simpleNumber(range[2]!);
    if (a === null || b === null) return null;
    if (Number.isInteger(a) && b < 1 && !DECIMAL_RE.test(range[2]!)) return a + b;
    return Math.max(a, b);
  }
  return null;
}

interface NumberRead {
  value: number;
  next: number;
  /** Digits, a glyph, x-form or a dozen: strong enough to be a trailing quantity on its own. */
  strong: boolean;
}

function readNumber(tokens: string[], i: number): NumberRead | null {
  const tok = tokens[i];
  if (tok === undefined) return null;
  const w = norm(tok);

  // "x 2" / "× 2"
  if (TIMES_WORDS.has(w) && tokens[i + 1] !== undefined) {
    const v = numericToken(tokens[i + 1]!);
    if (v !== null) return { value: v, next: i + 2, strong: true };
  }

  const n = numericToken(tok);
  if (n !== null) {
    let value = n;
    let next = i + 1;
    const frac = Number.isInteger(value) && DECIMAL_RE.test(tok) ? isPureFraction(tokens[next]) : null;
    if (frac !== null) {
      value += frac; // "1 1/2", "1 ½"
      next += 1;
    }
    if (RANGE_WORDS.has(norm(tokens[next])) && tokens[next + 1] !== undefined) {
      const second = readNumber(tokens, next + 1);
      if (second !== null && second.value >= value) {
        value = second.value; // "2 a 3", "2 - 3": the larger one
        next = second.next;
      }
    }
    if (TIMES_WORDS.has(norm(tokens[next])) && tokens[next + 1] !== undefined && /^[a-zA-Z]/.test(tokens[next + 1]!)) {
      next += 1; // "2 x leche"
    }
    if (DOZEN_WORDS.has(norm(tokens[next]))) {
      value *= 12;
      next += 1;
    }
    return { value, next, strong: true };
  }

  if (HALF_DOZEN_WORDS.has(w)) return { value: 6, next: i + 1, strong: true };
  if (DOZEN_WORDS.has(w)) return { value: 12, next: i + 1, strong: true };

  if (ONE_WORDS.has(w)) {
    const n1 = norm(tokens[i + 1]);
    if (HALF_DOZEN_WORDS.has(n1)) return { value: 6, next: i + 2, strong: true };
    if (HALF_WORDS.has(n1)) return readHalf(tokens, i + 1);
    if (QUARTER_WORDS.has(n1)) return { value: 0.25, next: i + 2, strong: false };
    if (THIRD_WORDS.has(n1)) return { value: 1 / 3, next: i + 2, strong: false };
    if (PAIR_WORDS.has(n1)) return { value: 2, next: i + 2, strong: false };
    if (DOZEN_WORDS.has(n1)) return { value: 12, next: i + 2, strong: true };
    return { value: 1, next: i + 1, strong: false };
  }
  if (HALF_WORDS.has(w)) return readHalf(tokens, i);

  const word = WORD_NUMBERS[w];
  if (word !== undefined) {
    let value = word;
    let next = i + 1;
    if (RANGE_WORDS.has(norm(tokens[next])) && tokens[next + 1] !== undefined) {
      const second = readNumber(tokens, next + 1);
      if (second !== null && second.value >= value) {
        value = second.value; // "dos o tres"
        next = second.next;
      }
    }
    let strong = false;
    if (DOZEN_WORDS.has(norm(tokens[next]))) {
      value *= 12;
      next += 1;
      strong = true;
    }
    return { value, next, strong };
  }
  return null;
}

/** "medio", "half a", "media docena" (6), "half a dozen" (6). */
function readHalf(tokens: string[], i: number): NumberRead {
  let next = i + 1;
  if (norm(tokens[i]) === 'half' && ONE_WORDS.has(norm(tokens[next]))) next += 1; // "half a"
  if (DOZEN_WORDS.has(norm(tokens[next]))) return { value: 6, next: next + 1, strong: true };
  return { value: 0.5, next, strong: false };
}

interface UnitRead {
  unit: Unit;
  factor: number;
  next: number;
}

/** Longest unit starting at `pos` ("c. à s." is three tokens, "kg" one). */
function readUnit(tokens: string[], pos: number): UnitRead | null {
  if (isProtectedAt(tokens, pos)) return null;
  for (let len = Math.min(MAX_UNIT_WORDS, tokens.length - pos); len >= 1; len--) {
    const phrase = tokens.slice(pos, pos + len).join(' ');
    const u = lookupUnit(phrase.replace(/[:,;]$/, ''));
    if (u) return { unit: u.unit, factor: u.factor, next: pos + len };
  }
  return null;
}

/** "y medio", "y media", "and a half", "et demi(e)" right after a number or unit. */
function readAndAHalf(tokens: string[], pos: number): number | null {
  const a = norm(tokens[pos]);
  const b = norm(tokens[pos + 1]);
  const c = norm(tokens[pos + 2]);
  if ((a === 'y' || a === 'et') && HALF_WORDS.has(b)) return pos + 2;
  if (a === 'and' && (b === 'a' || b === 'one') && c === 'half') return pos + 3;
  return null;
}

export interface QuantityRead {
  /** Quantity in the stored unit (g/ml already converted). */
  quantity: number;
  unit: Unit;
  /** Index after the last token used. */
  end: number;
  /** Index where the unit words started (or -1), so a lone "2 latas" can keep "latas" as its label. */
  unitStart: number;
  /** The number before any unit conversion. */
  count: number;
  strong: boolean;
  hasUnit: boolean;
  hasNumber: boolean;
}

/**
 * Reads "<number> [de] [unit] [y medio]" at `pos`. A mass or volume unit alone means 1
 * ("kilo de tortillas"). Returns null when there is no quantity here.
 */
export function readQuantity(tokens: string[], pos: number): QuantityRead | null {
  if (isProtectedAt(tokens, pos)) return null;
  const num = readNumber(tokens, pos);
  let next = num ? num.next : pos;
  let value = num ? num.value : null;

  let unit = readUnit(tokens, next);
  let unitStart = unit ? next : -1;
  if (!unit && value !== null && CONNECTORS.has(norm(tokens[next]))) {
    const afterDe = readUnit(tokens, next + 1); // "1/4 de kilo"
    if (afterDe && (afterDe.unit === 'g' || afterDe.unit === 'ml')) {
      unit = afterDe;
      unitStart = next + 1;
    }
  }
  if (value === null) {
    if (!unit || (unit.unit !== 'g' && unit.unit !== 'ml')) return null;
    value = 1;
  }
  if (unit) next = unit.next;

  const half = readAndAHalf(tokens, next);
  if (half !== null && value !== null && Number.isInteger(value)) {
    value += 0.5;
    next = half;
  }
  const factor = unit ? unit.factor : 1;
  return {
    quantity: roundTo(value * factor, 3),
    unit: unit ? unit.unit : 'unit',
    end: next,
    unitStart,
    count: value,
    strong: (num?.strong ?? false) || unit !== null,
    hasUnit: unit !== null,
    hasNumber: num !== null,
  };
}

/** "de", "of", "du"…: the word between an amount and what it measures. */
export const isConnector = (token: string | undefined): boolean => CONNECTORS.has(norm(token));

/** Skips "de", "de la", "of", "of the", "du" and turns "d'huile" into "huile". */
export function skipConnectors(tokens: string[], pos: number): string[] {
  let i = pos;
  if (CONNECTORS.has(norm(tokens[i])) && i + 1 < tokens.length) {
    i += 1;
    if (ARTICLES_AFTER_CONNECTOR.has(norm(tokens[i])) && i + 1 < tokens.length) i += 1;
  }
  const rest = tokens.slice(i);
  const first = rest[0];
  if (first !== undefined && /^[dDlL]['’]./.test(first)) rest[0] = first.slice(2);
  return rest;
}

/** Splits whitespace tokens and detaches a number glued to a unit ("500g" → "500", "g"). */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.replace(/⁄/g, '/').split(/\s+/)) {
    if (raw.length === 0) continue;
    const m = GLUED_RE.exec(raw);
    if (m && !TIMES_RE.test(raw) && lookupUnit(m[2]!.replace(/[:,;]$/, '')) !== null) {
      out.push(m[1]!, m[2]!);
    } else {
      out.push(raw);
    }
  }
  return out;
}
