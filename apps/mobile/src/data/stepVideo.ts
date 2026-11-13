// "▶ 2:14" on a recipe step: where it starts in the source video (recipe_steps.start_s, YouTube only).
// Pure.

const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/;
const YOUTUBE = /^https?:\/\/(?:[a-z0-9-]+\.)*(youtube\.com|youtube-nocookie\.com|youtu\.be)(\/[^?#]*)?(\?[^#]*)?/i;

/** The id of a YouTube video link (watch?v=, youtu.be/, shorts/, embed/, live/); null for anything else. */
export function youtubeVideoId(url: string | null): string | null {
  const m = url ? YOUTUBE.exec(url.trim()) : null;
  if (!m) return null;
  const host = m[1]!.toLowerCase();
  const path = m[2] ?? '';
  const query = m[3] ?? '';
  const id =
    host === 'youtu.be'
      ? path.split('/')[1]
      : /^\/watch\/?$/i.test(path)
        ? /[?&]v=([^&]+)/.exec(query)?.[1]
        : /^\/(?:shorts|embed|live|v)\/([^/]+)/i.exec(path)?.[1];
  return id && VIDEO_ID.test(id) ? id : null;
}

/** 134 → "2:14", 3725 → "1:02:05". */
export function clockLabel(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export interface StepVideoLink {
  /** "2:14". */
  time: string;
  url: string;
}

/** The moment a step starts in the recipe's YouTube video; null when the source isn't YouTube or the step has no time. */
export function stepVideoLink(sourceUrl: string | null, startS: number | null | undefined): StepVideoLink | null {
  if (startS == null || !Number.isFinite(startS) || startS < 0) return null;
  const id = youtubeVideoId(sourceUrl);
  if (!id) return null;
  const s = Math.floor(startS);
  return { time: clockLabel(s), url: `https://www.youtube.com/watch?v=${id}&t=${s}s` };
}
