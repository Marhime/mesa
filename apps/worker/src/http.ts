// HTTP helpers: pages with a desktop browser User-Agent, size-limited downloads, image sniffing. Every
// request goes through the guarded fetch (safe-fetch.ts): a link never reaches the server's own network.
import { ImportError } from './errors';
import { fetchLink, isBlockedLink } from './safe-fetch';

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const PAGE_TIMEOUT_MS = 15_000;
const MAX_PAGE_BYTES = 8 * 1024 * 1024;

export class TooLargeError extends Error {
  constructor(readonly limit: number) {
    super(`response is larger than ${limit} bytes`);
    this.name = 'TooLargeError';
  }
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/** Reads a response body, aborting as soon as it passes `limit` bytes. */
export async function readLimited(res: Pick<Response, 'headers' | 'body'>, limit: number): Promise<Buffer> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) {
    await res.body?.cancel().catch(() => undefined);
    throw new TooLargeError(limit);
  }
  if (!res.body) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      throw new TooLargeError(limit);
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export interface ImageType {
  mime: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif' | 'image/gif';
  ext: 'jpg' | 'png' | 'webp' | 'heic' | 'heif' | 'gif';
}

/** Detects the image format from its first bytes (headers lie often enough). */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  const b = bytes;
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  const ascii = (from: number, to: number): string => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  if (b.length >= 6 && ascii(0, 4) === 'GIF8') return { mime: 'image/gif', ext: 'gif' };
  if (b.length >= 12 && ascii(4, 8) === 'ftyp') {
    const brand = ascii(8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(brand)) return { mime: 'image/heic', ext: 'heic' };
    if (['mif1', 'msf1', 'heif'].includes(brand)) return { mime: 'image/heif', ext: 'heif' };
  }
  return null;
}

/** Formats stored as recipe images (what the app can show). */
export function isStorableImage(t: ImageType | null): t is ImageType & { ext: 'jpg' | 'png' | 'webp' } {
  return t !== null && (t.ext === 'jpg' || t.ext === 'png' || t.ext === 'webp');
}

/** Formats Gemini accepts inline. */
export function isModelImage(t: ImageType | null): t is ImageType {
  return t !== null && t.ext !== 'gif';
}

function charsetOf(contentType: string | null, head: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const fromMeta = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  return (fromHeader ?? fromMeta ?? 'utf-8').toLowerCase();
}

function decode(bytes: Buffer, charset: string): string {
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

export type FetchedPage =
  | { kind: 'html'; html: string; finalUrl: string }
  | { kind: 'image'; bytes: Buffer; type: ImageType; finalUrl: string };

/**
 * GET a web page like a desktop browser would (15 s timeout, redirects included). A direct image link comes
 * back as bytes. A link (or a redirect) to the server's own network is not supported.
 */
export async function fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage> {
  let res: Response;
  let finalUrl: string;
  try {
    ({ response: res, url: finalUrl } = await fetchLink(url, {
      signal: withTimeout(signal, PAGE_TIMEOUT_MS),
      headers: {
        'user-agent': DESKTOP_UA,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        // Pages answer in their own language; English for the rest of the page chrome.
        'accept-language': 'en-US,en;q=0.9,*;q=0.5',
      },
    }));
  } catch (err) {
    if (signal?.aborted) throw err;
    if (isBlockedLink(err)) throw new ImportError('unsupportedLink', { cause: err, detail: 'blocked link' });
    throw new ImportError('pageFailed', { cause: err, detail: 'fetch failed' });
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 404 || res.status === 410) throw new ImportError('pageNotFound', { detail: `HTTP ${res.status}` });
    if ([401, 403, 429, 451, 503].includes(res.status)) throw new ImportError('pageBlocked', { detail: `HTTP ${res.status}` });
    throw new ImportError('pageFailed', { detail: `HTTP ${res.status}` });
  }
  const contentType = res.headers.get('content-type');
  let bytes: Buffer;
  try {
    bytes = await readLimited(res, MAX_PAGE_BYTES);
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ImportError('pageFailed', { cause: err, detail: 'body' });
  }
  const image = sniffImage(bytes);
  if (image) return { kind: 'image', bytes, type: image, finalUrl };
  if (contentType && !/html|xml|text\/plain/i.test(contentType)) {
    throw new ImportError('unsupportedLink', { detail: contentType });
  }
  const head = bytes.subarray(0, 4096).toString('latin1');
  return { kind: 'html', html: decode(bytes, charsetOf(contentType, head)), finalUrl };
}

export interface DownloadedImage {
  bytes: Buffer;
  type: ImageType;
}

/**
 * Downloads an image (≤ maxBytes). Null when it fails, is not an image or is blocked (safe-fetch.ts); never
 * throws except on abort.
 */
export async function downloadImage(url: string, maxBytes: number, signal?: AbortSignal): Promise<DownloadedImage | null> {
  try {
    const { response: res } = await fetchLink(url, {
      signal: withTimeout(signal, PAGE_TIMEOUT_MS),
      headers: { 'user-agent': DESKTOP_UA, accept: 'image/webp,image/jpeg,image/png,image/*;q=0.8' },
    });
    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    const bytes = await readLimited(res, maxBytes);
    const type = sniffImage(bytes);
    return type ? { bytes, type } : null;
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}
