import { useState } from 'react';

import { friendlyError, isCancelled, useAppleAvailable, useAppleSignIn, usePasswordAuth, type PasswordMode } from '@/data';
import { AppleButton, Banner, Button, Screen, Stack, Text, TextField } from '@/ds';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

export default function SignInScreen() {
  const [mode, setMode] = useState<PasswordMode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const auth = usePasswordAuth();
  const apple = useAppleSignIn();
  const appleAvailable = useAppleAvailable();

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length >= MIN_PASSWORD;
  const submit = () => {
    if (canSubmit) auth.mutate({ email, password, mode });
  };
  const switchMode = () => {
    setMode(mode === 'signIn' ? 'signUp' : 'signIn');
    auth.reset();
  };

  const rawError = auth.error ?? apple.error;
  const error = rawError && !isCancelled(rawError) ? friendlyError(rawError) : null;
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
        />
        <TextField
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
          variant="ghost"
          onPress={switchMode}
        />
      </Stack>

      {error ? <Banner tone="danger" text={error} /> : null}

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
