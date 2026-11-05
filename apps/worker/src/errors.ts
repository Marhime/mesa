// Errors that carry the short, human message stored in import_jobs.error and shown in the app.

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
  aiBlocked: "This content couldn't be processed. Send a screenshot or paste the text instead.",
  timeout: 'This took too long. Send a screenshot or paste the text instead.',
  saveFailed: "Couldn't save the recipe. Try again.",
  sweepEmpty: "Couldn't see any food. Film a little closer, with the light on.",
  notReceipt: "This doesn't look like a receipt or an order. Try a sharper photo of the whole ticket.",
  unknown: 'Something went wrong reading this recipe.',
} as const;

/** An expected failure with a message fit for the person who shared the recipe. */
export class ImportError extends Error {
  constructor(
    readonly userMessage: string,
    options?: { cause?: unknown; detail?: string },
  ) {
    super(options?.detail ? `${userMessage} (${options.detail})` : userMessage, { cause: options?.cause });
    this.name = 'ImportError';
  }
}

export function isImportError(err: unknown): err is ImportError {
  return err instanceof ImportError;
}

export function userMessageFor(err: unknown): string {
  return isImportError(err) ? err.userMessage : MESSAGES.unknown;
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
