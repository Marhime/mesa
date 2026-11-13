// "Save" on a recipe video (New from your creators, For you, Ask Mesa's searches): one import at a time;
// what happens next (seen, saved) runs once the import is queued, even if the screen was left meanwhile.
import { useState } from 'react';

import { friendlyError } from './errors';
import { useCreateImport } from './imports';

export function useSaveVideo(onError: (message: string) => void) {
  const { mutateAsync } = useCreateImport();
  const [saving, setSaving] = useState<string | null>(null);
  return {
    /** The key of the video whose import is starting. */
    saving,
    /** Starts its import (nothing while another one starts); `then` once it is queued. */
    save: (key: string, video: { url: string; title: string }, then?: () => void) => {
      if (saving) return;
      setSaving(key);
      // mutateAsync: `then` runs even if the screen is left before the import is queued.
      mutateAsync({ url: video.url, title: video.title })
        .then(() => then?.())
        .catch((e: unknown) => onError(friendlyError(e, "Couldn't save it. Try again.")))
        .finally(() => setSaving(null));
    },
  };
}
