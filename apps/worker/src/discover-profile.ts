// What a household's kitchen says about its taste, for "For you" and "Find me": the recipes it cooked
// and loved (they weigh most), then those saved lately, the creators it follows or cooks from, the foods
// to use within 5 days, and what it said about earlier suggestions (kept or "not for us"). Read with the
// service role, so every query is scoped to the household by hand.
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeText } from '@mesa/shared';

import { CHANNEL_ID } from './channel-url';
import { isoDay, weekdayOf } from './prompt-dates';
import { pantryRows } from './repos/kitchen';
import { normalizeUrl } from './url';
import { isoLanguage } from './youtube-search';

export const DEFAULT_LANGUAGE = 'en';
/** "Expiring soon" for suggestions: a little wider than the app's "use soon" (3 days). */
export const SOON_DAYS = 5;
const MAX_COOKED = 15;
const MAX_RECENT = 8;
const MAX_FOLLOWED = 10;
const MAX_SOON = 12;
const MAX_FEEDBACK = 8;
const MAX_RECIPES = 1000;
const MAX_SUGGESTIONS = 500;
/** Dated foods read for "use within 5 days", soonest first. */
const MAX_PANTRY = 200;
const DAY_MS = 86_400_000;

/** How much a creator is trusted, by what the household did with their videos. */
export const CREATOR_WEIGHT = { cooked: 1, favorite: 0.7, saved: 0.3, followed: 1, kept: 0.5, dismissed: -0.8 } as const;

export interface TasteRecipe {
  title: string;
  creator: string | null;
  minutes: number | null;
}

/** What the model is told about the household. */
export interface TasteProfile {
  /** ISO 639-1: the language most of its recipes are in. */
  language: string;
  /** Cooked or favorite, most recently cooked first. */
  cooked: TasteRecipe[];
  /** Saved lately, not cooked yet. */
  recent: TasteRecipe[];
  followed: string[];
  /** Foods to use within SOON_DAYS, soonest first. */
  soon: { name: string; expiresOn: string }[];
  /** Earlier suggestions kept / dismissed ("title — creator"). */
  liked: string[];
  disliked: string[];
}

/** Links the household already has (normalized like recipes.source_url). */
export interface KnownLinks {
  saved: ReadonlySet<string>;
  /** Every earlier suggestion, whatever its status. */
  suggested: ReadonlySet<string>;
  dismissed: ReadonlySet<string>;
}

export interface Creator {
  channelId: string;
  name: string;
}

/** One thing the household did with a creator's video (summed per creator when ranking). */
export interface CreatorSignal {
  channelId: string | null;
  name: string | null;
  weight: number;
}

export interface Taste {
  profile: TasteProfile;
  known: KnownLinks;
  creators: CreatorSignal[];
  followed: Creator[];
  /** YouTube creators of cooked or favorite recipes, not followed, most trusted first. */
  cookedCreators: Creator[];
}

export interface RecipeRow {
  title: string;
  source_url: string | null;
  source_author: string | null;
  source_channel_id: string | null;
  total_minutes: number | null;
  is_favorite: boolean;
  last_cooked_at: string | null;
  created_at: string;
  /** recipes.original->>language */
  language: string | null;
}

export interface SuggestionRow {
  url: string;
  title: string;
  dish: string | null;
  creator: string | null;
  creator_channel_id: string | null;
  status: 'new' | 'saved' | 'dismissed';
}

export interface PantryRow {
  name_en: string;
  expires_on: string | null;
}

export interface TasteRows {
  recipes: RecipeRow[];
  followed: { channel_id: string; name: string }[];
  pantry: PantryRow[];
  suggestions: SuggestionRow[];
}

const validChannel = (id: string | null | undefined): string | null => (id && CHANNEL_ID.test(id) ? id : null);
const clean = (s: string | null | undefined): string | null => {
  const t = s?.replace(/\s+/g, ' ').trim();
  return t ? t : null;
};

