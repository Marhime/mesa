import { useRef, type ComponentRef } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '../atoms/Chip';
import { Stack } from '../atoms/Stack';
import { Text } from '../atoms/Text';
import { useKeyboardShown } from '../keyboard';
import { ChipRow } from '../molecules/ChipRow';
import { Composer } from '../molecules/Composer';
import { ModalBar } from '../molecules/ModalBar';
import { ToastOutlet } from '../molecules/Toast';
import { Reveal } from '../molecules/Reveal';
import { createStyles } from '../theme';
import { layout, space } from '../tokens';
import { AskTurn, type AskTurnProps } from './AskTurn';

export interface AskMesaTurn extends Pick<AskTurnProps, 'question' | 'state' | 'draft' | 'answer' | 'message' | 'recipes' | 'actions' | 'find'> {
  key: string;
  /** Try again under a failed answer (the last question, when asking again can work today). */
  canRetry: boolean;
  /** Try again under a failed search (when looking again can work today). */
  canRetryFind: boolean;
}

export interface AskMesaViewProps {
  onClose: () => void;
  /** On screen (not under a recipe opened from it): toasts show at the top, clear of the field and keyboard. */
  active: boolean;
  /** The recipe questions are about ("Tinga"): a chip over the field, × to ask about the whole kitchen. */
  about: string | null;
  onClearAbout: () => void;
  /** The conversation, oldest first. */
  turns: AskMesaTurn[];
  /** Questions to start with, from what is going on in the kitchen: a tap asks it. */
  starters: string[];
  onStarter: (question: string) => void;
  draft: string;
  onChangeDraft: (text: string) => void;
  /** Something to ask, and Mesa isn't still thinking about the last question. */
  canSend: boolean;
  onSend: () => void;
  maxLength: number;
  onRetry: () => void;
  /** Opens a recipe the answer points to. */
  onRecipe: (recipeKey: string) => void;
  onAction: (turnKey: string, actionKey: string) => void;
  onSaveVideo: (turnKey: string, videoKey: string) => void;
  onWatchVideo: (turnKey: string, videoKey: string) => void;
  onRetryFind: (turnKey: string) => void;
  /** A new conversation; null while there is none or Mesa is thinking. */
  onStartOver: (() => void) | null;
}

/**
 * "Ask Mesa", the one assistant, on its own screen: nothing closes it but the ×. The conversation fills
 * the screen and stays in view as it grows; before the first question, a line and a few starters sit just
 * over the field, where the thumb is. The field stays at the bottom, over the keyboard.
 */
export function AskMesaView({
  onClose,
  active,
  about,
  onClearAbout,
  turns,
  starters,
  onStarter,
  draft,
  onChangeDraft,
  canSend,
  onSend,
  maxLength,
  onRetry,
  onRecipe,
  onAction,
  onSaveVideo,
  onWatchVideo,
  onRetryFind,
  onStartOver,
}: AskMesaViewProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardShown();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const empty = turns.length === 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ModalBar
        title="Ask Mesa"
        action={onStartOver ? <Chip label="New" icon="add" accessibilityLabel="New conversation" onPress={onStartOver} /> : undefined}
        onClose={onClose}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.fill}>
        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={[styles.content, empty ? styles.atBottom : null]}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {empty ? (
            <Reveal motion="fade">
              <Stack gap="lg">
                <Text variant="body" color="inkMuted">
                  {about
                    ? `Anything about ${about}: swaps, servings, timing. Mesa knows what's at home.`
                    : "What to cook, what's at home, what to buy, new recipes to try. Mesa answers from your kitchen."}
                </Text>
                {starters.length > 0 ? (
                  <ChipRow wrap accessibilityLabel="Questions to start with">
                    {starters.map((q) => (
                      <Chip key={q} label={q} onPress={() => onStarter(q)} />
                    ))}
                  </ChipRow>
                ) : null}
              </Stack>
            </Reveal>
          ) : (
            turns.map((t) => (
              <AskTurn
                key={t.key}
                question={t.question}
                state={t.state}
                draft={t.draft}
                answer={t.answer}
                message={t.message}
                recipes={t.recipes}
                actions={t.actions}
                find={t.find}
                onRecipe={onRecipe}
                onAction={(actionKey) => onAction(t.key, actionKey)}
                onRetry={t.canRetry ? onRetry : undefined}
                onSaveVideo={(videoKey) => onSaveVideo(t.key, videoKey)}
                onWatchVideo={(videoKey) => onWatchVideo(t.key, videoKey)}
                onRetryFind={t.canRetryFind ? () => onRetryFind(t.key) : undefined}
              />
            ))
          )}
        </ScrollView>
        <View style={[styles.composer, { paddingBottom: keyboard ? space.sm : Math.max(insets.bottom, space.lg) }]}>
          <Composer
            label="Your question"
            placeholder={about ? 'No cream? For 2? Make it ahead?' : 'Ask Mesa…'}
            value={draft}
            onChangeText={onChangeDraft}
            canSend={canSend}
            onSend={onSend}
            sendLabel="Ask"
            maxLength={maxLength}
            autoFocus={empty}
            above={
              about ? (
                <Chip
                  label={`About ${about}`}
                  icon="close"
                  selected
                  accessibilityLabel={`Asking about ${about}`}
                  accessibilityHint="Removes it, to ask about your whole kitchen"
                  onPress={onClearAbout}
                />
              ) : undefined
            }
          />
        </View>
      </KeyboardAvoidingView>
      <ToastOutlet active={active} />
    </View>
  );
}

const useStyles = createStyles((t) => ({
  root: { flex: 1, backgroundColor: t.colors.surface },
  fill: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: layout.screenMargin, paddingTop: space.lg, paddingBottom: space.xl, gap: space.xxl },
  // Before the first question: the starters wait just over the field.
  atBottom: { justifyContent: 'flex-end' },
  composer: { paddingHorizontal: layout.screenMargin, paddingTop: space.sm, backgroundColor: t.colors.surface },
}));
