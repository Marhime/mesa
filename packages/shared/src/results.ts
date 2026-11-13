// What the worker and the model answer: an extracted recipe, and what each asked job writes in
// import_jobs.result (JobResults, by kind).

import type { Category, ImportPlatform, Unit } from './rows';

/** What the import worker asks the model to return, and stores in recipes.original. */
export interface ExtractedRecipe {
  title: string;
  servings: number | null;
  total_minutes: number | null;
  ingredients: ExtractedIngredient[];
  steps: string[];
  /** For a video: the second each step starts (same order as steps); absent or null when unknown. */
  step_starts?: (number | null)[];
  language: string | null;
}

export interface ExtractedIngredient {
  /** The line as written in the source, in its language. */
  raw_text: string;
  /** Canonical English product name, singular, lowercase-friendly ("avocado", "chicken breast"). */
  name_en: string;
  quantity: number | null;
  /** Free unit as written ("cdta", "kg", "taza"); normalized later with parseUnit. */
  unit: string | null;
  /** True when the source did not state the quantity and it was inferred. */
  is_guessed: boolean;
  is_optional: boolean;
  category: Category | null;
  /**
   * The part of the recipe it belongs to, as the source names it ("Marinade", "Sauce", "Noodles"); null
   * or absent for a recipe with one list (sections.ts: meaningfulSections).
   */
  section?: string | null;
}

/** Dishes that use up one food ("Ideas for the tomatoes"): what the worker writes in import_jobs.result. */
export interface UseItUpIdeas {
  /** The food they are for, as the household names it. */
  food: string;
  ideas: {
    title: string;
    /** Foods from the pantry it uses (checked against what is at home). */
    uses: string[];
    /** What would have to be bought. */
    to_buy: string[];
    minutes: number | null;
    /** One line on why it is a good fit ("Uses the crema before Friday"). */
    why: string;
  }[];
}

/** A creator's latest recipe videos ("More from Food is Love"): what the worker writes in import_jobs.result. */
export interface CreatorVideos {
  creator: {
    name: string;
    /** Channel page, e.g. https://www.youtube.com/channel/UC… */
    url: string;
    channel_id: string;
    platform: ImportPlatform;
  };
  /** Newest first; only videos that are recipes; Shorts and very short clips left out. */
  videos: {
    url: string;
    title: string;
    /** The dish, in a few words ("Hungarian paprika chicken"). */
    dish: string | null;
    views: number | null;
    duration_s: number | null;
    thumbnail: string | null;
    /** Already in the household's recipes (same normalized URL). */
    saved: boolean;
  }[];
}

/** A real recipe video found for the household: a For you suggestion or a search Ask Mesa runs. */
export interface FoundVideo {
  /** https://www.youtube.com/watch?v=… */
  url: string;
  platform: ImportPlatform;
  title: string;
  creator: string | null;
  creator_channel_id: string | null;
  thumbnail: string | null;
  duration_s: number | null;
  views: number | null;
  /** ISO 639-1 of the video. */
  language: string | null;
  dish: string | null;
  /** Why it fits ("Like the tinga you made twice", "30 min, uses the poblanos"). */
  why: string;
}

/** A video search (kind find), run by the app when an Ask Mesa answer says `find` ("spicy chicken, 30 min"). */
export interface FoundVideos {
  query: string;
  videos: FoundVideo[];
}

/** Plan my week: dinners chosen among the household's own recipes. */
export interface WeekPlan {
  /** What was asked ("4 dinners, quick on weekdays"); null when the job said just 'week'. */
  wishes: string | null;
  dinners: {
    recipe_id: string;
    title: string;
    /** "Monday" or null when the order doesn't matter. */
    day: string | null;
    /** Uses what goes soon, quick on a weekday, a favorite… */
    why: string;
    /** Foods at home it uses up. */
    uses_soon: string[];
  }[];
  /** One line about the whole week ("Uses the cream and both avocados before Thursday"). */
  note: string | null;
}

/** Redo ingredients (kind reread): what the worker writes in import_jobs.result once the lines are rewritten. */
export interface RereadResult {
  /** Ingredient lines of the recipe (every one is kept). */
  lines: number;
  /** Of those, the lines linked to a product. */
  linked: number;
}

/** Ask Mesa: an answer grounded in the household's kitchen, with things to do. */
export interface AskAnswer {
  answer: string;
  /** Saved recipes it points to. */
  recipes: { recipe_id: string; title: string; why: string }[];
  actions: (
    | { kind: 'add_to_list'; label: string; items: { label: string; quantity: number | null; unit: Unit | null }[] }
    | { kind: 'plan'; label: string; recipe_id: string }
    | { kind: 'open_recipe'; label: string; recipe_id: string }
    | { kind: 'find'; label: string; query: string }
    | { kind: 'plan_week'; label: string; wishes: string | null }
  )[];
}

/** What each asked kind writes in import_jobs.result; kinds not listed answer nothing there (null). */
export interface JobResults {
  idea: UseItUpIdeas;
  creator: CreatorVideos;
  find: FoundVideos;
  plan: WeekPlan;
  ask: AskAnswer;
  reread: RereadResult;
}
