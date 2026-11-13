// Where an import stands, as a progression the person can watch: the worker's real stage, mapped onto
// the steps of this kind of import, with an honest guess of how long the current step takes.
import type { ImportJob, ImportStage } from '@mesa/shared';

import { platformOfUrl } from '../lib/text';

export type ImportRoute = 'video' | 'youtube' | 'web' | 'image' | 'text';

export interface ImportProgressView {
  label: string;
  detail: string | null;
  /** The bar starts the current step at `from` and eases toward `to` over about `expectedMs`. */
  from: number;
  to: number;
  expectedMs: number;
  /** When the current step began (ms since epoch). */
  since: number;
  step: { index: number; count: number };
}

type JobLike = Pick<ImportJob, 'input_url' | 'input_image_path' | 'input_image_paths' | 'status' | 'stage' | 'stage_at' | 'created_at'>;

const SLOW_AFTER_MS = 2 * 60_000;
/** How far the bar may go inside a step before the worker says the next one started. */
const STEP_CAP = 0.9;

/** Expected length of each step, for the easing only (the bar never claims a step is done). */
const EXPECTED_MS: Record<ImportStage | 'queued', number> = {
  queued: 4_000,
  opening: 5_000,
  downloading: 12_000,
  watching: 30_000,
  reading: 10_000,
  writing: 4_000,
};

/** The steps each kind of import goes through; reading and watching share a step. */
const STEPS: Record<ImportRoute, number> = { video: 4, youtube: 3, web: 3, image: 3, text: 3 };

export function importRoute(job: Pick<ImportJob, 'input_url' | 'input_image_path'>): ImportRoute {
  if (job.input_image_path) return 'image';
  if (!job.input_url) return 'text';
  const platform = platformOfUrl(job.input_url);
  if (platform === 'YouTube') return 'youtube';
  if (platform === 'Instagram' || platform === 'TikTok') return 'video';
  return 'web';
}

/** How many screenshots a job reads: 0 for a link or a text. */
export function screenshotCount(job: Pick<ImportJob, 'input_image_path' | 'input_image_paths'>): number {
  return job.input_image_paths?.length || (job.input_image_path ? 1 : 0);
}

function stepIndex(route: ImportRoute, stage: ImportStage | null): number {
  if (!stage || stage === 'opening') return 0;
  if (stage === 'writing') return STEPS[route] - 1;
  if (route === 'video') return stage === 'downloading' ? 1 : 2;
  return 1;
}

const OPENING: Record<ImportRoute, string> = {
  video: 'Opening the post',
  youtube: 'Opening the video',
  web: 'Opening the page',
  image: 'Opening your screenshot',
  text: 'Reading what you shared',
};

const READING: Record<ImportRoute, string> = {
  video: 'Reading the post',
  youtube: 'Watching the video',
  web: 'Reading the page',
  image: 'Reading your screenshot',
  text: 'Reading the recipe',
};

function stageLabel(route: ImportRoute, stage: ImportStage | null, shots: number): { label: string; detail: string | null } {
  // Several screenshots of one recipe: say how many.
  if (shots > 1 && (stage === 'opening' || stage === 'reading')) {
    return { label: `${stage === 'opening' ? 'Opening' : 'Reading'} ${shots} screenshots`, detail: null };
  }
  switch (stage) {
    case null:
      return { label: 'In line', detail: 'Mesa starts in a moment' };
    case 'opening':
      return { label: OPENING[route], detail: null };
    case 'downloading':
      return { label: 'Getting the video', detail: null };
    case 'watching':
      return { label: 'Watching the video', detail: 'Ingredients on screen, voice-over and caption' };
    case 'reading':
      return { label: READING[route], detail: null };
    case 'writing':
      return { label: 'Writing it down', detail: 'Ingredients, steps and a photo' };
  }
}

/** Null once the job is done or failed. */
export function importProgress(job: JobLike, now: number = Date.now()): ImportProgressView | null {
  if (job.status !== 'queued' && job.status !== 'processing') return null;
  const route = importRoute(job);
  const stage = job.status === 'queued' ? null : job.stage;
  const count = STEPS[route];
  const index = stepIndex(route, stage);
  const { label, detail } = stageLabel(route, stage, screenshotCount(job));
  const created = Date.parse(job.created_at);
  const slow = Number.isFinite(created) && now - created > SLOW_AFTER_MS;
  const since = (stage && job.stage_at ? Date.parse(job.stage_at) : created) || now;
  return {
    label,
    detail: slow ? 'Taking longer than usual. Mesa keeps going.' : detail,
    from: index / count,
    to: (index + STEP_CAP) / count,
    expectedMs: EXPECTED_MS[stage ?? 'queued'],
    since: Math.min(since, now),
    step: { index: index + 1, count },
  };
}

/** What the share screen says while it works: honest about the wait, by kind of import. */
export function importWaitLine(route: ImportRoute, shots = 1): string {
  switch (route) {
    case 'video':
    case 'youtube':
      return 'Mesa is watching the video for the ingredients and steps. Usually under a minute.';
    case 'image':
      return shots > 1 ? `Mesa is reading ${shots} screenshots as one recipe. Usually a few seconds.` : 'Mesa is reading your screenshot. Usually a few seconds.';
    default:
      return 'Usually ready in a few seconds.';
  }
}
