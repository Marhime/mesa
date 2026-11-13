// A job's input media (screenshots, shared photos, receipts, fridge videos), from the private 'scans' bucket
// the app uploads them to. Older app builds still upload screenshots and photos to the public
// 'recipe-images' bucket: a file 'scans' doesn't have is looked for there (legacy: until every phone runs a
// build that uploads to 'scans'). What a job used is removed later by the media sweep (media-sweep.ts).
import type { SupabaseClient } from '@supabase/supabase-js';
import { ImportError } from './errors';
import { RECIPE_IMAGES_BUCKET } from './images';

export const SCANS_BUCKET = 'scans';

/** Reading a job's media, wherever it was uploaded. */
export interface JobMedia {
  /** The file's bytes. ImportError('imageMissing') when it isn't the household's or no bucket has it. */
  read(householdId: string, path: string): Promise<Buffer>;
}

/** The buckets to look in, in order. */
const BUCKETS = [SCANS_BUCKET, RECIPE_IMAGES_BUCKET] as const;

export function storedJobMedia(db: Pick<SupabaseClient, 'storage'>): JobMedia {
  return {
    async read(householdId, path) {
      // The database refuses a job whose media is outside its household's folder; said again here.
      if (!path.startsWith(`${householdId}/`)) throw new ImportError('imageMissing', { detail: 'not in the household folder' });
      const misses: string[] = [];
      for (const bucket of BUCKETS) {
        const { data, error } = await db.storage.from(bucket).download(path);
        if (!error && data) return Buffer.from(await data.arrayBuffer());
        misses.push(`${bucket}: ${error?.message ?? 'no data'}`);
      }
      throw new ImportError('imageMissing', { detail: misses.join('; ') });
    },
  };
}
