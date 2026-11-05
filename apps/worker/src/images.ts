// Recipe images: download the chosen picture and keep a copy in the recipe-images bucket.
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { downloadImage, isStorableImage, sniffImage } from './http';
import type { Logger } from './log';

export const RECIPE_IMAGES_BUCKET = 'recipe-images';
const MAX_RECIPE_IMAGE_BYTES = 5 * 1024 * 1024;

/** Where the recipe picture comes from. */
export type ImageSource =
  | { kind: 'url'; urls: string[] }
  | { kind: 'bytes'; bytes: Buffer }
  /** Already in the bucket (an uploaded screenshot or photo). */
  | { kind: 'path'; path: string };

/** Uploads bytes to <household_id>/<uuid>.<ext>. Null when the bytes are not jpeg/png/webp ≤ 5 MB. */
export async function uploadRecipeImage(db: SupabaseClient, householdId: string, bytes: Buffer, log: Logger): Promise<string | null> {
  const type = sniffImage(bytes);
  if (!isStorableImage(type) || bytes.length > MAX_RECIPE_IMAGE_BYTES) return null;
  const path = `${householdId}/${randomUUID()}.${type.ext}`;
  const { error } = await db.storage.from(RECIPE_IMAGES_BUCKET).upload(path, bytes, {
    contentType: type.mime,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) {
    log.warn('image_upload_failed', { err: error.message });
    return null;
  }
  return path;
}

/** The stored image path, or null. Never throws (except on abort): a recipe without a picture is fine. */
export async function storeRecipeImage(
  db: SupabaseClient,
  householdId: string,
  source: ImageSource | null,
  log: Logger,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!source) return null;
  try {
    if (source.kind === 'path') return source.path;
    if (source.kind === 'bytes') return await uploadRecipeImage(db, householdId, source.bytes, log);
    for (const url of [...new Set(source.urls)]) {
      const img = await downloadImage(url, MAX_RECIPE_IMAGE_BYTES, signal);
      if (!img || !isStorableImage(img.type)) {
        log.debug('image_skipped', { url });
        continue;
      }
      const path = await uploadRecipeImage(db, householdId, img.bytes, log);
      if (path) return path;
    }
    return null;
  } catch (err) {
    if (signal?.aborted) throw err;
    log.warn('image_store_failed', { err });
    return null;
  }
}
