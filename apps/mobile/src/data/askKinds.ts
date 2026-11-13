// The things people ask the worker for, one entry each: what the Mesa button, the toasts and the pushes say
// about it, whether it is about a recipe, whether the open app shows its news itself, and where it opens
// (its sheet, Ask Mesa, or its recipe). workerAsk, askedJobs, notifications, push, askSheets and the
// background news all read this table: a new kind is one entry here.
import type { SheetName } from './sheetRegistry';

/** What a job says about itself (import_jobs columns; the creator's name once listed). */
export interface AskedJobText {
  /** The food's name (idea), the creator's name as the sheet knew it (creator), the language (translate), the question. */
  input_text: string | null;
  subject_id: string | null;
  creator_name: string | null;
}

/** "Ideas for tomato…", "Ideas for tomato are ready", "Couldn't find ideas for tomato". */
export interface AskWords {
  working: string;
  ready: string;
  failed: string;
}

/** Where a job opens: one of the app's sheets, Ask Mesa (on that question or that search), or its recipe. */
export type AskOpens = { sheet: SheetName } | { ask: 'question' | 'search' } | { recipe: { translated: boolean } };

export interface AskKindSpec {
  /** `recipeTitle`: the recipe's title when the job is about one of the household's (recipe-bound kinds). */
  words: (job: AskedJobText, recipeTitle: string | null) => AskWords;
  /** Its subject is one of the household's recipes: its news is about that recipe. */
  recipeBound: boolean;
  /** The open app shows its news itself (a toast, its sheet): no banner on top. */
  inApp: boolean;
  opens: AskOpens;
  /** Lands in place on its recipe's screen (the screen refreshes): a word, nothing to open. */
  inPlace?: boolean;
}

/** What was typed, short enough for a toast ("spicy chicken, 30 min"). */
function shortText(text: string | null): string | null {
  const t = text?.replace(/\s+/g, ' ').trim() ?? '';
  return t.length > 40 ? `${t.slice(0, 39).trimEnd()}…` : t || null;
}

const ASK_KIND = {
  creator: {
    recipeBound: false,
    inApp: true,
    opens: { sheet: 'creator' },
    words: (job) => {
      const who = job.creator_name?.trim() || job.input_text?.trim() || null;
      return who
        ? { working: `Looking at ${who}'s recipes…`, ready: `${who}'s recipes are ready`, failed: `Couldn't list ${who}'s videos` }
        : { working: 'Looking at recipe videos…', ready: 'Recipe videos are ready', failed: "Couldn't list the videos" };
    },
  },
  idea: {
    recipeBound: false,
    inApp: true,
    opens: { sheet: 'ideas' },
    words: (job) => {
      const food = job.input_text?.trim().toLowerCase() || 'your food';
      return { working: `Ideas for ${food}…`, ready: `Ideas for ${food} are ready`, failed: `Couldn't find ideas for ${food}` };
    },
  },
  translate: {
    recipeBound: true,
    inApp: true,
    // A translation opens its recipe translated.
    opens: { recipe: { translated: true } },
    words: (_job, title) =>
      title
        ? { working: `Translating ${title}…`, ready: `${title} is translated`, failed: `Couldn't translate ${title}` }
        : { working: 'Translating a recipe…', ready: 'Your recipe is translated', failed: "Couldn't translate the recipe" },
  },
  find: {
    recipeBound: false,
    inApp: true,
    opens: { ask: 'search' },
    // Said the same way as under the answer ("Looking for videos…").
    words: (job) => {
      const what = shortText(job.input_text);
      return what
        ? { working: 'Looking for videos…', ready: `Videos for ${what} are ready`, failed: `Couldn't find videos for ${what}` }
        : { working: 'Looking for videos…', ready: 'Your videos are ready', failed: "Couldn't find videos" };
    },
  },
  ask: {
    // A question about a recipe opens Ask Mesa on it, chip included: not the recipe.
    recipeBound: false,
    inApp: true,
    opens: { ask: 'question' },
    words: () => ({ working: 'Thinking…', ready: 'Mesa answered', failed: "Mesa couldn't answer" }),
  },
  plan: {
    recipeBound: false,
    inApp: true,
    opens: { sheet: 'weekPlan' },
    words: () => ({ working: 'Planning your week…', ready: 'Your week plan is ready', failed: "Couldn't plan your week" }),
  },
  reread: {
    recipeBound: true,
    inApp: true,
    // Ingredients read again open the recipe as it is; on its screen they refresh in place.
    opens: { recipe: { translated: false } },
    inPlace: true,
    words: (job, title) => {
      const name = title ?? job.input_text?.trim() ?? null;
      return name
        ? { working: `Reading ${name}'s ingredients…`, ready: `${name}'s ingredients are up to date`, failed: `Couldn't read ${name}'s ingredients again` }
        : { working: 'Reading the ingredients…', ready: 'The ingredients are up to date', failed: "Couldn't read the ingredients again" };
    },
  },
} satisfies Record<string, AskKindSpec>;

export type AskKind = keyof typeof ASK_KIND;
export const ASK_KINDS = Object.keys(ASK_KIND) as AskKind[];

export function askKind(kind: AskKind): AskKindSpec {
  return ASK_KIND[kind];
}

export function isAskKind(kind: unknown): kind is AskKind {
  return typeof kind === 'string' && Object.prototype.hasOwnProperty.call(ASK_KIND, kind);
}

/** The recipe a job's news is about (recipe-bound kinds), else null. */
export function askedRecipeId(kind: AskKind, subjectId: string | null): string | null {
  return ASK_KIND[kind].recipeBound ? subjectId : null;
}
