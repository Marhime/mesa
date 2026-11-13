// The Steps section of a recipe: in its own language or the phone's (translation.ts), each step with
// the moment it starts in the source video when there is one (stepVideo.ts).
import type { Notify } from './notice';
import type { RecipeDetail } from './recipes';
import { stepVideoLink } from './stepVideo';
import { useOpenUrl } from './system';
import { useRecipeTranslation, type TranslateControl } from './translation';

export interface StepView {
  key: string;
  number: number;
  text: string;
  /** "2:14" in the video, opening YouTube there; null when unknown. */
  video: { label: string; accessibilityLabel: string; onPress: () => void } | null;
}

/**
 * Steps to show and the title that goes with them (translated or not). `translate` is the
 * "Read in …" / "Show original" control, null when there is nothing to translate. `startTranslated`:
 * opened from "Tinga is translated" (a toast, a notification).
 */
export function useRecipeSteps(
  recipe: RecipeDetail | undefined,
  notify: Notify,
  startTranslated = false,
): { title: string | null; steps: StepView[]; translate: TranslateControl | null } {
  const { translated, control } = useRecipeTranslation(
    recipe ? { id: recipe.id, language: recipe.language ?? null } : undefined,
    notify,
    startTranslated,
  );
  const openUrl = useOpenUrl();
  const original = recipe?.steps ?? [];
  const texts = translated && translated.steps.length > 0 ? translated.steps : original.map((s) => s.text);
  // Times belong to the original steps: kept only while the translation lines up with them.
  const aligned = texts.length === original.length;
  const steps = texts.map((text, i): StepView => {
    const step = aligned ? original[i] : undefined;
    const link = step ? stepVideoLink(recipe?.source_url ?? null, step.start_s) : null;
    return {
      key: step?.id ?? `step-${i}`,
      number: i + 1,
      text,
      video: link
        ? { label: link.time, accessibilityLabel: `Watch step ${i + 1} in the video, from ${link.time}`, onPress: () => openUrl(link.url) }
        : null,
    };
  });
  return { title: translated?.title ?? recipe?.title ?? null, steps, translate: control };
}
