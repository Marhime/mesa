// The creator sheet behind "More from Food is Love", "Your creators" and a pasted or shared channel
// link: their latest recipe videos to pick from (up to 10 at a time) and import, Follow, and Watch one
// in the in-app browser before saving it. One for the app (askSheets.tsx); closing it while Mesa is
// still listing leaves the job running (the working bar, then a toast or a push).
import { useEffect, useRef, useState } from 'react';

import { plural } from '../lib/text';
import { useLeavable } from './askOutcome';
import { useMarkVideosSeen } from './creatorNews';
import { useFollowCreator, useFollowedCreators, useMarkCreatorSeen } from './creators';
import { useCreatorVideos, type CreatorRef, type CreatorTarget, type CreatorVideoView } from './creatorVideos';
import { friendlyError, isQuotaError } from './errors';
import { useImportVideos } from './imports';
import type { Notify } from './notice';
import { useOpenInApp } from './system';

/** Imports started at once from a creator's sheet. */
export const MAX_VIDEO_IMPORTS = 10;
const NONE: ReadonlySet<string> = new Set();

export interface CreatorSheetOptions {
  /** Says what started (a toast): "Importing 3 recipes from Food is Love". */
  notify: Notify;
}

/** Whose videos to show; `onClose` runs once when the sheet closes (a shared link's screen leaves). */
export interface CreatorOpen {
  target: CreatorTarget;
  onClose?: () => void;
}

/** What Follow knows before the list says: a followed creator, or a recipe that knows its channel. */
function refFromTarget(t: CreatorTarget | null): CreatorRef | null {
  if (!t || !('url' in t) || !t.name || !t.channelId || !/^https:\/\//i.test(t.url)) return null;
  return { channelId: t.channelId, name: t.name, url: t.url, platform: 'youtube' };
}

/** "Importing 3 recipes from Food is Love"; when some could not start, how many did and why not the rest. */
function startedLine(started: number, asked: number, who: string, error: unknown): string {
  if (started === asked) return `Importing ${plural(started, 'recipe', 'recipes')} from ${who}`;
  const why = isQuotaError(error) ? 'Too many imports today: try the rest tomorrow.' : "Couldn't start the rest.";
  return `Importing ${started} of ${asked} from ${who}. ${why}`;
}

/** `open({ target })` shows the sheet and lists the videos, `openJob(id)` shows a list asked earlier; `sheet` is ready for CreatorSheet. */
export function useCreatorSheet({ notify }: CreatorSheetOptions) {
  const [picked, setPicked] = useState<ReadonlySet<string>>(NONE);
  const [error, setError] = useState<string | null>(null);
  // Started from this sheet: shown as saved until the list is asked anew.
  const [started, setStarted] = useState<ReadonlySet<string>>(NONE);
  const list = useCreatorVideos();
  // Left while Mesa is still listing: the moment to offer telling them when it's ready.
  const { visible, show: reveal, leave } = useLeavable(list.state === 'working');
  const afterClose = useRef<(() => void) | null>(null);
  const followed = useFollowedCreators();
  const follow = useFollowCreator();
  const { mutate: markSeen } = useMarkCreatorSeen();
  const { mutate: markNewsSeen } = useMarkVideosSeen();
  const importVideos = useImportVideos();
  const openInApp = useOpenInApp();

  const ref = list.creator ?? refFromTarget(list.target);
  const channelId = list.creator?.channelId ?? list.target?.channelId ?? null;
  const following = !!channelId && (followed.data ?? []).some((c) => c.channel_id === channelId);
  const videos: CreatorVideoView[] = list.videos.map((v) => (started.has(v.key) ? { ...v, saved: true } : v));
  const chosen = videos.filter((v) => picked.has(v.key) && !v.saved);
  const who = list.name ?? 'this creator';

  // Opening a followed creator's sheet is looking at their videos: what came before is no longer new
  // (nor their videos in "New from your creators").
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) {
      seen.current = null;
      return;
    }
    if (!following || !channelId || seen.current === channelId) return;
    seen.current = channelId;
    markSeen(channelId);
    markNewsSeen({ channelId });
  }, [visible, following, channelId, markSeen, markNewsSeen]);

  const close = () => {
    leave();
    const after = afterClose.current;
    afterClose.current = null;
    after?.();
  };

  // Already up (over a shared link's screen): it keeps what closing it does, unless told otherwise.
  const show = (onClose: (() => void) | undefined) => {
    if (onClose || !visible) afterClose.current = onClose ?? null;
    reveal();
    setPicked(NONE);
    setError(null);
  };

  const startImports = () => {
    if (chosen.length === 0) return;
    setError(null);
    importVideos.mutate(
      chosen.map((v) => ({ url: v.url, title: v.title })),
      {
        onSuccess: (result) => {
          if (result.started === 0) {
            setError(friendlyError(result.error, "Couldn't start the imports. Try again."));
            return;
          }
          const done = chosen.slice(0, result.started).map((v) => v.key);
          setStarted((prev) => new Set([...prev, ...done]));
          setPicked(NONE);
          close();
          notify(startedLine(result.started, chosen.length, who, result.error));
        },
        onError: (e) => setError(friendlyError(e, "Couldn't start the imports. Try again.")),
      },
    );
  };

  return {
    /** The job on show (null until queued). */
    jobId: list.jobId,
    open: ({ target, onClose }: CreatorOpen) => {
      show(onClose);
      list.load(target);
    },
    openJob: (jobId: string) => {
      show(undefined);
      list.follow(jobId);
    },
    sheet: {
      visible,
      onClose: close,
      name: list.name,
      follow: ref ? { following, onToggle: () => follow.mutate({ creator: ref, follow: !following }) } : null,
      state: list.state,
      videos,
      picked: new Set(chosen.map((v) => v.key)) as ReadonlySet<string>,
      max: MAX_VIDEO_IMPORTS,
      onToggle: (key: string) =>
        setPicked((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else if (next.size < MAX_VIDEO_IMPORTS) next.add(key);
          return next;
        }),
      onWatch: (key: string) => openInApp(key),
      message: list.message,
      onRetry: list.canRetry
        ? () => {
            setStarted(NONE);
            list.retry();
          }
        : undefined,
      onImport: startImports,
      importing: importVideos.isPending,
      error,
    },
  };
}
