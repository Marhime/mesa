// Why a job failed: the code the worker stores in import_jobs.error_code (the app picks the way out
// from it: retry, screenshot, paste, open the post) and the sentence stored in import_jobs.error.
// A job kind names its own failure code in job-kinds.ts (`failure`).

export const MESSAGES = {
  notRecipe: "This doesn't look like a recipe.",
  noIngredients: "Couldn't find the ingredients. Send a screenshot or paste the text instead.",
  nothingToImport: 'There was nothing to import.',
  pageBlocked: 'This website blocked the import. Send a screenshot or paste the text instead.',
  pageNotFound: "This link doesn't open anymore.",
  pageFailed: "Couldn't open this link. Send a screenshot or paste the text instead.",
  pageEmpty: "Couldn't read this page. Send a screenshot or paste the text instead.",
  videoPrivate: 'This post is private or needs a login. Send a screenshot or paste the text instead.',
  videoUnavailable: "This video isn't available anymore. Send a screenshot or paste the text instead.",
  videoFailed: "Couldn't get this video. Send a screenshot or paste the text instead.",
  unsupportedLink: "This link isn't supported. Send a screenshot or paste the text instead.",
  imageMissing: "Couldn't find the uploaded image. Try sharing it again.",
  imageUnsupported: "This image format isn't supported. Send a JPEG or PNG screenshot.",
  imageTooLarge: 'This image is too large. Send a smaller screenshot.',
  aiBusy: 'The recipe reader is busy right now. Try again in a few minutes.',
  aiFailed: 'The recipe reader had a problem. Try again later.',
  /** The worker's daily AI ceiling is reached (apps/worker/src/ai-budget.ts). */
  aiDailyLimit: 'Mesa has read a lot today. Try again tomorrow.',
  aiBlocked: "This content couldn't be processed. Send a screenshot or paste the text instead.",
  timeout: 'This took too long. Send a screenshot or paste the text instead.',
  saveFailed: "Couldn't save the recipe. Try again.",
  sweepEmpty: "Couldn't see any food. Film a little closer, with the light on.",
  notReceipt: "This doesn't look like a receipt or an order. Try a sharper photo of the whole ticket.",
  ideasFailed: "Couldn't find ideas right now. Try again.",
  translateFailed: "Couldn't translate this recipe right now. Try again.",
  creatorLink: 'This is a channel, not a video. Open it from a recipe or paste it in Mesa to pick videos.',
  creatorUnsupported: 'Only YouTube creators can be browsed for now. Share their posts to Mesa instead.',
  creatorNotFound: "Couldn't find this creator on YouTube anymore.",
  creatorFailed: "Couldn't load this creator's videos right now. Try again.",
  findNothing: "Couldn't find good videos for that. Try other words.",
  findFailed: "Couldn't search for videos right now. Try again.",
  planNoRecipes: 'Save a few recipes first: Mesa plans your week with them.',
  planFailed: "Couldn't plan your week right now. Try again.",
  askFailed: "Couldn't answer right now. Try again.",
  rereadFailed: "Couldn't read the ingredients again right now. Try again.",
  /** A job of a kind this worker has no handler for (nothing is read, no model call). */
  unknownKind: "Mesa can't do this yet. Try again later.",
  unknown: 'Something went wrong reading this recipe.',
} as const;

/** Stored as import_jobs.error_code. */
export type ErrorCode = keyof typeof MESSAGES;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && Object.hasOwn(MESSAGES, value);
}
