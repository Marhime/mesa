// A recipe's title and steps in another language, asked for from the recipe screen. Written once per
// (recipe, language) in recipe_translations. Numbers are what a translation must never get wrong: a step
// whose digits changed keeps its original text.
import { Type, type ModelSchema } from './model-schema';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImportJob, RecipeTranslation } from '@mesa/shared';

import { ImportError, MESSAGES } from './errors';
import type { Logger } from './log';
import { textPart } from './pipeline-common';
import type { TranslateDeps } from './ports';

const LANG = /^[a-z]{2}$/;

const TRANSLATE_SCHEMA: ModelSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    steps: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'One translated step per step given, same order.' },
  },
  required: ['title', 'steps'],
  propertyOrdering: ['title', 'steps'],
};

/** The target language from the job: ISO 639-1, two lowercase letters, else null. */
export function targetLang(text: string | null | undefined): string | null {
  const lang = (text ?? '').trim().toLowerCase();
  return LANG.test(lang) ? lang : null;
}

/** Every run of digits, sorted: "Bake 25 min at 180 °C" and "180 °C, 25 min" have the same numbers. */
export function digitRuns(text: string): string[] {
  return (text.match(/\d+/g) ?? []).sort();
}

export function sameNumbers(source: string, translated: string): boolean {
  const a = digitRuns(source);
  const b = digitRuns(translated);
  return a.length === b.length && a.every((d, i) => d === b[i]);
}

/** The translated text, or the original when the translation is empty or changed a number. */
export function guardText(source: string, translated: unknown): { text: string; kept: boolean } {
  const t = typeof translated === 'string' ? translated.replace(/\s+/g, ' ').trim() : '';
  return t !== '' && sameNumbers(source, t) ? { text: t, kept: false } : { text: source, kept: true };
}

export interface GuardedTranslation {
  title: string;
  steps: string[];
  /** Steps that kept their original text. */
  kept: number;
}

/**
 * Checks the model's answer step by step. One answer step per source step is required: steps can't be
 * matched otherwise, so a different count is a failure (nothing is stored, the person can try again).
 */
export function guardTranslation(source: { title: string; steps: readonly string[] }, raw: unknown): GuardedTranslation {
  const answer = (raw ?? {}) as { title?: unknown; steps?: unknown };
  const steps = Array.isArray(answer.steps) ? answer.steps : null;
  if (!steps || steps.length !== source.steps.length) {
    throw new ImportError('translateFailed', { detail: `steps ${steps?.length ?? 'missing'}/${source.steps.length}` });
  }
  const guarded = source.steps.map((s, i) => guardText(s, steps[i]));
  return {
    title: guardText(source.title, answer.title).text.slice(0, 300),
    steps: guarded.map((g) => g.text),
    kept: guarded.filter((g) => g.kept).length,
  };
}

function languageName(lang: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(lang);
    return name && name !== lang ? `${name} (${lang})` : lang;
  } catch {
    return lang;
  }
}

export function translateSystemPrompt(lang: string): string {
  const language = languageName(lang);
  return `You translate a cooking recipe for a household kitchen app. Translate the title and every step into ${language}.
- Return exactly one translated step for each step given, in the same order. Never merge, split, add or drop steps.
- Keep every number, amount, unit and temperature as the source writes it: same digits, never converted (no cups to millilitres, no °F to °C), never rounded, never spelled out in words. Unit words may be translated; symbols stay as they are ("g", "ml", "°C").
- Translate faithfully: no tips, no changes to the recipe. A step already in ${language} stays as it is.`;
}

interface Source {
  title: string;
  steps: string[];
}

async function alreadyTranslated(db: SupabaseClient, recipeId: string, lang: string): Promise<boolean> {
  const { data, error } = await db.from('recipe_translations').select('recipe_id').eq('recipe_id', recipeId).eq('lang', lang).maybeSingle();
  if (error) throw new Error(`recipe_translations: ${error.message}`);
  return data !== null;
}

async function loadRecipe(db: SupabaseClient, job: ImportJob, recipeId: string): Promise<Source> {
  const { data: recipe, error } = await db
    .from('recipes')
    .select('title')
    .eq('id', recipeId)
    .eq('household_id', job.household_id)
    .maybeSingle();
  if (error) throw new Error(`recipe: ${error.message}`);
  if (!recipe) throw new ImportError('translateFailed', { detail: 'recipe not found' });
  const { data: steps, error: stepsError } = await db.from('recipe_steps').select('text').eq('recipe_id', recipeId).order('position');
  if (stepsError) throw new Error(`recipe_steps: ${stepsError.message}`);
  return { title: (recipe as { title: string }).title, steps: ((steps ?? []) as { text: string }[]).map((s) => s.text) };
}

/** Writes the translation unless it exists already. */
export async function runTranslate(deps: TranslateDeps, job: ImportJob, log: Logger, signal: AbortSignal): Promise<void> {
  const lang = targetLang(job.input_text);
  if (!job.subject_id || !lang) throw new ImportError('translateFailed', { detail: `recipe ${job.subject_id ?? 'missing'}, lang ${job.input_text ?? 'missing'}` });
  if (await alreadyTranslated(deps.db, job.subject_id, lang)) {
    log.info('translate_cached', { lang });
    return;
  }
  const source = await loadRecipe(deps.db, job, job.subject_id);
  const raw = await deps.ai.askJson(
    { parts: [textPart(JSON.stringify(source))], systemInstruction: translateSystemPrompt(lang), schema: TRANSLATE_SCHEMA },
    'translate_recipe',
    signal,
  );
  const guarded = guardTranslation(source, raw);
  if (signal.aborted) throw signal.reason;
  const row: RecipeTranslation = { recipe_id: job.subject_id, lang, title: guarded.title, steps: guarded.steps };
  const { error } = await deps.db.from('recipe_translations').upsert(row, { onConflict: 'recipe_id,lang' });
  if (error) throw new Error(`recipe_translations write: ${error.message}`);
  log.info('translate_done', { lang, steps: guarded.steps.length, kept_original: guarded.kept });
}
