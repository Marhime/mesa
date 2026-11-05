// Recipe times: ISO 8601 durations from schema.org ("PT1H30M") and loose human text ("1 hora 20 min").

const MAX_MINUTES = 7 * 24 * 60;

const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
const ISO = new RegExp(
  `^P(?:${NUM}Y)?(?:${NUM}M)?(?:${NUM}W)?(?:${NUM}D)?(?:T(?:${NUM}H)?(?:${NUM}M)?(?:${NUM}S)?)?$`,
  'i',
);

const num = (s: string | undefined): number => (s === undefined ? 0 : Number(s.replace(',', '.')));

function finish(minutes: number): number | null {
  if (!Number.isFinite(minutes)) return null;
  const rounded = Math.round(minutes);
  return rounded > 0 && rounded <= MAX_MINUTES ? rounded : null;
}

/** "PT1H30M" → 90, "P0DT45M" → 45, "PT90S" → 2, "P30M" (a common mistake) → 30; null when unusable. */
export function parseIsoDuration(value: string): number | null {
  const s = value.trim().replace(/\s+/g, '');
  const m = ISO.exec(s);
  if (!m || s.toUpperCase() === 'P' || s.toUpperCase() === 'PT') return null;
  const [, y, mo, w, d, h, mi, sec] = m;
  if (num(y) > 0) return null;
  const hasTime = /T/i.test(s);
  let months = num(mo);
  let minutes = num(mi);
  if (months > 0) {
    // Months make no sense for a recipe; without a time part they are minutes written wrong.
    if (hasTime || w !== undefined || d !== undefined) return null;
    minutes += months;
    months = 0;
  }
  return finish(num(w) * 7 * 24 * 60 + num(d) * 24 * 60 + num(h) * 60 + minutes + num(sec) / 60);
}

const HOUR_WORDS = /^(?:h|hr|hrs|hour|hours|hora|horas|heure|heures)$/i;
const MIN_WORDS = /^(?:m|min|mins|minute|minutes|minuto|minutos|mn)$/i;

/** "1 hour 30 minutes", "1h30", "45 min", "1 hora y 20 minutos" → minutes. */
export function parseHumanDuration(value: string): number | null {
  const s = value.toLowerCase().replace(/,/g, '.');
  let total = 0;
  let found = false;
  const re = /(\d+(?:\.\d+)?)\s*([a-zé]+)?/g;
  let m: RegExpExecArray | null;
  let lastWasHour = false;
  while ((m = re.exec(s)) !== null) {
    const n = Number(m[1]);
    const word = m[2] ?? '';
    if (HOUR_WORDS.test(word)) {
      total += n * 60;
      found = true;
      lastWasHour = true;
    } else if (MIN_WORDS.test(word)) {
      total += n;
      found = true;
      lastWasHour = false;
    } else if (word === '' && lastWasHour) {
      total += n; // "1h30"
      lastWasHour = false;
    } else {
      lastWasHour = false;
    }
  }
  return found ? finish(total) : null;
}

/** Any schema.org time value: ISO string, human string or a plain number of minutes. */
export function parseDurationMinutes(value: unknown): number | null {
  if (typeof value === 'number') return finish(value);
  if (typeof value !== 'string' || value.trim() === '') return null;
  const t = value.trim();
  if (/^P/i.test(t)) return parseIsoDuration(t);
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return finish(num(t));
  return parseHumanDuration(t);
}

/** totalTime, else prepTime + cookTime (+ performTime) when any of them is readable. */
export function recipeTotalMinutes(recipe: {
  totalTime?: unknown;
  prepTime?: unknown;
  cookTime?: unknown;
  performTime?: unknown;
}): number | null {
  const total = parseDurationMinutes(recipe.totalTime);
  if (total !== null) return total;
  const parts = [recipe.prepTime, recipe.cookTime, recipe.performTime].map(parseDurationMinutes);
  if (parts.every((p) => p === null)) return null;
  return finish(parts.reduce<number>((sum, p) => sum + (p ?? 0), 0));
}
