import { useState, type Ref } from 'react';
import { TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';

import { createStyles, useTheme } from '../theme';
import { border, maxFontScale, radius, size, space, typography } from '../tokens';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';
import { Touchable } from './Touchable';

type PassThrough = Pick<
  TextInputProps,
  | 'autoFocus'
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoCorrect'
  | 'autoComplete'
  | 'textContentType'
  | 'returnKeyType'
  | 'onSubmitEditing'
  | 'submitBehavior'
  | 'maxLength'
  | 'onFocus'
  | 'onBlur'
  | 'onEndEditing'
  | 'editable'
  | 'onContentSizeChange'
  | 'selectTextOnFocus'
  | 'inputMode'
  | 'secureTextEntry'
  | 'passwordRules'
>;

export interface TextFieldProps extends PassThrough {
  value: string;
  onChangeText: (text: string) => void;
  /** Spoken label; also used as placeholder when none is given. */
  label: string;
  placeholder?: string;
  icon?: IconName;
  /** Shows a clear button while there is text. */
  clearable?: boolean;
  /** Multi-line field (radius lg). `rows` sets the resting height. */
  multiline?: boolean;
  rows?: number;
  /** Pill that grows with its content (QuickAddField): radius switches to lg past one line. */
  grow?: boolean;
  error?: string | null;
  hint?: string;
  /** Larger, centered text (one-time codes, invite codes). */
  code?: boolean;
  ref?: Ref<TextInputInstance>;
}

/** Text input. Pill, 52 high; multiline variant uses radius lg. */
export function TextField({
  value,
  onChangeText,
  label,
  placeholder,
  icon,
  clearable,
  multiline,
  rows = 4,
  grow,
  error,
  hint,
  code,
  ref,
  onFocus,
  onBlur,
  onContentSizeChange,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const styles = useStyles();
  const [focused, setFocused] = useState(false);
  const [tall, setTall] = useState(false);
  const isMulti = multiline || grow;
  const rounded = multiline || (grow && tall);
  const lineHeight = typography.input.lineHeight;

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.box,
          rounded ? styles.boxRounded : null,
          multiline ? { minHeight: rows * lineHeight + space.lg * 2 } : null,
          focused ? styles.boxFocused : null,
          error ? styles.boxError : null,
        ]}
      >
        {icon ? (
          <View style={[styles.icon, rounded ? styles.iconTop : null]}>
            <Icon name={icon} color="inkMuted" />
          </View>
        ) : null}
        <TextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={theme.colors.inkMuted}
          accessibilityLabel={label}
          accessibilityHint={hint}
          selectionColor={theme.colors.ink}
          cursorColor={theme.colors.ink}
          keyboardAppearance={theme.scheme}
          multiline={isMulti}
          maxFontSizeMultiplier={maxFontScale}
          scrollEnabled={!grow}
          textAlignVertical={isMulti ? 'top' : 'center'}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          onContentSizeChange={(e) => {
            if (grow) setTall(e.nativeEvent.contentSize.height > lineHeight * 1.5);
            onContentSizeChange?.(e);
          }}
          style={[
            styles.input,
            isMulti ? styles.inputMulti : null,
            code ? styles.inputCode : null,
            { color: theme.colors.ink },
          ]}
          {...rest}
        />
        {clearable && value.length > 0 ? (
          <Touchable
            onPress={() => onChangeText('')}
            accessibilityLabel={`Clear ${label.toLowerCase()}`}
            style={[styles.clear, rounded ? styles.iconTop : null]}
          >
            <Icon name="close" size="sm" color="inkMuted" />
          </Touchable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="inkMuted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((t) => ({
  wrap: { gap: space.xs, alignSelf: 'stretch' },
  box: {
    minHeight: size.field,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    borderWidth: border.control,
    borderColor: t.colors.lineStrong,
    backgroundColor: t.colors.surfaceRaised,
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  boxRounded: { borderRadius: radius.lg, alignItems: 'flex-start' },
  boxFocused: { borderColor: t.colors.ink },
  boxError: { borderColor: t.colors.danger, borderWidth: border.strong },
  icon: { justifyContent: 'center' },
  iconTop: { paddingTop: space.md },
  input: {
    flex: 1,
    fontFamily: typography.input.fontFamily,
    fontSize: typography.input.fontSize,
    minHeight: size.field - border.control * 2,
    paddingVertical: 0,
  },
  inputMulti: {
    lineHeight: typography.input.lineHeight,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  inputCode: {
    fontFamily: typography.title.fontFamily,
    fontSize: typography.title.fontSize,
    letterSpacing: space.sm,
    textAlign: 'center',
  },
  clear: {
    width: size.touch,
    height: size.touch,
    marginRight: -space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
