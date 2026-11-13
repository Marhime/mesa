// The creators' two sections in Recipes: "Your creators" (a pill each, "2 new" on it) and "New from your
// creators" (their new recipe videos: Save, Watch, Not now).
import { useCreatorNews, useMarkVideosSeen } from './creatorNews';
import type { CreatorTarget } from './creatorVideos';
import { followedTarget, useFollowedCreators } from './creators';
import { useSaveVideo } from './saveVideo';
import { useOpenInApp } from './system';

/** "Your creators": one pill per followed creator, with "2 new" when they posted; a tap opens their latest recipes. */
export function useCreatorRail(open: (target: CreatorTarget) => void) {
  const followed = useFollowedCreators();
  const { counts } = useCreatorNews();
  const list = followed.data ?? [];
  return {
    creators: list.map((c) => {
      const fresh = counts.get(c.channel_id) ?? 0;
      return { key: c.channel_id, name: c.name, badge: fresh > 0 ? `${fresh} new` : undefined };
    }),
    onOpen: (key: string) => {
      const c = list.find((x) => x.channel_id === key);
      if (c) open(followedTarget(c));
    },
  };
}

export interface NewFromCreatorsOptions {
  /** A failed save, in the person's words ("Too many imports today…"). */
  onError: (message: string) => void;
}

/**
 * "New from your creators": `save` starts one import and the video is no longer new; `dismiss` ("Not
 * now") only makes it not new; `watch` opens it in the in-app browser.
 */
export function useNewFromCreators({ onError }: NewFromCreatorsOptions) {
  const { videos } = useCreatorNews();
  const { mutate: markSeen } = useMarkVideosSeen();
  const openInApp = useOpenInApp();
  const saver = useSaveVideo(onError);
  const find = (key: string) => videos.find((v) => v.key === key);

  return {
    videos,
    /** The video whose import is starting. */
    savingKey: saver.saving,
    onSave: (key: string) => {
      const video = find(key);
      // Saved: no longer new.
      if (video) saver.save(key, video, () => markSeen({ ids: [key] }));
    },
    onWatch: (key: string) => {
      const video = find(key);
      if (video) openInApp(video.url);
    },
    onDismiss: (key: string) => markSeen({ ids: [key] }),
  };
}
