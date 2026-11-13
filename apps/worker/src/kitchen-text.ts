// Small helpers the kitchen jobs (plan, ask) share: cleaning what a model wrote, amounts in the app's
// unit codes, servings asked in any language and amounts scaled to them (here, never by a model), word
// keys for matching, short recipe refs ("R3") a model copies more reliably than ids, and the prompt's
// date and language lines. Pure.
import { scaleQuantity, type Unit } from '@mesa/shared';

import { normalizeQuantity, phraseKey } from './mapping';

/** The unit codes stored in the database (docs/CONTRACT.md). */
export const UNIT_CODES: readonly Unit[] = ['g', 'ml', 'unit', 'tbsp', 'tsp', 'cup', 'can', 'bunch', 'pack', 'clove', 'pinch', 'slice'];
const UNIT_SET: ReadonlySet<string> = new Set(UNIT_CODES);

/** A model string on one line, trimmed and cut to `max` characters; '' for anything else. */
export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
}

/** cleanText, or null when nothing is left. */
export const cleanOrNull = (v: unknown, max: number): string | null => cleanText(v, max) || null;

/** Strings of a model array, cleaned, without empties. */
export const cleanList = (v: unknown, max: number): string[] => (Array.isArray(v) ? v.map((x) => cleanText(x, max)).filter((x) => x !== '') : []);

// Words of 3+ letters that say nothing about a dish (normalized and singular, en/es/fr): left out of word keys.
const FILLER: ReadonlySet<string> = new Set([
  'the', 'and', 'with', 'for', 'from', 'your', 'our', 'avec', 'pour', 'sans', 'les', 'des', 'une', 'con', 'para', 'sin',
  'los', 'las', 'una', 'del', 'por', 'recipe', 'recette', 'receta', 'easy', 'facile', 'facil', 'quick', 'rapide', 'rapido',
  'best', 'homemade', 'maison', 'casero', 'casera', 'style', 'minute', 'min',
].map(phraseKey));

/** Normalized, singular words of 3+ letters minus filler: what titles, wishes and questions are matched on. */
export function keyWords(text: string): Set<string> {
  return new Set(phraseKey(text).split(' ').filter((w) => w.length >= 3 && !FILLER.has(w)));
}

/**
 * A model's amount in the app's units: a unit code as is, anything else through parseUnit (mass → g,
 * volume → ml, converted), no unit → "unit"; null quantity (and unit) when unknown or not positive.
 */
export function toAmount(quantity: unknown, unit: unknown): { quantity: number | null; unit: Unit | null } {
  const q = typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0 ? quantity : null;
  if (q === null) return { quantity: null, unit: null };
  const text = typeof unit === 'string' ? unit.trim() : '';
  const amount = UNIT_SET.has(text.toLowerCase()) ? { quantity: q, unit: text.toLowerCase() as Unit } : normalizeQuantity(q, text === '' ? null : text);
  const tidy = tidyAmount(amount.quantity, amount.unit);
  return { quantity: tidy, unit: tidy === null ? null : amount.unit };
}

/** A scaled or converted amount, rounded the way a cook reads it: whole g / ml from 10 up, else 2 decimals. */
export function tidyAmount(q: number | null, unit: Unit | null): number | null {
  if (q === null || !Number.isFinite(q) || q <= 0) return null;
  const r = (unit === 'g' || unit === 'ml') && q >= 10 ? Math.round(q) : Math.round(q * 100) / 100;
  return r > 0 ? r : null;
}

const MAX_SERVINGS = 50;

export interface ServingsAsked {
  servings: number;
  /** Nothing else was asked ("for 2", "pour 4 personnes ?"): only the amounts change. */
  only: boolean;
}

