import type { ReactNode } from 'react';
import { View } from 'react-native';

import { IconButton } from '../atoms/IconButton';
import { TextField } from '../atoms/TextField';
import { createStyles } from '../theme';
import { size, space } from '../tokens';

export interface ComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  /** Spoken name of the field ("Your question"). */
  label: string;
  placeholder?: string;
  /** Something to send, and nothing on its way. */
  canSend: boolean;
  onSend: () => void;
  /** Spoken label of the send button (default "Send"). */
  sendLabel?: string;
  autoFocus?: boolean;
  maxLength?: number;
  /** Over the field, on its left edge: what the next message is about. */
  above?: ReactNode;
}

/**
 * Where a message is written, at the bottom of a conversation: a field that grows with the words and the
 * send button beside its last line. Return sends, like the button.
 */
export function Composer({ value, onChangeText, label, placeholder, canSend, onSend, sendLabel = 'Send', autoFocus, maxLength, above }: ComposerProps) {
  const styles = useStyles();
  return (
    <View style={styles.wrap}>
      {above ? <View style={styles.above}>{above}</View> : null}
      <View style={styles.row}>
        <View style={styles.field}>
          <TextField
            label={label}
            placeholder={placeholder}
            value={value}
            onChangeText={onChangeText}
            grow
            autoFocus={autoFocus}
            maxLength={maxLength}
            returnKeyType="send"
            submitBehavior="submit"
            onSubmitEditing={() => {
              if (canSend) onSend();
            }}
          />
        </View>
        <View style={styles.send}>
          <IconButton icon="send" variant="ink" accessibilityLabel={sendLabel} disabled={!canSend} onPress={onSend} />
        </View>
      </View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  wrap: { gap: space.sm },
  // The chip keeps its own width.
  above: { alignSelf: 'flex-start' },
  // The button stays by the last line as the field grows.
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  field: { flex: 1 },
  // Centered on a one-line field.
  send: { paddingBottom: (size.field - size.iconButton) / 2 },
}));
