import { useRef, useState } from 'react';

import { friendlyError, isCancelled, isConfirmEmailPending, useAppleAvailable, useAppleSignIn, usePasswordAuth, type PasswordMode } from '@/data';
import { AppleButton, Banner, Button, Screen, Stack, Text, TextField, type TextFieldRef } from '@/ds';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

export default function SignInScreen() {
  // Most people opening a fresh install are new: start with the account they need to create.
  const [mode, setMode] = useState<PasswordMode>('signUp');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Return on the email goes on to the password, keyboard up.
  const passwordField = useRef<TextFieldRef>(null);
  const auth = usePasswordAuth();
  const apple = useAppleSignIn();
  const appleAvailable = useAppleAvailable();

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= MIN_PASSWORD;
  const submit = () => {
    if (!canSubmit) return;
    auth.mutate(
      { email, password, mode },
      // The account exists; once the email link is tapped, signing in is the next step.
      { onError: (e) => isConfirmEmailPending(e) && setMode('signIn') },
    );
  };
  const switchMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    auth.reset();
  };

  const rawError = auth.error ?? apple.error;
  const error = rawError && !isCancelled(rawError) ? friendlyError(rawError) : null;
  const checkInbox = isConfirmEmailPending(rawError);
  const signingUp = mode === 'signUp';

  return (
    <Screen centered gap="xxl">
      <Stack gap="sm">
        <Text variant="overline" color="inkMuted">
          Mesa
        </Text>
        <Text variant="display">{signingUp ? 'Create your account' : 'Cook and shop together'}</Text>
        <Text variant="body" color="inkMuted">
          One shared grocery list and recipe box for your home.
        </Text>
      </Stack>

      <Stack gap="md">
        <TextField
          label="Email"
          placeholder="you@example.com"
          icon="email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType={signingUp ? 'username' : 'emailAddress'}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordField.current?.focus()}
        />
        <TextField
          ref={passwordField}
          label="Password"
          placeholder={signingUp ? `At least ${MIN_PASSWORD} characters` : 'Password'}
          icon="lock"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          textContentType={signingUp ? 'newPassword' : 'password'}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
        <Button
          label={signingUp ? 'Create account' : 'Sign in'}
          size="lg"
          fullWidth
          onPress={submit}
          loading={auth.isPending}
          disabled={!canSubmit}
        />
        <Button
          label={signingUp ? 'I already have an account' : 'New here? Create an account'}
          variant="secondary"
          size="lg"
          fullWidth
          onPress={switchMode}
        />
      </Stack>

      {error ? <Banner tone={checkInbox ? 'warning' : 'danger'} title={checkInbox ? 'Check your inbox' : undefined} text={error} /> : null}

      {appleAvailable ? (
        <Stack gap="md">
          <Text variant="caption" color="inkMuted" align="center">
            or
          </Text>
          <AppleButton onPress={() => apple.mutate()} />
        </Stack>
      ) : null}
    </Screen>
  );
}
