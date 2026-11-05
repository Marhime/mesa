import { View } from 'react-native';

import { Button } from '../atoms/Button';
import { Equalizer } from '../atoms/Equalizer';
import { Text } from '../atoms/Text';
import { Banner } from '../molecules/Banner';
import { Sheet } from '../molecules/Sheet';
import { createStyles } from '../theme';
import { radius, size, space } from '../tokens';

export interface InviteSheetProps {
  visible: boolean;
  code: string | null;
  loading?: boolean;
  error?: string | null;
  onShare: () => void;
  onRetry: () => void;
  onClose: () => void;
}

/** Shows the 6-character invite code, big, with the native share sheet one tap away. */
export function InviteSheet({ visible, code, loading, error, onShare, onRetry, onClose }: InviteSheetProps) {
  const styles = useStyles();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Invite your partner"
      description="They open Mesa, choose Join, and type this code. It works for 7 days."
      footer={
        error ? (
          <Button label="Try again" size="lg" fullWidth onPress={onRetry} />
        ) : (
          <Button label="Share code" iconStart="share" size="lg" fullWidth disabled={!code} onPress={onShare} />
        )
      }
    >
      <View style={styles.codeBox}>
        {loading || (!code && !error) ? (
          <Equalizer size="lg" accessibilityLabel="Creating a code" />
        ) : code ? (
          <Text variant="display" align="center" selectable accessibilityLabel={`Invite code ${code.split('').join(' ')}`}>
            {code.split('').join(' ')}
          </Text>
        ) : null}
      </View>
      {error ? <Banner tone="danger" text={error} /> : null}
    </Sheet>
  );
}

const useStyles = createStyles((t) => ({
  codeBox: {
    minHeight: size.inviteCode * 2,
    borderRadius: radius.lg,
    backgroundColor: t.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.xxl,
  },
}));
