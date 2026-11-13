import { Button } from '../atoms/Button';
import { TextField } from '../atoms/TextField';
import { Banner } from '../molecules/Banner';
import { Field } from '../molecules/Field';
import { Sheet } from '../molecules/Sheet';

export interface JoinKitchenSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The current kitchen's name, to say what is left behind. */
  currentName: string;
  /** The code as typed so far, as the field shows it ("ABCDE-FG"). */
  code: string;
  /** Receives what was typed or pasted; the screen keeps only the code. */
  onChangeCode: (text: string) => void;
  /** The whole code is there: Join can be tapped. */
  ready: boolean;
  onJoin: () => void;
  joining?: boolean;
  error?: string | null;
}

/**
 * Moves to someone else's kitchen with their invite code (created a kitchen by mistake, or moved in). It opens
 * with an empty field, so a typed code asks before closing.
 */
export function JoinKitchenSheet({ visible, onClose, currentName, code, onChangeCode, ready, onJoin, joining, error }: JoinKitchenSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      unsaved={code.length > 0}
      title="Join another kitchen"
      description={`You'll leave ${currentName}. Its list, recipes and pantry stay there.`}
      footer={<Button label="Join kitchen" size="lg" fullWidth disabled={!ready} loading={joining} onPress={onJoin} />}
    >
      <Field label="Invite code" hint="Ask for it in their Settings → Invite partner. Pasting their whole message works too.">
        <TextField
          code
          label="Invite code"
          placeholder="K7M2Q-X9P4T"
          value={code}
          onChangeText={onChangeCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          returnKeyType="join"
          onSubmitEditing={() => ready && onJoin()}
        />
      </Field>
      {error ? <Banner tone="danger" text={error} /> : null}
    </Sheet>
  );
}
