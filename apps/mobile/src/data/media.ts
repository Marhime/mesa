// Device media for imports and scans: clipboard links, picking screenshots, the camera, and uploading what
// you show Mesa (screenshots, shared photos, receipts, fridge videos) to a private bucket: only the worker
// reads it, and removes it once used (shared_media_to_delete, migration 28). A recipe's picture is the
// worker's own public copy (recipes.image_path, recipeImageUrl), never one of these.
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { findUrl } from '../lib/text';
import { UserFacingError } from './errors';
import { supabase } from './supabase';

const MAX_SIDE = 1600;
/** Private: everything you show Mesa, at `<household_id>/<uuid>.<ext>`. */
const SHOWN_TO_MESA_BUCKET = 'scans';
const MAX_SCAN_SECONDS = 20;

export interface LocalImage {
  uri: string;
  width: number | null;
  height: number | null;
}

/** Text from the clipboard (a recipe copied from a page), null when empty or refused. */
export async function readClipboardText(): Promise<string | null> {
  try {
    return (await Clipboard.hasStringAsync()) ? await Clipboard.getStringAsync() : null;
  } catch {
    return null;
  }
}

/** A link from the clipboard, if it holds one. Only asks to paste when there is something to read. */
export async function readClipboardUrl(): Promise<string | null> {
  try {
    if (await Clipboard.hasUrlAsync()) {
      const url = await Clipboard.getUrlAsync();
      if (url) return url;
    }
    if (await Clipboard.hasStringAsync()) return findUrl(await Clipboard.getStringAsync());
  } catch {
    // clipboard access refused
  }
  return null;
}

/** Screenshots that make one recipe (the share extension takes as many: app.config.ts). */
export const MAX_SCREENSHOTS = 4;

/** Opens the photo library for up to 4 screenshots of one recipe, in the order picked. Empty when cancelled. */
export async function pickImages(): Promise<LocalImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    allowsMultipleSelection: true,
    selectionLimit: MAX_SCREENSHOTS,
    orderedSelection: true,
  });
  if (result.canceled) return [];
  return result.assets.slice(0, MAX_SCREENSHOTS).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

/** A video or photo taken for a scan. */
export type ScanMedia = { kind: 'video'; uri: string } | { kind: 'image'; image: LocalImage };

/**
 * Opens the camera for a scan: a fridge sweep may be a short video (up to 20 s) or a photo; a receipt is
 * a photo. Null when cancelled or when the camera is refused.
 */
export async function captureScan(kind: 'sweep' | 'receipt'): Promise<ScanMedia | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new UserFacingError('Mesa needs the camera for this. Turn it on in Settings › Mesa.');
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: kind === 'sweep' ? ['videos', 'images'] : ['images'],
    videoMaxDuration: MAX_SCAN_SECONDS,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    quality: 0.8,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  return asset.type === 'video' ? { kind: 'video', uri: asset.uri } : { kind: 'image', image: { uri: asset.uri, width: asset.width, height: asset.height } };
}

/** Uploads a scan to the private bucket (`<household_id>/<uuid>.<ext>`); photos are resized like screenshots. */
export async function uploadScan(media: ScanMedia, householdId: string): Promise<string> {
  if (media.kind === 'image') return uploadImageShownToMesa(media.image, householdId);
  const ext = /\.mp4$/i.test(media.uri) ? 'mp4' : 'mov';
  const bytes = await new File(media.uri).arrayBuffer();
  const path = `${householdId}/${Crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SHOWN_TO_MESA_BUCKET)
    .upload(path, bytes, { contentType: ext === 'mp4' ? 'video/mp4' : 'video/quicktime', upsert: false });
  if (error) throw error;
  return path;
}

/**
 * A screenshot or photo you show Mesa: resized to at most 1600 px on the long side (JPEG) and uploaded to the
 * private bucket at `<household_id>/<uuid>.jpg`. Returns that path (import_jobs.input_image_path).
 */
export async function uploadImageShownToMesa(image: LocalImage, householdId: string): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);
  const w = image.width ?? 0;
  const h = image.height ?? 0;
  if (w === 0 || h === 0) context.resize({ width: MAX_SIDE });
  else if (Math.max(w, h) > MAX_SIDE) context.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const bytes = await new File(saved.uri).arrayBuffer();
  const path = `${householdId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(SHOWN_TO_MESA_BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