/** The language most recipes are in (ties: the one met first, i.e. the most recent); 'en' when none says. */
export function householdLanguage(languages: readonly (string | null)[]): string {
  const counts = new Map<string, number>();
  for (const raw of languages) {
    const lang = isoLanguage(raw);
    if (lang) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [lang, n] of counts) if (best === null || n > counts.get(best)!) best = lang;
  return best ?? DEFAULT_LANGUAGE;
}

const dayAt = (ms: number): string => isoDay(new Date(ms));

/** Foods to use between today and today + SOON_DAYS, one line per name, soonest first. */
export function soonFoods(rows: readonly PantryRow[], today: Date): TasteProfile['soon'] {
  const from = dayAt(today.getTime());
  const to = dayAt(today.getTime() + SOON_DAYS * DAY_MS);
  const byName = new Map<string, { name: string; expiresOn: string }>();
  for (const r of rows) {
    const name = clean(r.name_en);
    if (!name || !r.expires_on || r.expires_on < from || r.expires_on > to) continue;
    const key = normalizeText(name);
    const seen = byName.get(key);
    if (!seen || r.expires_on < seen.expiresOn) byName.set(key, { name, expiresOn: r.expires_on });
  }
  return [...byName.values()].sort((a, b) => a.expiresOn.localeCompare(b.expiresOn)).slice(0, MAX_SOON);
}

const asTaste = (r: RecipeRow): TasteRecipe => ({ title: r.title, creator: clean(r.source_author), minutes: r.total_minutes });
const feedbackLine = (s: SuggestionRow): string => (s.creator ? `${s.title} — ${s.creator}` : s.title);

function creatorSignals(rows: TasteRows): CreatorSignal[] {
  const signals: CreatorSignal[] = [];
  for (const r of rows.recipes) {
    const name = clean(r.source_author);
    const channelId = validChannel(r.source_channel_id);
    if (!name && !channelId) continue;
    const weight = CREATOR_WEIGHT.saved + (r.last_cooked_at ? CREATOR_WEIGHT.cooked : 0) + (r.is_favorite ? CREATOR_WEIGHT.favorite : 0);
    signals.push({ channelId, name, weight });
  }
  for (const f of rows.followed) signals.push({ channelId: validChannel(f.channel_id), name: clean(f.name), weight: CREATOR_WEIGHT.followed });
  for (const s of rows.suggestions) {
    if (s.status === 'new') continue;
    const weight = s.status === 'saved' ? CREATOR_WEIGHT.kept : CREATOR_WEIGHT.dismissed;
    signals.push({ channelId: validChannel(s.creator_channel_id), name: clean(s.creator), weight });
  }
  return signals;
}

