import { useState } from 'react';

import { friendlyError, signOut, useCreateHousehold, useJoinHousehold } from '@/data';
import { Banner, Button, Field, LargeTitle, Screen, SegmentedControl, Stack, Stepper, TextField } from '@/ds';

type Mode = 'create' | 'join';
const CODE_LENGTH = 6;

export default function HouseholdSetupScreen() {
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState('');
  const [servings, setServings] = useState(3);
  const [code, setCode] = useState('');
  const create = useCreateHousehold();
  const join = useJoinHousehold();

  const error = mode === 'create' ? create.error : join.error;

  return (
    <Screen centered gap="xxl">
      <LargeTitle
        overline="Welcome to Mesa"
        title="Set up your kitchen"
        subtitle="One list and one recipe box, shared by everyone at home."
      />
      <SegmentedControl<Mode>
        accessibilityLabel="Create or join a household"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'create', label: 'Create' },
          { value: 'join', label: 'Join with a code' },
        ]}
      />

      {mode === 'create' ? (
        <Stack gap="xl">
          <Field label="Household name">
            <TextField label="Household name" placeholder="Our kitchen" value={name} onChangeText={setName} autoCapitalize="words" />
          </Field>
          <Field inline label="Default servings" hint="Recipes scale to this">
            <Stepper value={servings} onChange={setServings} min={1} max={20} label="Default servings" />
          </Field>
          <Button
            label="Create household"
            size="lg"
            fullWidth
            loading={create.isPending}
            onPress={() => create.mutate({ name: name.trim() || 'Home', servings })}
          />
        </Stack>
      ) : (
        <Stack gap="xl">
          <Field label="Invite code" hint="Your partner finds it in Settings → Invite partner.">
            <TextField
              code
              label="Invite code"
              placeholder="ABC123"
              value={code}
              onChangeText={(t) => setCode(t.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, CODE_LENGTH))}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={CODE_LENGTH}
              returnKeyType="join"
              onSubmitEditing={() => code.length === CODE_LENGTH && join.mutate(code)}
            />
          </Field>
          <Button
            label="Join household"
            size="lg"
            fullWidth
            disabled={code.length !== CODE_LENGTH}
            loading={join.isPending}
            onPress={() => join.mutate(code)}
          />
        </Stack>
      )}

      {error ? <Banner tone="danger" text={friendlyError(error)} /> : null}
      <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
    </Screen>
  );
}
