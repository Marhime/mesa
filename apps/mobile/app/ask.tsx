import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { useAskMesaScreen } from '@/data';
import { AskMesaView } from '@/ds';

/**
 * Ask Mesa, the one assistant, over the whole app (it rises from the Mesa button). Only the × closes it; a
 * recipe opened from an answer comes over it, and Back returns to the conversation.
 */
export default function AskScreen() {
  const router = useRouter();
  const ask = useAskMesaScreen();
  const setShown = ask?.setShown;
  const [focused, setFocused] = useState(false);

  // On screen only while focused: a recipe over it means its news may need a toast again.
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setShown?.(true);
      return () => {
        setFocused(false);
        setShown?.(false);
      };
    }, [setShown]),
  );

  if (!ask) return null;
  const { setShown: _shown, ...view } = ask;
  return <AskMesaView {...view} active={focused} onClose={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;
}
