// Every kind of import job, in one place: the database's `job_kinds` table holds the same rows
// (pnpm --filter @mesa/shared gen:job-kinds prints the SQL; test/job-kinds.test.ts compares the two
// through db-tests/schema.sql), and the worker has one handler per kind. A new kind is one entry here,
// its failure sentence in errors.ts (when it has its own), its result in results.ts (when it answers
// one), its handler in apps/worker/src/handlers, and a migration with the generated SQL.
import type { ErrorCode } from './errors';

/**
 * quick: someone waits for it on the screen (quick slots take only these, every slot takes them first);
 * any: what people ask for that may take a while (imports, scans, searches);
 * background: server work nobody waits for, run only when nothing else waits. Only the server queues it.
 */
export type JobLane = 'quick' | 'any' | 'background';
export const JOB_LANES: readonly JobLane[] = ['quick', 'any', 'background'];

export interface JobKindSpec {
  readonly lane: JobLane;
  /** Counts toward the household's 60 jobs a day, when a person queued it (jobs the server queues never do). */
  readonly countsTowardQuota: boolean;
  /** Fails with aiBusy after 20 minutes in the queue, when a person queued it (nobody waits forever). */
  readonly expiresInQueue: boolean;
  /** The code stored when the run fails, unless the failure is kept in its own words (`keeps`). */
  readonly failure: ErrorCode;
  /** Codes stored as the run raised them ('every': any); aiBusy (try again in a few minutes) always is. */
  readonly keeps: 'every' | readonly ErrorCode[];
  /** Push title when it failed. */
  readonly failureTitle: string;
  /** Push title when it is ready, unless the answer names it better (a recipe's title); null: never pushed. */
  readonly readyTitle: string | null;
}

/** Background work: no quota, no expiry, nobody told. */
const background = (failureTitle: string) =>
  ({ lane: 'background', countsTowardQuota: false, expiresInQueue: false, failure: 'unknown', keeps: 'every', failureTitle, readyTitle: null }) as const;

export const JOB_KINDS = {
  /** A link, photo(s) or text shared to Mesa → a recipe (recipe_id), or a receipt's proposal for a photo. */
  recipe: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'unknown', keeps: 'every', failureTitle: "Couldn't save this recipe", readyTitle: 'Recipe saved' },
  /** A video / photo of a pantry `zone` (scans bucket) → a pantry proposal to review. */
  sweep: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'unknown', keeps: 'every', failureTitle: "Couldn't read your scan", readyTitle: 'Your scan is ready' },
  /** A photo of a receipt → a pantry proposal to review. */
  receipt: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'unknown', keeps: 'every', failureTitle: "Couldn't read the receipt", readyTitle: 'Receipt read' },
  /** The server sorting a household product or list line it doesn't know (`subject_id`); never shown. */
  tidy: background("Couldn't sort a new item"),
  /** Dishes that use a food (`subject_id` = product, `input_text` = its name) → UseItUpIdeas. */
  idea: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'ideasFailed', keeps: [], failureTitle: "Couldn't find ideas", readyTitle: 'Ideas for your food' },
  /** A recipe's title and steps in another language (`subject_id`, `input_text` = ISO 639-1) → recipe_translations. */
  translate: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'translateFailed', keeps: [], failureTitle: "Couldn't translate the recipe", readyTitle: 'Recipe translated' },
  /** A creator's latest recipe videos, from a channel URL (`input_url`) or a saved recipe (`subject_id`) → CreatorVideos. */
  creator: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'creatorFailed', keeps: ['creatorUnsupported', 'creatorNotFound'], failureTitle: "Couldn't open this creator", readyTitle: 'Recipe videos' },
  /** The daily look at the creators a household follows (writes creator_videos). */
  follow_check: background("Couldn't check your creators"),
  /** The weekly look for real recipe videos that fit the household (writes suggestions). */
  for_you: background("Couldn't find suggestions"),
  /** A video search from a wish (`input_text`), run when an Ask Mesa answer says `find` → FoundVideos. */
  find: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'findFailed', keeps: ['findNothing'], failureTitle: "Couldn't find videos", readyTitle: 'Videos found' },
  /** Plan my week among saved recipes (`input_text` = wishes, or 'week') → WeekPlan. */
  plan: { lane: 'any', countsTowardQuota: true, expiresInQueue: true, failure: 'planFailed', keeps: ['planNoRecipes'], failureTitle: "Couldn't plan the week", readyTitle: 'Your week' },
  /**
   * Ask Mesa, the one assistant (`input_text`, earlier turns in `input_context`, a recipe in `subject_id`)
   * → AskAnswer, written as it comes in `draft`. Adapting a recipe is a question about it.
   */
  ask: { lane: 'quick', countsTowardQuota: true, expiresInQueue: true, failure: 'askFailed', keeps: [], failureTitle: "Couldn't answer", readyTitle: 'Mesa answered' },
  /** Redo ingredients: a saved recipe's lines read again (`subject_id`, `input_text` = its title) → RereadResult. */
  reread: { lane: 'quick', countsTowardQuota: true, expiresInQueue: true, failure: 'rereadFailed', keeps: [], failureTitle: "Couldn't redo the ingredients", readyTitle: 'Ingredients up to date' },
} as const satisfies Record<string, JobKindSpec>;

export type ImportKind = keyof typeof JOB_KINDS;

/** Every kind, in the registry's order. */
export const IMPORT_KINDS = Object.keys(JOB_KINDS) as ImportKind[];

export function isImportKind(value: unknown): value is ImportKind {
  return typeof value === 'string' && Object.hasOwn(JOB_KINDS, value);
}

/** The kind's entry, typed as the general spec (no literal types). */
export const jobKind = (kind: ImportKind): JobKindSpec => JOB_KINDS[kind];
