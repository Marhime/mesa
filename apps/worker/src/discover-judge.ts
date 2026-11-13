// One question to the model for every video a run kept: is it a real recipe video (someone cooking a dish
// you could cook from — not a vlog, a compilation, a mukbang or a clickbait "hack")? What dish, which
// cuisine, which language, how well does it fit, and — always — one short line on why, tied to something
// true about the household ("Like the tinga you made", "Uses the poblanos before Friday").
import { nullable, Type, type ModelSchema } from './model-schema';

import type { Candidate } from './discover-candidates';
import { describeTaste, type TasteProfile } from './discover-profile';
import { cleanDish } from './creator-videos';
import type { JsonRequest } from './gemini';
import { textPart } from './pipeline-common';
import { isoLanguage } from './youtube-search';

export interface Verdict {
  dish: string | null;
  /** In English ("Mexican", "Thai"); null when it doesn't say. */
  cuisine: string | null;
  /** ISO 639-1 of the video. */
  language: string | null;
  /** 0 (doesn't fit) to 1 (exactly what they'd cook / asked for). */
  fit: number;
  why: string;
}

export const MAX_WHY = 80;
const MAX_CUISINE = 40;
const MAX_PROMPT_DESCRIPTION = 250;
const MIN_WHY = 4;


export const JUDGE_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    videos: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'The video id, exactly as given.' },
          recipe: { type: Type.BOOLEAN, description: 'True only for a real recipe video someone could cook from.' },
          dish: nullable({ type: Type.STRING, description: 'The dish in a few words, in the language of the title.' }),
          cuisine: nullable({ type: Type.STRING, description: 'The cuisine in English, one or two words.' }),
          language: nullable({ type: Type.STRING, description: 'ISO 639-1 code of the language spoken or written in the video.' }),
          fit: { type: Type.INTEGER, description: '1 (does not fit) to 5 (fits perfectly).' },
          why: { type: Type.STRING, description: 'One short line on why it fits, in English.' },
        },
        required: ['id', 'recipe', 'dish', 'cuisine', 'language', 'fit', 'why'],
        propertyOrdering: ['id', 'recipe', 'dish', 'cuisine', 'language', 'fit', 'why'],
      },
    },
  },
  required: ['videos'],
};

export function judgeSystemPrompt(wish: boolean): string {
  const fit = wish
    ? 'fit: 1 to 5, how well it matches the wish first (what it insists on: an ingredient, a time, "spicy"…), then the household\'s taste. 1 or 2 when it misses what the wish insists on.'
    : 'fit: 1 to 5, how well it fits what this household cooks and loves (cooked and favorite recipes weigh most), its usual cooking times and the foods it must use soon. 1 for something like a suggestion they said "not for us" to.';
  return `You check YouTube videos for a household kitchen app used anywhere in the world. Only real recipe videos by real cooks may be shown.
For every video given (id, title, channel, minutes, views, upload month, the start of its description, how it was found), answer once with its id exactly as given:
- recipe: true only when the video shows a person cooking a dish (or a short menu) from start to finish that someone could cook from. False for vlogs, Q&As, compilations or "top 10" lists, mukbangs and eating shows, reviews and taste tests, challenges, reactions, shopping hauls, kitchen tours, clickbait "hacks", ASMR without cooking, and channels that look AI-generated or reuploaded.
- dish: the dish in 2 to 6 words, in the language of the title, no emojis or clickbait words.
- cuisine: in English, one or two words ("Mexican", "Thai", "Home-style American"); null when it can't be told.
- language: the ISO 639-1 code of the language of the video (from its title and description).
- ${fit}
- why: one short line (at most 60 characters, in English) on why this household would want it, tied to something TRUE from the household's profile${wish ? ' or the wish' : ''}: a dish they cooked ("Like the tinga you made"), a creator they follow or cook from ("From Food is Love, who you follow"), a food to use soon ("Uses the poblanos before Friday"), their usual times ("30 min, like your weeknight dinners"). Never invent a fact (no "you made it twice" unless the profile says so), no hype words.`;
}

const minutes = (s: number | null): number | null => (s === null ? null : Math.max(1, Math.round(s / 60)));
const month = (ts: number | null): string | null => (ts === null ? null : new Date(ts * 1000).toISOString().slice(0, 7));
const foundBy = (c: Candidate): string =>
  c.origin.kind === 'search' ? `search "${c.origin.query}"` : c.origin.kind === 'followed' ? 'a creator they follow' : 'a creator they cooked from';

export function judgeUserPrompt(profile: TasteProfile, candidates: readonly Candidate[], wish: string | null, today: Date): string {
  const list = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    channel: c.channel,
    minutes: minutes(c.duration),
    views: c.views,
    uploaded: month(c.uploadedAt),
    ...(c.description ? { description: c.description.slice(0, MAX_PROMPT_DESCRIPTION) } : {}),
    found_by: foundBy(c),
  }));
  const head = wish ? `Wish: ${wish}\n\n` : '';
  return `${head}${describeTaste(profile, today)}\n\nVideos:\n${JSON.stringify(list, null, 1)}`;
}

export function judgeRequest(profile: TasteProfile, candidates: readonly Candidate[], wish: string | null, today: Date): JsonRequest {
  return { parts: [textPart(judgeUserPrompt(profile, candidates, wish, today))], systemInstruction: judgeSystemPrompt(wish !== null), schema: JUDGE_SCHEMA };
}

const line = (v: unknown, max: number): string =>
  typeof v === 'string'
    ? v
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^["'“”]+|["'“”]+$/g, '')
        .trim()
        .slice(0, max)
        .trim()
    : '';

/** A why as shown: one line, no surrounding quotes, at most MAX_WHY characters; '' when unusable. */
export const cleanWhy = (v: unknown): string => {
  const s = line(v, MAX_WHY);
  return s.length >= MIN_WHY ? s : '';
};

/** 1–5 → 0–1; anything else counts as the middle. */
export function fitScore(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0.5;
  return (Math.min(5, Math.max(1, Math.round(v))) - 1) / 4;
}

/**
 * The model's answer as kept: id → verdict for each video asked about that it calls a real recipe and
 * gives a why for (first answer wins). Null when the answer has no list at all (unreadable).
 */
export function normalizeVerdicts(raw: unknown, asked: ReadonlySet<string>): Map<string, Verdict> | null {
  const list = (raw as { videos?: unknown } | null)?.videos;
  if (!Array.isArray(list)) return null;
  const verdicts = new Map<string, Verdict>();
  const answered = new Set<string>();
  for (const item of list as Array<Record<string, unknown> | null>) {
    const id = typeof item?.id === 'string' ? item.id.trim() : '';
    if (!asked.has(id) || answered.has(id)) continue;
    answered.add(id);
    const why = cleanWhy(item!.why);
    if (item!.recipe !== true || why === '') continue;
    const cuisine = line(item!.cuisine, MAX_CUISINE);
    verdicts.set(id, {
      dish: cleanDish(item!.dish),
      cuisine: cuisine === '' ? null : cuisine,
      language: isoLanguage(item!.language),
      fit: fitScore(item!.fit),
      why,
    });
  }
  return verdicts;
}