/** The household's taste from its rows (recipes newest first). */
export function buildTaste(rows: TasteRows, today: Date): Taste {
  const cookedRows = rows.recipes
    .filter((r) => r.last_cooked_at !== null || r.is_favorite)
    .sort((a, b) => (b.last_cooked_at ?? '').localeCompare(a.last_cooked_at ?? ''));
  const recentRows = rows.recipes.filter((r) => r.last_cooked_at === null && !r.is_favorite).slice(0, MAX_RECENT);

  const followed: Creator[] = rows.followed.flatMap((f) => {
    const channelId = validChannel(f.channel_id);
    const name = clean(f.name);
    return channelId && name ? [{ channelId, name }] : [];
  });
  const followedIds = new Set(followed.map((f) => f.channelId));
  const cookedCreators = new Map<string, Creator & { weight: number }>();
  for (const r of cookedRows) {
    const channelId = validChannel(r.source_channel_id);
    if (!channelId || followedIds.has(channelId)) continue;
    const seen = cookedCreators.get(channelId);
    const weight = (r.last_cooked_at ? CREATOR_WEIGHT.cooked : 0) + (r.is_favorite ? CREATOR_WEIGHT.favorite : 0) + (seen?.weight ?? 0);
    cookedCreators.set(channelId, { channelId, name: clean(r.source_author) ?? seen?.name ?? channelId, weight });
  }

  const urls = (list: readonly { url: string }[]): Set<string> => new Set(list.map((s) => normalizeUrl(s.url)));
  return {
    profile: {
      language: householdLanguage(rows.recipes.map((r) => r.language)),
      cooked: cookedRows.slice(0, MAX_COOKED).map(asTaste),
      recent: recentRows.map(asTaste),
      followed: followed.slice(0, MAX_FOLLOWED).map((f) => f.name),
      soon: soonFoods(rows.pantry, today),
      liked: rows.suggestions.filter((s) => s.status === 'saved').slice(0, MAX_FEEDBACK).map(feedbackLine),
      disliked: rows.suggestions.filter((s) => s.status === 'dismissed').slice(0, MAX_FEEDBACK).map(feedbackLine),
    },
    known: {
      saved: new Set(rows.recipes.flatMap((r) => (r.source_url ? [normalizeUrl(r.source_url)] : []))),
      suggested: urls(rows.suggestions),
      dismissed: urls(rows.suggestions.filter((s) => s.status === 'dismissed')),
    },
    creators: creatorSignals(rows),
    followed,
    cookedCreators: [...cookedCreators.values()].sort((a, b) => b.weight - a.weight).map(({ channelId, name }) => ({ channelId, name })),
  };
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: { message: string } | null }>, what: string): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(`${what}: ${error.message}`);
  return (data ?? []) as T[];
}

/** Reads the household's rows (four queries at once) and builds its taste. */
export async function loadTaste(db: SupabaseClient, householdId: string, today: Date): Promise<Taste> {
  const [recipes, followed, pantry, suggestions] = await Promise.all([
    rows<RecipeRow>(
      db
        .from('recipes')
        .select('title, source_url, source_author, source_channel_id, total_minutes, is_favorite, last_cooked_at, created_at, language:original->>language')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(MAX_RECIPES),
      'taste recipes',
    ),
    rows<{ channel_id: string; name: string }>(
      db.from('followed_creators').select('channel_id, name').eq('household_id', householdId).eq('platform', 'youtube').order('created_at', { ascending: true }),
      'taste follows',
    ),
    pantryRows(db, householdId, { without: ['out', 'gone'], dated: true, limit: MAX_PANTRY }),
    rows<SuggestionRow>(
      db
        .from('suggestions')
        .select('url, title, dish, creator, creator_channel_id, status')
        .eq('household_id', householdId)
        .order('created_at', { ascending: false })
        .limit(MAX_SUGGESTIONS),
      'taste suggestions',
    ),
  ]);
  return buildTaste({ recipes, followed, pantry, suggestions }, today);
}

const recipeLine = (r: TasteRecipe): string =>
  `- ${r.title}${r.creator ? ` (${r.creator})` : ''}${r.minutes ? `, ${r.minutes} min` : ''}`;

/** The profile as the model reads it. */
export function describeTaste(p: TasteProfile, today: Date): string {
  const section = (title: string, lines: string[]): string => `${title}:\n${lines.length > 0 ? lines.join('\n') : '- none'}`;
  const day = isoDay(today);
  return [
    `Today: ${day} (${weekdayOf(day)})`,
    `Household language: ${p.language}`,
    section('Cooked or favorite recipes (they weigh most, most recent first)', p.cooked.map(recipeLine)),
    section('Saved lately, not cooked yet', p.recent.map(recipeLine)),
    section('Creators they follow', p.followed.map((n) => `- ${n}`)),
    section(`Foods to use within ${SOON_DAYS} days`, p.soon.map((s) => `- ${s.name} (by ${weekdayOf(s.expiresOn)} ${s.expiresOn})`)),
    section('Earlier suggestions they kept', p.liked.map((l) => `- ${l}`)),
    section('Earlier suggestions they said "not for us" to', p.disliked.map((l) => `- ${l}`)),
  ].join('\n\n');
}
