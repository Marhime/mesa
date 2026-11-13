import { useRouter } from 'expo-router';
import { useState } from 'react';

import {
  appVersionLine,
  friendlyError,
  inviteMessage,
  signOut,
  useCreateInvite,
  useHousehold,
  useInviteCodeInput,
  useJoinHousehold,
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
  JoinKitchenSheet,
  ListGroup,
  ListRow,
  ListSkeleton,
  Screen,
  SectionHeader,
  Stack,
  Stepper,
  Text,
  TextField,
  TopBar,
  useToast,
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
  const join = useJoinHousehold();
  const toast = useToast();
  const [joining, setJoining] = useState(false);
  const joinCode = useInviteCodeInput();
  const [householdName, setHouseholdName] = useState<string | null>(null);
  const [myName, setMyName] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const openInvite = () => {
    setInviting(true);
    invite.mutate();
  };
  const openJoin = () => {
    join.reset();
    joinCode.clear();
    setJoining(true);
  };
  const joinKitchen = () =>
    join.mutate(joinCode.code, {
      onSuccess: () => {
        setJoining(false);
        router.replace('/');
        toast.show({ message: "You're in. Everything here is now shared with them." });
      },
    });

  return (
    <Screen header={<TopBar title="Settings" onBack={back} />}>
      <Stack gap="lg">
        <SectionHeader title="Household" />
        {household.isLoading ? (
          <ListSkeleton rows={2} />
        ) : household.isError && !household.data ? (
          <ErrorState size="section" onRetry={() => void household.refetch()} />
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
          <ErrorState size="section" onRetry={() => void members.refetch()} />
        ) : (
          <ListGroup inset="avatar">
            {(members.data ?? []).map((m) => (
              <ListRow key={m.id} leading={<Avatar name={m.name} />} title={m.name ?? 'No name yet'} subtitle={m.isMe ? 'You' : undefined} />
            ))}
          </ListGroup>
        )}
        <Button label="Invite partner" variant="secondary" iconStart="invite" fullWidth onPress={openInvite} />
        <Button label="Join another kitchen" variant="ghost" fullWidth onPress={openJoin} />
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
        <Button label="Sign out" variant="secondary" tone="danger" iconStart="signOut" fullWidth onPress={() => setLeaving(true)} />
      </Stack>

      <Text variant="caption" color="inkMuted" align="center">
        {appVersionLine()}
      </Text>

      <InviteSheet
        visible={inviting}
        code={invite.data ?? null}
        loading={invite.isPending}
        error={invite.error ? friendlyError(invite.error, "Couldn't create a code. Try again.") : null}
        onRetry={() => invite.mutate()}
        onShare={() => invite.data && share(inviteMessage(invite.data))}
        onClose={() => setInviting(false)}
      />
      <JoinKitchenSheet
        visible={joining}
        onClose={() => setJoining(false)}
        currentName={household.data?.name ?? 'this kitchen'}
        code={joinCode.value}
        onChangeCode={joinCode.onChangeText}
        ready={joinCode.ready}
        onJoin={joinKitchen}
        joining={join.isPending}
        error={join.error ? friendlyError(join.error) : null}
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
