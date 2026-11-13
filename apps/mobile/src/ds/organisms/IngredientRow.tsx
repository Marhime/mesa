import type { Picto } from '@mesa/shared';
import { View } from 'react-native';
import Animated, { LayoutAnimationConfig } from 'react-native-reanimated';

import { Icon } from '../atoms/Icon';
import { IconButton } from '../atoms/IconButton';
import { markIn } from '../motion';
import { createStyles } from '../theme';
import { size } from '../tokens';
import { FoodRow } from './FoodRow';

export interface IngredientRowProps {
  name: string;
  /** Scaled, formatted quantity ("375 g"); empty when none. */
  quantity: string;
  picto: Picto;
  /** At home or to buy; omitted while the pantry loads. */
  status?: 'have' | 'buy';
  /** At home and should be used soon. */
  soon?: boolean;
  /** The source did not give the amount: we guessed it. */
  estimated?: boolean;
  optional?: boolean;
  /** Change its name or amount (opens the editor). */
  onPress?: () => void;
  /** It's actually at home: the empty mark becomes a button ("I have it", the `check` haptic at the touch). */
  onMarkHave?: () => void;
}

/**
 * One ingredient on one line, like a cookbook: picto, the amount in its own column, the name, and a mark
 * at the end: ✓ at home, ○ not yet (tap it when you have it). Optional, use soon or a guessed amount
 * add a muted line.
 */
export function IngredientRow({ name, quantity, picto, status, soon, estimated, optional, onPress, onMarkHave }: IngredientRowProps) {
  const styles = useStyles();
  const amount = estimated && quantity ? `≈ ${quantity}` : quantity;
  const detail = [optional ? 'optional' : null, soon ? 'use soon' : null, estimated ? 'amount guessed, tap to fix' : null].filter(Boolean).join(' · ');
  const statusText = status === 'have' ? 'at home' : status === 'buy' ? 'not at home, on your list' : null;
  return (
    <FoodRow
      picto={picto}
      title={name}
      amount={amount}
      detail={detail || undefined}
      detailIcon={estimated ? 'warning' : undefined}
      onPress={onPress}
      accessibilityLabel={[estimated && quantity ? `about ${quantity}` : quantity, name, detail, statusText].filter(Boolean).join(', ')}
      accessibilityHint={onPress ? 'Change the name or amount' : undefined}
      trailing={
        status ? (
          <View style={styles.mark}>
            {/* The ✓ settles in when it changes, not as the list opens. */}
            <LayoutAnimationConfig skipEntering>
              {status === 'have' ? (
                <Animated.View entering={markIn()}>
                  <Icon name="checkCircle" color="success" weight="fill" />
                </Animated.View>
              ) : onMarkHave ? (
                <IconButton
                  icon="circle"
                  variant="plain"
                  accessibilityLabel={`I have ${name}`}
                  accessibilityHint="Marks it as at home and takes it off the list"
                  haptic="check"
                  onPress={onMarkHave}
                />
              ) : (
                <Icon name="circle" color="inkMuted" />
              )}
            </LayoutAnimationConfig>
          </View>
        ) : undefined
      }
    />
  );
}

const useStyles = createStyles(() => ({
  // Marks and buttons share one column, so they line up down the list.
  mark: { width: size.iconButton, alignItems: 'center' },
}));
