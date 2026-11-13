// One handler per kind of job (@mesa/shared JOB_KINDS), each wired with only what it uses: the
// composition root of the jobs. A kind added to the registry does not compile until it has its entry.
import { runAsk } from '../ask-mesa';
import { runCreator } from '../creator';
import { runFind, runForYou } from '../discover';
import { runFollowCheck } from '../follow-check';
import { runIdeas } from '../ideas';
import { recipeImages } from '../images';
import { storedJobMedia } from '../job-media';
import { jobPlatform, jobSourceUrl, runImport, type PipelineDeps } from '../pipeline';
import { ytOptions } from '../pipeline-common';
import type { ImportDeps, KitchenJobDeps, ScanDeps } from '../ports';
import { runPlan } from '../plan-week';
import { savedRecipes } from '../repos/recipes';
import { runReread } from '../reread';
import { runScan } from '../scan';
import { runTidy } from '../tidy';
import { runTranslate } from '../translate-recipe';
import { writeRecipe } from '../writer';
import { askedHandler } from './asked';
import { backgroundHandler } from './background';
import { recipeHandler } from './recipe';
import { scanHandler, type ReadScan } from './scan';
import type { Handlers } from './types';

export type { Handlers, JobHandler, JobRun, Done } from './types';

export function buildHandlers(deps: PipelineDeps): Handlers {
  const { db, ai, catalog } = deps;
  // Each job's share of the worker's dependencies (ports.ts): no configuration, no concrete model.
  const kitchen: KitchenJobDeps = { db, ai, catalog };
  const media = storedJobMedia(db);
  const scans: ScanDeps = { db, ai, catalog, media };
  const imports: ImportDeps = { ai, catalog, ytdlp: ytOptions(deps.config), media };
  const readScan: ReadScan = (r, kind) => runScan(scans, r.job, kind, r.log, r.signal);
  return {
    recipe: recipeHandler({
      sourceUrl: jobSourceUrl,
      platform: jobPlatform,
      saved: savedRecipes(db),
      read: (r) => runImport(imports, r.job, r.log, r.signal, r.progress),
      images: recipeImages(db),
      write: (recipe, meta, log) => writeRecipe(db, catalog, recipe, meta, log),
      readReceipt: readScan,
    }),
    sweep: scanHandler('sweep', readScan),
    receipt: scanHandler('receipt', readScan),
    tidy: backgroundHandler((r) => runTidy(kitchen, r.job, r.log, r.signal), 'text'),
    idea: askedHandler('idea', (r) => runIdeas(kitchen, r.job, r.log, r.signal)),
    translate: askedHandler('translate', async (r) => {
      await runTranslate({ db, ai }, r.job, r.log, r.signal);
      return null;
    }),
    // Not narrowed yet: creator, follow_check, for_you and find still take the whole PipelineDeps (for the
    // yt-dlp options in the config; ports.ts has the pattern to follow).
    creator: askedHandler('creator', (r) => runCreator(deps, r.job, r.log, r.signal), (job) => (job.input_url ? jobPlatform(job) : 'youtube')),
    follow_check: backgroundHandler((r) => runFollowCheck(deps, r.job, r.log, r.signal), 'youtube'),
    for_you: backgroundHandler((r) => runForYou(deps, r.job, r.log, r.signal), 'youtube'),
    find: askedHandler('find', (r) => runFind(deps, r.job, r.log, r.signal), () => 'youtube'),
    plan: askedHandler('plan', (r) => runPlan(kitchen, r.job, r.log, r.signal)),
    ask: askedHandler('ask', (r) => runAsk(kitchen, r.job, r.log, r.signal)),
    reread: askedHandler('reread', (r) => runReread({ db, ai, catalog }, r.job, r.log, r.signal)),
  };
}
