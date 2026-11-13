import { useState } from 'react';

import { friendlyError, signOut, useCreateHousehold, useInviteCodeInput, useJoinHousehold } from '@/data';
import { Banner, Button, ConfirmSheet, Field, LargeTitle, Screen, SegmentedControl, Stack, Stepper, TextField } from '@/ds';

type Mode = 'join' | 'create';

export default function HouseholdSetupScreen() {
  // Joining comes first: most people arrive with a code from someone who already uses Mesa,
  // and a kitchen created by mistake can't be merged into theirs later.
  const [mode, setMode] = useState<Mode>('join');
  const [name, setName] = useState('');
  const [servings, setServings] = useState(3);
  const code = useInviteCodeInput();
  const [confirming, setConfirming] = useState(false);
  const create = useCreateHousehold();
  const join = useJoinHousehold();

  const error = mode === 'create' ? create.error : join.error;
  const joinWithCode = () => code.ready && join.mutate(code.code);

  return (
    <Screen centered gap="xxl">
      <LargeTitle
        overline="Welcome to Mesa"
        title="Set up your kitchen"
        subtitle="One list, one recipe box and one pantry, shared by everyone at home."
      />
      <SegmentedControl<Mode>
        accessibilityLabel="Join a kitchen or start a new one"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'join', label: 'Join with a code' },
          { value: 'create', label: 'Start a new one' },
        ]}
      />

      {mode === 'join' ? (
        <Stack gap="xl">
          <Field label="Invite code" hint="Your partner finds it in Settings → Invite partner. Pasting their whole message works too.">
            <TextField
              code
              label="Invite code"
              placeholder="K7M2Q-X9P4T"
              value={code.value}
              onChangeText={code.onChangeText}
              autoCapitalize="characters"
              autoCorrect={false}
              autoComplete="off"
              returnKeyType="join"
              onSubmitEditing={joinWithCode}
            />
          </Field>
          <Button label="Join kitchen" size="lg" fullWidth disabled={!code.ready} loading={join.isPending} onPress={joinWithCode} />
        </Stack>
      ) : (
        <Stack gap="xl">
          <Field label="Kitchen name">
            <TextField label="Kitchen name" placeholder="Our kitchen" value={name} onChangeText={setName} autoCapitalize="words" />
          </Field>
          <Field inline label="Default servings" hint="Recipes scale to this">
            <Stepper value={servings} onChange={setServings} min={1} max={20} label="Default servings" />
          </Field>
          <Button label="Start my kitchen" size="lg" fullWidth loading={create.isPending} onPress={() => setConfirming(true)} />
        </Stack>
      )}

      {error ? <Banner tone="danger" text={friendlyError(error)} /> : null}
      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />

      <ConfirmSheet
        visible={confirming}
        title="Start a new kitchen?"
        text="If someone at home already uses Mesa, join theirs with their code instead: two kitchens can't be merged later."
        confirmLabel="Start my kitchen"
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          create.mutate({ name: name.trim() || 'Home', servings });
        }}
      />
    </Screen>
  );
}
