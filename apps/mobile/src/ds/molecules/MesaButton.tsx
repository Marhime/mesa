import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { showActions } from '../actionMenu';
import { Icon } from '../atoms/Icon';
import { Simmer } from '../atoms/Simmer';
import { Touchable } from '../atoms/Touchable';
import { rise, swapIn, swapOut } from '../motion';
import { createStyles } from '../theme';
import { border, radius, shadow, size } from '../tokens';

/** Something you asked Mesa for that is still working. */
export interface MesaWork {
  /** What Mesa is doing: "Ideas for tomato…". */
  title: string;
  /** How many other things are still working. */
  more?: number;
  /** Opens it (its sheet, Ask Mesa, or the recipe). */
  onOpen: () => void;
  /** Stops it. */
  onCancel: () => void;
}

export interface MesaButtonProps {
  /** Opens Ask Mesa. */
  onAsk: () => void;
  /** What Mesa is doing for you; null when nothing. */
  working: MesaWork | null;
}

const ASK_HINT = "Opens Mesa, your kitchen's assistant: what to cook, what's at home, what to buy";

const workLabel = (work: MesaWork) => `Mesa is working: ${work.title}${work.more ? ` And ${work.more} more.` : ''}`;

/**
 * Mesa on every tab: a small round button just above the tab bar, at its right end (TabBar `accessory`).
 * It stays put, whatever the tab and the scroll. ✦ opens Ask Mesa; while Mesa works on something you asked,
 * bubbles simmer in its place and a tap opens that. A long press (VoiceOver: its actions) asks Mesa
 * something else or stops it.
 */
export function MesaButton({ onAsk, working }: MesaButtonProps) {
  const styles = useStyles();
  const stop = working ? { label: 'Stop', destructive: true, onPress: working.onCancel } : null;
  return (
    <Animated.View entering={rise()}>
      <Touchable
        onPress={working ? working.onOpen : onAsk}
        onLongPress={working && stop ? () => showActions([{ label: 'Ask Mesa', onPress: onAsk }, stop], working.title) : undefined}
        feedback="scale"
        accessibilityRole="button"
        accessibilityLabel={working ? workLabel(working) : 'Ask Mesa'}
        accessibilityHint={working ? 'Opens it' : ASK_HINT}
        accessibilityActions={working ? [{ name: 'ask', label: 'Ask Mesa' }, { name: 'stop', label: 'Stop' }] : undefined}
        onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'ask' ? onAsk() : working?.onCancel())}
        style={styles.button}
      >
        {/* Both states fill the disc: the one leaving fades over the one arriving, nothing moves. */}
        <Animated.View key={working ? 'working' : 'ask'} entering={swapIn()} exiting={swapOut()} style={styles.face}>
          {working ? <Simmer size="sm" accessibilityLabel="In progress" /> : <Icon name="sparkle" color="ink" />}
        </Animated.View>
        {/* A hairline edge in dark mode, where the shadow disappears (like the tab bar). */}
        <View style={styles.edge} pointerEvents="none" />
      </Touchable>
    </Animated.View>
  );
}

const useStyles = createStyles((t) => ({
  button: {
    width: size.tabAccessory,
    height: size.tabAccessory,
    borderRadius: radius.full,
    backgroundColor: t.colors.surfaceRaised,
    ...shadow.lg,
  },
  face: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.full,
    borderWidth: border.hairline,
    borderColor: t.colors.floatEdge,
  },
}));
