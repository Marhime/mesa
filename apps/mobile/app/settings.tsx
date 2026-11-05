import { useRouter } from 'expo-router';
import { useState } from 'react';

import {
  friendlyError,
  signOut,
  useCreateInvite,
  useHousehold,
  useMembers,
  useProfile,
  useShareText,
  useUpdateDisplayName,
  useUpdateHousehold,
} from '@/data';
import {
  Avatar,
  Button,
  ConfirmSheet,
  ErrorState,
  Field,
  InviteSheet,
  ListGroup,
  ListRow,
  ListSkeleton,
  Screen,
  SectionHeader,
  Stack,
  Stepper,
  TextField,
  TopBar,
} from '@/ds';

export default function SettingsScreen() {
  const router = useRouter();
  const household = useHousehold();
  const members = useMembers();
  const profile = useProfile();
  const updateHousehold = useUpdateHousehold();
  const updateName = useUpdateDisplayName();
  const invite = useCreateInvite();
  const share = useShareText();
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const openInvite = () => {
    setInviting(true);
    invite.mutate();
  };

  return (
    <Screen header={<TopBar title="Settings" onBack={back} />}>
      <Stack gap="lg">
        <SectionHeader title="Household" />
        {household.isLoading ? (
          <ListSkeleton rows={2} />
        ) : household.isError && !household.data ? (
          <ErrorState onRetry={() => void household.refetch()} />
        ) : (
          <>
            <Field label="Name">
              <TextField
                label="Household name"
                value={householdName ?? household.data?.name ?? ''}
                onChangeText={setHouseholdName}
                returnKeyType="done"
                onEndEditing={() => {
                  const next = householdName?.trim();
                  if (next && next !== household.data?.name) updateHousehold.mutate({ name: next });
                }}
              />
            </Field>
            <Field inline label="Default servings" hint="New plans start with this">
              <Stepper
                value={household.data?.default_servings ?? 3}
                onChange={(v) => updateHousehold.mutate({ default_servings: v })}
                min={1}
                max={20}
                label="Default servings"
              />
            </Field>
          </>
        )}
      </Stack>

      <Stack gap="lg">
        <SectionHeader title="Members" />
        {members.isLoading ? (
          <ListSkeleton rows={2} />
        ) : members.isError && !members.data ? (
          <ErrorState onRetry={() => void members.refetch()} />
        ) : (
          <ListGroup inset="leading">
            {(members.data ?? []).map((m) => (
              <ListRow key={m.id} leading={<Avatar name={m.name} />} title={m.name ?? 'No name yet'} subtitle={m.isMe ? 'You' : undefined} />
            ))}
          </ListGroup>
        )}
        <Button label="Invite partner" variant="secondary" iconStart="invite" onPress={openInvite} />
      </Stack>

      <Stack gap="lg">
        <SectionHeader title="You" />
        <Field label="Your name" hint="Your household sees this.">
          <TextField
            label="Your name"
            placeholder="Your first name"
            value={myName ?? profile.data?.display_name ?? ''}
            onChangeText={setMyName}
            autoCapitalize="words"
            textContentType="givenName"
            returnKeyType="done"
            onEndEditing={() => {
              if (myName !== null && myName.trim() !== (profile.data?.display_name ?? '')) updateName.mutate(myName);
            }}
          />
        </Field>
        <Button label="Sign out" variant="secondary" tone="danger" iconStart="signOut" onPress={() => setLeaving(true)} />
      </Stack>

      <InviteSheet
        visible={inviting}
        code={invite.data ?? null}
        loading={invite.isPending}
        error={invite.error ? friendlyError(invite.error, "Couldn't create a code. Try again.") : null}
        onRetry={() => invite.mutate()}
        onShare={() => invite.data && share(`Join our kitchen on Mesa. Open the app, choose Join with a code, and type ${invite.data}`)}
        onClose={() => setInviting(false)}
      />
      <ConfirmSheet
        visible={leaving}
        title="Sign out?"
        text="Your list and recipes stay with your household."
        confirmLabel="Sign out"
        tone="danger"
        onClose={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          void signOut();
        }}
      />
    </Screen>
  );
}
