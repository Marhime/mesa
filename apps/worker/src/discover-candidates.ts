// One video "For you" or "Find me" may show, wherever it was found (a search, a followed creator's new
// video, the uploads of a creator the household cooks from), and what its page adds once opened.
import { thumbnailFor, watchUrl } from './creator-videos';
import type { ChannelListing, FlatVideo } from './ytdlp-channel';
import type { SearchHit, VideoDetails } from './youtube-search';

/** Where a candidate came from: the search that found it, or a creator the household knows. */
export type Origin = { kind: 'search'; query: string } | { kind: 'followed' } | { kind: 'creator' };

export interface Candidate {
  /** YouTube video id. */
  id: string;
  /** https://www.youtube.com/watch?v=… (the same form as recipes.source_url). */
  url: string;
  title: string;
  channel: string | null;
  channelId: string | null;
  description: string | null;
  /** Seconds. */
  duration: number | null;
  views: number | null;
  likes: number | null;
  /** The channel's subscribers. */
  followers: number | null;
  /** Unix seconds. */
  uploadedAt: number | null;
  /** ISO 639-1 when YouTube says it. */
  language: string | null;
  /** Already known (a followed creator's video was named when it was first seen). */
  dish: string | null;
  thumbnail: string;
  short: boolean;
  liveStatus: string | null;
  availability: string | null;
  origin: Origin;
  /** Its own page was opened (views, likes and channel size are known). */
  verified: boolean;
}

/** A creator_videos row (a followed creator's recipe video, seen by the daily look). */
export interface FollowedVideoRow {
  url: string;
  title: string;
  dish: string | null;
  views: number | null;
  duration_s: number | null;
  channel_id: string;
}

function fromFlat(v: FlatVideo, channel: string | null, channelId: string | null, origin: Origin): Candidate {
  return {
    id: v.id,
    url: watchUrl(v.id),
    title: v.title,
    channel,
    channelId,
    description: v.description,
    duration: v.duration,
    views: v.views,
    likes: null,
    followers: null,
    uploadedAt: v.timestamp,
    language: null,
    dish: null,
    thumbnail: thumbnailFor(v.id),
    short: v.short,
    liveStatus: v.liveStatus,
    availability: v.availability,
    origin,
    verified: false,
  };
}

export const fromSearchHit = (hit: SearchHit, query: string): Candidate => fromFlat(hit, hit.channel, hit.channelId, { kind: 'search', query });

export const fromUploads = (listing: ChannelListing, fallback: { channelId: string; name: string }): Candidate[] =>
  listing.videos.map((v) => fromFlat(v, listing.name ?? fallback.name, listing.channelId ?? fallback.channelId, { kind: 'creator' }));

/** A followed creator's video; null when its link isn't a YouTube video. */
export function fromFollowedVideo(row: FollowedVideoRow, creator: string, videoId: string | null): Candidate | null {
  if (!videoId) return null;
  return {
    ...fromFlat(
      { id: videoId, title: row.title, description: null, views: row.views, duration: row.duration_s, liveStatus: null, availability: null, timestamp: null, short: false },
      creator,
      row.channel_id,
      { kind: 'followed' },
    ),
    dish: row.dish,
  };
}

/** What the video's own page says wins over the flat listing. */
export function withDetails(c: Candidate, d: VideoDetails): Candidate {
  return {
    ...c,
    title: d.title ?? c.title,
    channel: d.channel ?? c.channel,
    channelId: d.channelId ?? c.channelId,
    description: d.description ?? c.description,
    duration: d.duration ?? c.duration,
    views: d.views ?? c.views,
    likes: d.likes,
    followers: d.followers,
    uploadedAt: d.uploadedAt ?? c.uploadedAt,
    language: d.language ?? c.language,
    short: c.short || d.short,
    liveStatus: d.liveStatus ?? c.liveStatus,
    availability: d.availability ?? c.availability,
    verified: true,
  };
}
