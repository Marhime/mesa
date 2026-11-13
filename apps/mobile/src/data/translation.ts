// "Read in Español": a recipe written in another language than the phone's can be read in the phone's.
// A stored translation (recipe_translations) is used at once; otherwise the worker is asked (a
// 'translate' job) and writes one. "Show original" goes back. Leaving the recipe while it translates
// keeps the job going: the working bar shows it, a toast or a push says when it's ready.
import { capitalize } from '@mesa/shared';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { askMessage } from './askOutcome';
import { friendlyError } from './errors';
import { translationKey } from './keys';
import type { Notify } from './notice';
import { askForPushOnce } from './push';
import { must, supabase } from './supabase';
import { useWorkerAsk } from './workerAsk';

const FAILED = "Couldn't translate it. Try again.";

/** Names for when the phone can't say a language's name in that language. */
const NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
  nl: 'Nederlands',
  ca: 'Català',
  pl: 'Polski',
  sv: 'Svenska',
  da: 'Dansk',
  nb: 'Norsk',
  tr: 'Türkçe',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
};

/** The phone's language, "es" (ISO 639-1); null when it can't be read. */
export function phoneLanguage(): string | null {
  try {
    const lang = Intl.DateTimeFormat().resolvedOptions().locale.split(/[-_]/)[0]?.toLowerCase();
    return lang && /^[a-z]{2}$/.test(lang) ? lang : null;
  } catch {
    return null;
  }
}

/** A language named in itself, capitalized: "es" → "Español". */
export function languageName(lang: string): string {
  try {
    const DisplayNames = (Intl as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames;
    const name = DisplayNames ? new DisplayNames([lang], { type: 'language' }).of(lang) : undefined;
    if (name && name.toLowerCase() !== lang) return capitalize(name);
  } catch {
    // older Intl: the table below
  }
  return NAMES[lang] ?? lang.toUpperCase();
}

export interface Translated {
  title: string;
  steps: string[];
}

async function fetchTranslation(recipeId: string, lang: string): Promise<Translated | null> {
  const row = must(
    await supabase.from('recipe_translations').select('title, steps').eq('recipe_id', recipeId).eq('lang', lang).maybeSingle(),
  ) as { title: string; steps: unknown } | null;
  if (!row) return null;
  const steps = Array.isArray(row.steps) ? row.steps.filter((s): s is string => typeof s === 'string') : [];
  return { title: row.title, steps };
}

/** The button near the steps: "Read in Español" or "Show original"; `working` while it is being translated. */
export interface TranslateControl {
  label: string;
  onPress: () => void;
  working: boolean;
}

/**
 * Translation of a recipe into the phone's language, on request (or from the start: `startTranslated`,
 * when opened from "Tinga is translated"). `translated` is what to show instead of the original (null =
 * the original); `control` is null when the recipe is already in the phone's language or its language is
 * unknown. A failure says so through `notify` and stays on the original.
 */
export function useRecipeTranslation(
  recipe: { id: string; language: string | null } | undefined,
  notify: Notify,
  startTranslated = false,
) {
  const lang = phoneLanguage();
  const source = recipe?.language?.toLowerCase() ?? null;
  const available = !!recipe && !!lang && !!source && source !== lang;
  const [wanted, setWanted] = useState(startTranslated);
  const ask = useWorkerAsk('translate');
  const { ask: askFor, reset } = ask;
  const recipeId = recipe?.id ?? null;
  // Read again once the worker has answered (a new key, so "not there yet" is never mistaken for its answer).
  const answered = ask.phase === 'done' ? (ask.job?.id ?? null) : null;
  const stored = useQuery({
    queryKey: translationKey(recipeId ?? '', lang ?? '', answered ?? 'stored'),
    enabled: available && wanted,
    queryFn: () => fetchTranslation(recipeId!, lang!),
  });

  // Not translated yet: ask the worker (a job asking the same that is working or done is reused).
  const needAsk = available && wanted && !answered && stored.data === null && !stored.isFetching && ask.phase === 'idle';
  useEffect(() => {
    if (needAsk && recipeId && lang) askFor({ subjectId: recipeId, input: lang, reuseDone: true });
  }, [needAsk, recipeId, lang, askFor]);

  // Why it can't be shown, once that is sure (a read in flight, a retry or the read after the answer, is not yet).
  const settled = !stored.isFetching;
  const failure: string | null = !wanted
    ? null
    : ask.askError
      ? friendlyError(ask.askError, FAILED)
      : stored.fetchStatus === 'paused' && stored.data === undefined
        ? friendlyError(new Error('offline'), FAILED)
        : ask.phase === 'failed'
          ? askMessage(ask, false, { notAsked: FAILED, failed: FAILED, empty: FAILED })
          : (settled && stored.isError) || (settled && !!answered && stored.isSuccess && stored.data === null)
            ? FAILED
            : null;
  // Said once: the failure turns it off, so the next render has none.
  const say = useRef(notify);
  say.current = notify;
  useEffect(() => {
    if (!failure) return;
    say.current(failure, { tone: 'error' });
    setWanted(false);
    reset();
  }, [failure, reset]);

  // Cancelled from the working bar: back to the original, nothing to say.
  const cancelled = wanted && ask.phase === 'cancelled';
  useEffect(() => {
    if (!cancelled) return;
    setWanted(false);
    reset();
  }, [cancelled, reset]);

  const translated = wanted && stored.data ? stored.data : null;
  const working = available && wanted && !translated && failure === null;
  // Left while it translates: the moment to offer telling them when it's ready.
  const leftWorking = useRef(working);
  leftWorking.current = working;
  useEffect(
    () => () => {
      if (leftWorking.current) askForPushOnce();
    },
    [],
  );

  const control: TranslateControl | null = available
    ? {
        label: translated ? 'Show original' : `Read in ${languageName(lang!)}`,
        onPress: () => setWanted((w) => !w),
        working,
      }
    : null;
  return { translated, control };
}
