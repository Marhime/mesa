// Small text helpers for UI copy. Pure.
import type { ImportPlatform } from '@mesa/shared';

/** "Thursday, Nov 5". */
export function formatOverlineDate(d: Date): string {
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(d);
  } catch {
    return d.toDateString();
  }
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const URL_RE = /https?:\/\/[^\s<>"']+/i;

/** The first http(s) URL in a text, if any. */
export function findUrl(text: string | null | undefined): string | null {
  const m = URL_RE.exec(text ?? '');
  return m ? m[0].replace(/[).,;!?]+$/, '') : null;
}

export function isUrl(text: string): boolean {
  const t = text.trim();
  return /^https?:\/\/\S+$/i.test(t) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(t);
}

export function normalizeUrl(text: string): string {
  const t = text.trim();
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

/** "youtube.com", "instagram.com" — the bit people recognise. */
export function hostOf(url: string | null): string | null {
  if (!url) return null;
  const m = /^https?:\/\/([^/?#]+)/i.exec(url);
  return m ? m[1]!.replace(/^www\.|^m\./i, '') : null;
}

const PLATFORM_LABEL: Record<ImportPlatform, string | null> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  web: null,
  image: 'a screenshot',
  text: 'pasted text',
  manual: null,
  other: null,
};

/** "From YouTube", "From bonappetit.com", or null for recipes written by hand. */
export function sourceLine(platform: ImportPlatform, url: string | null): string | null {
  const label = PLATFORM_LABEL[platform] ?? hostOf(url);
  return label ? `From ${label}` : null;
}

/** Guess the platform of a link for display while it is still importing. */
export function platformOfUrl(url: string | null): string | null {
  const host = hostOf(url);
  if (!host) return null;
  if (/youtu\.?be/.test(host)) return 'YouTube';
  if (/instagram/.test(host)) return 'Instagram';
  if (/tiktok/.test(host)) return 'TikTok';
  return host;
}

export function formatMinutes(min: number | null): string | null {
  if (min === null || min <= 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
