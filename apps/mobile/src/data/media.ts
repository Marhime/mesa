// Device media for imports: clipboard links, picking a screenshot, resizing and uploading it.
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { findUrl } from '../lib/text';
import { supabase } from './supabase';

const MAX_SIDE = 1600;
export const RECIPE_BUCKET = 'recipe-images';
/** Private: fridge videos and receipts. */
export const SCANS_BUCKET = 'scans';
const MAX_SCAN_SECONDS = 20;

export interface LocalImage {
  uri: string;
  width: number | null;
  height: number | null;
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

/** Opens the photo library for one image. Null when cancelled. */
export async function pickImage(): Promise<LocalImage | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}

/** A video or photo taken for a scan. */
export type ScanMedia = { kind: 'video'; uri: string } | { kind: 'image'; image: LocalImage };

/**
 * Opens the camera for a scan: a fridge sweep may be a short video (up to 20 s) or a photo; a receipt is
 * a photo. Null when cancelled or when the camera is refused.
 */
export async function captureScan(kind: 'sweep' | 'receipt'): Promise<ScanMedia | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error('Mesa needs the camera for this. Turn it on in Settings › Mesa.');
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

/** Uploads a scan to the private bucket (`<household_id>/<uuid>.<ext>`); photos are resized like recipe images. */
export async function uploadScan(media: ScanMedia, householdId: string): Promise<string> {
  if (media.kind === 'image') return uploadImage(media.image, householdId, SCANS_BUCKET);
  const ext = /\.mp4$/i.test(media.uri) ? 'mp4' : 'mov';
  const bytes = await new File(media.uri).arrayBuffer();
  const path = `${householdId}/${Crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(SCANS_BUCKET)
    .upload(path, bytes, { contentType: ext === 'mp4' ? 'video/mp4' : 'video/quicktime', upsert: false });
  if (error) throw error;
  return path;
}

/** Resizes to at most 1600 px on the long side (JPEG) and uploads to `<household_id>/<uuid>.jpg`. */
export function uploadRecipeImage(image: LocalImage, householdId: string): Promise<string> {
  return uploadImage(image, householdId, RECIPE_BUCKET);
}

async function uploadImage(image: LocalImage, householdId: string, bucket: string): Promise<string> {
  const context = ImageManipulator.manipulate(image.uri);
  const w = image.width ?? 0;
  const h = image.height ?? 0;
  if (w === 0 || h === 0) context.resize({ width: MAX_SIDE });
  else if (Math.max(w, h) > MAX_SIDE) context.resize(w >= h ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
  const bytes = await new File(saved.uri).arrayBuffer();
  const path = `${householdId}/${Crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}
