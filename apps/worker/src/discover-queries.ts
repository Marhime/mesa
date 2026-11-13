// The YouTube searches a run makes, written by the model in one call: for the weekly look, ~6 searches
// from what the household really cooks (mostly "in its zone", one "step to the side"); for "Find me", 3
// searches for the wish. Each search is in the language people search that dish in, and some are in the
// household's own language: no country is assumed.
import { nullable, Type, type ModelSchema } from './model-schema';
import { normalizeText } from '@mesa/shared';

import { cleanDish } from './creator-videos';
import { describeTaste, type TasteProfile } from './discover-profile';
import type { JsonRequest } from './gemini';
import { textPart } from './pipeline-common';
import { isoLanguage } from './youtube-search';

export interface SearchQuery {
  /** What is typed in YouTube's search box. */
  q: string;
  /** ISO 639-1 of the query. */
  lang: string;
  /** The dish or theme, in English, a few words. */
  dish: string | null;
}

export const FOR_YOU_QUERIES = 6;
export const FIND_QUERIES = 3;
const MIN_QUERY = 3;
const MAX_QUERY = 80;
export const MAX_WISH = 200;


export const QUERIES_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    queries: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          q: { type: Type.STRING, description: 'The search as typed on YouTube, 2 to 7 words.' },
          lang: { type: Type.STRING, description: 'ISO 639-1 code of the language the search is written in.' },
          dish: nullable({ type: Type.STRING, description: 'The dish or theme searched for, in English, a few words.' }),
        },
        required: ['q', 'lang', 'dish'],
        propertyOrdering: ['q', 'lang', 'dish'],
      },
    },
  },
  required: ['queries'],
};

const COMMON_RULES = `- q: what a person would type in YouTube's search box to find a recipe video: short (2 to 7 words), concrete (a dish, an ingredient, a time), e.g. "cochinita pibil receta", "one pan chicken thighs 30 min", "poulet basquaise recette". No quotes, hashtags, emojis, channel names or search operators.
- lang: the ISO 639-1 code of the language q is written in. Write q in the language people who cook that dish search in (Mexican dishes in Spanish, Thai dishes in Thai or English, French dishes in French…).
- dish: the dish or theme in English, a few words; null when the search is not about one dish.
- Never assume a country: the household's recipes and language are the only hints.`;

export function forYouQueriesSystemPrompt(): string {
  return `You plan YouTube searches that find real recipe videos, by real cooks, for one household of a kitchen app used anywhere in the world. The videos are suggested to them once a week.
Return ${FOR_YOU_QUERIES} searches:
- ${FOR_YOU_QUERIES - 1} "in their zone": dishes, cuisines and styles close to what they cooked or loved (those weigh most), then to what they saved lately. Use foods they must use soon when it fits. Respect their usual cooking times.
- 1 "step to the side": a dish they haven't tried, close to what they like (a neighboring cuisine, the same technique with another protein…), never random.
- Not a dish they already have, nor one like the suggestions they said "not for us" to.
- At least 2 searches in the household language; the others in the dish's own language.
${COMMON_RULES}`;
}

export function findQueriesSystemPrompt(): string {
  return `Someone using a kitchen app (used anywhere in the world) asks for a recipe video. You write the YouTube searches that find real recipe videos, by real cooks, for what they ask.
Return ${FIND_QUERIES} different searches for the wish:
- At least one in the household language; when the wish names or suggests a dish of a cuisine with its own language, at least one in that language.
- Keep what the wish insists on (an ingredient, "spicy", "30 min", "vegetarian"). When it is vague, lean toward what the household cooks.
${COMMON_RULES}`;
}

export function forYouQueriesRequest(profile: TasteProfile, today: Date): JsonRequest {
  return { parts: [textPart(describeTaste(profile, today))], systemInstruction: forYouQueriesSystemPrompt(), schema: QUERIES_SCHEMA };
}

export function findQueriesRequest(wish: string, profile: TasteProfile, today: Date): JsonRequest {
  return {
    parts: [textPart(`Wish: ${wish}\n\n${describeTaste(profile, today)}`)],
    systemInstruction: findQueriesSystemPrompt(),
    schema: QUERIES_SCHEMA,
  };
}

/** A query as typed: one line, no emojis, hashtags, quotes or "ytsearch:" prefix, at most MAX_QUERY. */
export function cleanQuery(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v
    .replace(/^\s*ytsearch\d*:/i, '')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}‍️]/gu, ' ')
    .replace(/#\S+/g, ' ')
    .replace(/["“”«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY)
    .trim();
  return s.length >= MIN_QUERY ? s : null;
}

/** The wish as asked: one line, at most MAX_WISH; '' when empty. */
export const cleanWish = (v: string | null | undefined): string => (v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_WISH);

/** The model's searches as run: readable, each once (case and accents ignored), at most `max`. */
export function normalizeQueries(raw: unknown, max: number, fallbackLang: string): SearchQuery[] {
  const list = (raw as { queries?: unknown } | null)?.queries;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: SearchQuery[] = [];
  for (const item of list as Array<Record<string, unknown> | null>) {
    if (out.length === max) break;
    const q = cleanQuery(item?.q);
    if (!q || seen.has(normalizeText(q))) continue;
    seen.add(normalizeText(q));
    out.push({ q, lang: isoLanguage(item!.lang) ?? fallbackLang, dish: cleanDish(item!.dish) });
  }
  return out;
}

/** Find me always searches: the wish itself when the model gave nothing usable. */
export function findQueries(raw: unknown, wish: string, lang: string): SearchQuery[] {
  const queries = normalizeQueries(raw, FIND_QUERIES, lang);
  if (queries.length > 0) return queries;
  const q = cleanQuery(wish);
  return q ? [{ q, lang, dish: null }] : [];
}
