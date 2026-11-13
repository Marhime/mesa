// Every query key of the data layer, in one place: modules read their own, refresh.ts maps domain events
// to them. No imports, so any module can use it without a cycle.

/** The signed-in person ('profile', userId), the household ('household', id) and its members ('members', id). */
export const PROFILE_KEY = ['profile'] as const;
export const HOUSEHOLD_KEY = ['household'] as const;
export const MEMBERS_KEY = ['members'] as const;
export const GROCERIES_KEY = ['groceries'] as const;
export const USUAL_KEY = ['usual'] as const;
/** The pantry and its sub-keys (['pantry', 'updated']: the last shopping). */
export const PANTRY_KEY = ['pantry'] as const;
export const PANTRY_UPDATED_KEY = ['pantry', 'updated'] as const;
export const STAPLES_KEY = ['staples'] as const;
export const COVERAGE_KEY = ['coverage'] as const;
/** Per recipe: ['availability', recipeId]. */
export const AVAILABILITY_KEY = ['availability'] as const;
export const availabilityKey = (recipeId: string) => [...AVAILABILITY_KEY, recipeId] as const;
export const recipeKeys = {
  list: ['recipes'] as const,
  /** Every recipe's detail (a prefix). */
  details: ['recipe'] as const,
  detail: (id: string) => ['recipe', id] as const,
};
/** Recipes that use a product: ['recipesUsing', productId]. */
export const RECIPES_USING_KEY = ['recipesUsing'] as const;
export const recipesUsingKey = (productId: string | null) => [...RECIPES_USING_KEY, productId] as const;
/** Products the household's recipes use (the pantry's "+" sheet). */
export const RECIPE_PRODUCTS_KEY = ['recipeProducts'] as const;
/** Per recipe and language: ['translation', recipeId, lang, answer]. */
export const translationKey = (recipeId: string, lang: string, answer: string) => ['translation', recipeId, lang, answer] as const;
export const UP_NEXT_KEY = ['upNext'] as const;
export const cookedKey = (recipeId: string) => ['cooked', recipeId] as const;
export const IMPORTS_KEY = ['imports'] as const;
export const SCANS_KEY = ['scans'] as const;
/** Your questions to the worker (a creator's videos, ideas, a translation): the working bar (askedJobs.ts). */
export const ASKED_JOBS_KEY = ['askedJobs'] as const;
/** Every followed asked job, by id (workerAsk.ts). */
export const ASK_JOBS_KEY = ['askJob'] as const;
export const askJobKey = (id: string) => [...ASK_JOBS_KEY, id] as const;
export const askDraftKey = (jobId: string) => ['askDraft', jobId] as const;
export const FOLLOWED_CREATORS_KEY = ['followedCreators'] as const;
export const CREATOR_NEWS_KEY = ['creatorNews'] as const;
export const FOR_YOU_KEY = ['forYou'] as const;
