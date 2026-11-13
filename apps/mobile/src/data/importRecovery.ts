// The way out of a failed import, chosen from why it failed (import_jobs.error_code, written by the
// worker). Retry only helps when the failure was temporary; a private post needs a screenshot instead;
// after Mesa's daily reading limit nothing works before tomorrow, so the import can only be removed.
import { failsUntilTomorrow } from './errors';
import { importRoute } from './importProgress';

export type RecoveryKind = 'retry' | 'screenshot' | 'paste' | 'openPost' | 'remove';

export interface RecoveryAction {
  kind: RecoveryKind;
  label: string;
}

type Strategy = 'temporary' | 'mediaBlocked' | 'pageUnreadable' | 'deadEnd' | 'badImage' | 'untilTomorrow';

/**
 * Worker error codes (packages/shared/src/errors.ts MESSAGES keys) → strategy. Unknown codes are temporary;
 * the codes that fail until tomorrow (errors.ts failsUntilTomorrow: aiDailyLimit) come before this table.
 */
const STRATEGY_BY_CODE: Record<string, Strategy> = {
  aiBusy: 'temporary',
  aiFailed: 'temporary',
  timeout: 'temporary',
  saveFailed: 'temporary',
  unknown: 'temporary',
  videoPrivate: 'mediaBlocked',
  videoFailed: 'mediaBlocked',
  unsupportedLink: 'mediaBlocked',
  aiBlocked: 'mediaBlocked',
  pageBlocked: 'pageUnreadable',
  pageFailed: 'pageUnreadable',
  pageEmpty: 'pageUnreadable',
  noIngredients: 'pageUnreadable',
  notRecipe: 'deadEnd',
  pageNotFound: 'deadEnd',
  videoUnavailable: 'deadEnd',
  nothingToImport: 'deadEnd',
  imageUnsupported: 'badImage',
  imageTooLarge: 'badImage',
  imageMissing: 'badImage',
};

const LABEL: Record<RecoveryKind, string> = {
  retry: 'Try again',
  screenshot: 'Use a screenshot',
  paste: 'Paste the text',
  openPost: 'Open the post',
  remove: 'Remove',
};

const action = (kind: RecoveryKind, label = LABEL[kind]): RecoveryAction => ({ kind, label });

/** Most useful first; the last one is always Remove. */
export function importRecovery(job: { error_code: string | null; input_url: string | null; input_image_path: string | null }): RecoveryAction[] {
  const route = importRoute(job);
  const social = route === 'video' || route === 'youtube';
  const strategy: Strategy = failsUntilTomorrow(job.error_code) ? 'untilTomorrow' : (STRATEGY_BY_CODE[job.error_code ?? 'unknown'] ?? 'temporary');
  const ways: RecoveryAction[] = (() => {
    switch (strategy) {
      case 'temporary':
        return route === 'image' ? [action('retry')] : [action('retry'), action('screenshot')];
      case 'mediaBlocked':
        return job.input_url ? [action('screenshot'), action('openPost')] : [action('screenshot')];
      case 'pageUnreadable':
        if (route === 'image') return [action('screenshot', 'Pick another screenshot')];
        return [action('screenshot'), social ? action('openPost') : action('paste')];
      case 'badImage':
        return [action('screenshot', 'Pick another screenshot')];
      case 'deadEnd':
        return [];
      case 'untilTomorrow':
        // A screenshot or the text would be read by the same Mesa: nothing to offer before tomorrow.
        return [];
    }
  })();
  return [...ways, action('remove')];
}
