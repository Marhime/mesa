// What an asked job says when it is ready and the person stopped waiting on it. One builder per asked
// kind; `data` lets the app reopen it: `{jobId, kind}`, plus `recipeId` for a translation, a reread or a
// question about a recipe. A missing answer falls back to the kind's readyTitle (@mesa/shared JOB_KINDS).
import { jobKind, type ImportKind, type JobResults } from '@mesa/shared';
import type { PushContent } from './push';

/** The kinds a person asks for and waits on in the app (their answer, if any, in import_jobs.result). */
export type AskedKind = Extract<ImportKind, 'idea' | 'translate' | 'creator' | 'find' | 'plan' | 'ask' | 'reread'>;

/** What an asked kind answers in import_jobs.result: its JobResults entry, or nothing. */
export type AskedResult<K extends AskedKind> = K extends keyof JobResults ? JobResults[K] : null;

type Builder<K extends AskedKind> = (jobId: string, result: AskedResult<K> | null, subjectId: string | null) => PushContent;

const MAX_PUSH_QUERY = 40;
const MAX_PUSH_BODY = 120;
const MAX_PUSH_ANSWER = 60;

/** The text on one line, cut at a word with "…" past `max` characters. */
function cutText(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:.!?-]+$/, '')}…`;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;
const withRecipe = (subjectId: string | null): { recipeId?: string } => (subjectId ? { recipeId: subjectId } : {});

const READY: { [K in AskedKind]: Builder<K> } = {
  /** "Food is Love: 2 recipes to pick". */
  creator: (jobId, r) => {
    const n = r?.videos.filter((v) => !v.saved).length ?? 0;
    const who = r?.creator.name ?? jobKind('creator').readyTitle;
    return {
      title: n > 0 ? `${who}: ${plural(n, 'recipe', 'recipes')} to pick` : `${who}: nothing new`,
      body: n > 0 ? 'Tick the ones you want to save.' : 'You already have their latest recipes.',
      data: { jobId, kind: 'creator' },
    };
  },
  /** "Ideas for the tomatoes", the dishes in the body. */
  idea: (jobId, r) => {
    const titles = (r?.ideas ?? []).map((i) => i.title).slice(0, 3);
    return {
      title: r?.food ? `Ideas for ${r.food}` : (jobKind('idea').readyTitle ?? ''),
      body: titles.length > 0 ? titles.join(' · ') : 'Dishes that use it',
      data: { jobId, kind: 'idea' },
    };
  },
  translate: (jobId, _r, subjectId) => ({
    title: jobKind('translate').readyTitle ?? '',
    body: 'Ready to read in your language.',
    data: { jobId, kind: 'translate', ...withRecipe(subjectId) },
  }),
  /** Find me: "Found 3 videos for “spicy chicken”", the dishes in the body. */
  find: (jobId, r) => {
    const raw = r?.query.trim() ?? '';
    const query = raw.length > MAX_PUSH_QUERY ? `${raw.slice(0, MAX_PUSH_QUERY - 1).trimEnd()}…` : raw;
    const dishes = (r?.videos ?? []).map((v) => v.dish ?? v.title).slice(0, 3);
    return {
      title: r ? `Found ${plural(r.videos.length, 'video', 'videos')}${query ? ` for “${query}”` : ''}` : (jobKind('find').readyTitle ?? ''),
      body: dishes.length > 0 ? dishes.join(' · ') : 'Real recipe videos to pick from.',
      data: { jobId, kind: 'find' },
    };
  },
  /** Plan my week: "Your week: 4 dinners", the dinners in the body. */
  plan: (jobId, r) => {
    const titles = (r?.dinners ?? []).map((d) => d.title);
    return {
      title: `${jobKind('plan').readyTitle}: ${plural(titles.length, 'dinner', 'dinners')}`,
      body: titles.length > 0 ? cutText(titles.join(' · '), MAX_PUSH_BODY) : 'Pick the dinners you want.',
      data: { jobId, kind: 'plan' },
    };
  },
  /** Ask Mesa: the start of the answer; `recipeId` when it was about a recipe (the app reopens it there). */
  ask: (jobId, r, subjectId) => {
    const answer = typeof r?.answer === 'string' ? r.answer : '';
    return {
      title: jobKind('ask').readyTitle ?? '',
      body: answer ? cutText(answer, MAX_PUSH_ANSWER) : 'Your answer is ready.',
      data: { jobId, kind: 'ask', ...withRecipe(subjectId) },
    };
  },
  /** Redo ingredients: how many lines were read again and linked; `recipeId` reopens the recipe. */
  reread: (jobId, r, subjectId) => {
    const lines = r?.lines ?? 0;
    return {
      title: jobKind('reread').readyTitle ?? '',
      body: lines > 0 ? `${plural(lines, 'line', 'lines')} read again, ${r?.linked ?? 0} linked to your kitchen.` : 'Read again with the new rules.',
      data: { jobId, kind: 'reread', ...withRecipe(subjectId) },
    };
  },
};

/** The ready push of an asked job (`result` as stored in import_jobs.result). */
export function askedReadyPush<K extends AskedKind>(kind: K, jobId: string, result: unknown, subjectId: string | null): PushContent {
  return (READY[kind] as Builder<K>)(jobId, (result ?? null) as AskedResult<K> | null, subjectId);
}
