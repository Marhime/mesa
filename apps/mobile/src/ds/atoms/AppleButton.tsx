import * as AppleAuthentication from 'expo-apple-authentication';

import { createStyles, useTheme } from '../theme';
import { radius, size } from '../tokens';

export interface AppleButtonProps {
  onPress: () => void;
}

/**
 * Apple's own "Sign in with Apple" button (required by App Review), sized and rounded like our lg pills.
 * Render it only when Sign in with Apple is available.
 */
export function AppleButton({ onPress }: AppleButtonProps) {
  const theme = useTheme();
  const styles = useStyles();
  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
      buttonStyle={
        theme.scheme === 'dark'
          ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
          : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
      }
      cornerRadius={size.buttonLg / 2}
      style={styles.button}
      onPress={onPress}
    />
  );
}

const useStyles = createStyles(() => ({
  button: { height: size.buttonLg, alignSelf: 'stretch', borderRadius: radius.full },
}));