const PEOPLE = String.raw`(?:people|persons?|servings?|portions?|guests?|personnes?|pers\.?|invit[eé]s|personas?|porci[oó]n(?:es)?|raciones?|comensales|invitados|porzioni|persone|ospiti|personen|portionen|g[aä]ste)`;
// "for 20 minutes", "por 2 horas", "for 2 days", "per 100 g", "at 180°": a number, but not of people.
const NOT_PEOPLE = String.raw`(?!\d)(?!\s*(?:min\b|mins|minutes?|minutos?|minuti|h\b|hrs?|hours?|heures?|horas?|ore\b|stunden?|days?|jours?|d[ií]as?|giorni|tagen?|weeks?|semaines?|semanas?|settimane|°|degrees?|degr[eé]s|grados?|gradi|g\b|grams?|grammes?|gramos?|kg|ml|l\b|oz|lbs?|%))`;
const ASKED_SERVINGS: readonly RegExp[] = [
  new RegExp(String.raw`(?:^|[\s,(¿¡])(?:for|pour|para|por|per|für|fur|voor)\s+(\d{1,2})${NOT_PEOPLE}(?:\s*${PEOPLE}(?![\p{L}]))?`, 'iu'),
  new RegExp(String.raw`(?:^|[\s,(¿¡])(\d{1,2})\s*${PEOPLE}(?![\p{L}])`, 'iu'),
  /^\s*(\d{1,2})\s*$/,
];

/** "for 2", "pour 4 personnes", "¿para 2?", "2 servings", "6": the servings asked, or null. */
export function servingsAsked(text: string): ServingsAsked | null {
  for (const re of ASKED_SERVINGS) {
    const m = re.exec(text);
    if (!m) continue;
    const servings = Number(m[1]);
    if (!(servings >= 1 && servings <= MAX_SERVINGS)) return null;
    const rest = text.slice(0, m.index) + text.slice(m.index + m[0].length);
    return { servings, only: rest.replace(/[\s,.;:!?¿¡()-]+/g, '') === '' };
  }
  return null;
}

/** An amount for other servings, scaled with scaleQuantity (unchanged when they are the same). */
export function scaledAmount(o: { quantity: number | null; unit: Unit | null }, from: number, to: number): { quantity: number | null; unit: Unit | null } {
  if (from === to || o.quantity === null) return { quantity: o.quantity, unit: o.unit };
  return { quantity: tidyAmount(scaleQuantity(o.quantity, from, to), o.unit), unit: o.unit };
}

/** At most `max` words: cut at the last sentence end when that keeps most of it, else with "…". */
export function limitWords(text: string, max: number): string {
  const words = text.split(' ');
  if (words.length <= max) return text;
  const cut = words.slice(0, max).join(' ');
  const end = Math.max(...['. ', '! ', '? ', '… '].map((p) => cut.lastIndexOf(p)));
  return end >= cut.length / 2 ? cut.slice(0, end + 1) : `${cut.replace(/[\s,;:.]+$/, '')}…`;
}

/** Short refs for the recipes in a prompt, resolved back to ids. */
export interface RecipeRefs {
  ref(id: string): string;
  /** "R3", "r3" or "3" → the third id; one of the ids as is; anything else → null. */
  resolve(raw: unknown): string | null;
}

export function recipeRefs(ids: readonly string[]): RecipeRefs {
  const refOf = new Map(ids.map((id, i) => [id, `R${i + 1}`]));
  return {
    ref: (id) => refOf.get(id) ?? id,
    resolve: (raw) => {
      if (typeof raw !== 'string') return null;
      const text = raw.trim();
      const n = /^r?(\d{1,4})$/i.exec(text);
      if (n) return ids[Number(n[1]) - 1] ?? null;
      return refOf.has(text) ? text : null;
    },
  };
}

/** Whole days since an ISO time (0 = today), or null. */
export function daysSince(iso: string | null, today: Date): number | null {
  const t = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(t) ? Math.max(0, Math.floor((today.getTime() - t) / 86_400_000)) : null;
}

export { todayLine } from './prompt-dates';

/** "Spanish (es)" for an ISO 639-1 code; null when there is none. */
export function languageName(lang: string | null): string | null {
  if (!lang || !/^[a-z]{2}$/.test(lang)) return null;
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang);
    return name && name !== lang ? `${name} (${lang})` : lang;
  } catch {
    return lang;
  }
}
