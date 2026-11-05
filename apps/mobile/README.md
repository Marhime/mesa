# Mesa — iPhone app (`@mesa/mobile`)

Expo SDK 58 · React Native 0.88 · Expo Router (typed routes) · TanStack Query (persisted cache) · Supabase.

The MVP: sign in, household setup, Home (Tonight's idea, Use soon, Up next), Recipes, recipe detail and
editor, Pantry, Groceries with "Put away" when shopping is done, Cooked! (takes what was used out of the
pantry), Settings, and "Save to Mesa" from the iOS share sheet.

Needs the migrations up to `20261105000010_scans.sql` (`npx supabase db push`). TestFlight: `docs/RELEASE.md`.

## Run it

```bash
# from the repository root
pnpm install
cp apps/mobile/.env.example apps/mobile/.env   # then fill in the two Supabase values
cd apps/mobile
npx expo start
```

Scan the QR code with the iPhone camera to open it in **Expo Go**. Expo Go covers almost everything:
email sign-in, household setup, groceries, recipes, imports from a link or a screenshot, settings.

Three things need a **development build** (a real build of Mesa, with its own bundle id and native code):

| Feature | Why Expo Go can't do it |
| --- | --- |
| Share to Mesa (Instagram, TikTok, YouTube, Safari, Photos) | needs the iOS share extension (`expo-share-intent`) |
| Sign in with Apple | Apple issues the token for Expo Go's bundle id, which Supabase rejects |
| Push notifications (failed imports) | needs an EAS project id and APNs credentials |

Without them the app degrades quietly: the Apple button is hidden when unavailable, push
registration is skipped, and the share module is inert.

### Development build

- **On a Mac:** `npx expo run:ios --device` (Xcode 26 or newer, iPhone plugged in).
- **Without a Mac:** `npx eas-cli@latest build --profile development --platform ios`, then open the
  install link on the iPhone (register it first with `npx eas-cli@latest device:create`).

Then run `npx expo start --dev-client` and open Mesa on the phone.

## Environment

| Variable | Where | |
| --- | --- | --- |
| `EXPO_PUBLIC_SUPABASE_URL` | `.env` locally, EAS environment for builds | Supabase → Project Settings → API |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | same | the **anon** public key (RLS protects the data) |
| `EAS_PROJECT_ID` (optional) | shell or EAS environment | from `eas init`; enables push tokens |
| `MESA_IOS_BUNDLE_ID` (optional) | shell or EAS environment | defaults to the placeholder `com.mesa.app` |

If the Supabase values are missing the app shows a "Mesa needs its keys" screen instead of crashing.
`.env` is git-ignored, so EAS cloud builds need the values as EAS environment variables:

```bash
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://xxxx.supabase.co --environment production --environment preview --environment development --visibility plaintext
npx eas-cli@latest env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ... --environment production --environment preview --environment development --visibility plaintext
```

## Supabase settings the app relies on

1. Apply `supabase/migrations/*.sql` (schema, RLS, functions, `recipe-images` bucket, catalog).
2. **Email + password, no emails sent.** Auth → Sign In / Providers → Email: keep Email enabled and
   turn **off** "Confirm email". Sign-up then returns a session immediately, so no SMTP is needed.
   (Password reset by email is not in the MVP; reset a password from the Supabase dashboard if needed.)
3. **Sign in with Apple.** Auth → Providers → Apple → enable, and add the iOS bundle id
   (`com.mesa.app` or yours) under *Client IDs*. Native sign-in needs no secret key.

## Install on Karla's iPhone (TestFlight)

You need the Apple Developer Program membership (99 USD a year) and an Expo account.

1. Pick the real bundle id (e.g. `com.marhime.mesa`) and set it in `app.config.ts`
   (`IOS_BUNDLE_ID`) or as `MESA_IOS_BUNDLE_ID`. `com.mesa.app` is only a placeholder.
2. `cd apps/mobile && npx eas-cli@latest login && npx eas-cli@latest init` — copy the project id it
   prints into `EAS_PROJECT_ID` (app.config.ts is dynamic, so EAS cannot write it for you).
3. Add the Supabase values as EAS environment variables (above).
4. `npx eas-cli@latest build --profile production --platform ios` — sign in with the Apple
   account when asked; EAS creates the certificates, provisioning profiles, the App Group
   (`group.<bundle id>`) and the share extension id (`<bundle id>.share-extension`), plus the push key.
5. `npx eas-cli@latest submit --platform ios --latest` — uploads to App Store Connect.
6. In App Store Connect → TestFlight: add Karla as an internal tester (invite her to your team under
   Users and Access first) — she installs **TestFlight** from the App Store and accepts the invite.

`eas.json` has three profiles: `development` (dev client, internal), `preview` (internal ad-hoc build)
and `production` (App Store / TestFlight, build number auto-increments).

## Code map

```
app/                 Expo Router screens (thin: compose src/ds, read src/data)
  _layout.tsx        providers + auth/household gate (Stack.Protected)
  sign-in.tsx        email code + Sign in with Apple
  setup.tsx          create or join a household
  (tabs)/            Home, Recipes, Groceries + floating TabBar
  recipe/[id].tsx    recipe detail, Plan it
  editor.tsx         write or edit a recipe (?id=)
  settings.tsx       household, members, invite, sign out
  import.tsx         "Import recipe" for things shared into the app
  +native-intent.tsx keeps the share-extension deep link from hitting an unknown route
src/ds/              design system: tokens, atoms, molecules, organisms (docs/DESIGN_SYSTEM.md)
src/data/            Supabase client, TanStack Query hooks, one file per domain
src/lib/             pure helpers (input parsing, text)
scripts/check-ds.mjs fails if a screen uses raw styles, literal colors or numbers
```

Rules enforced by `node scripts/check-ds.mjs`: screens import only `react`, `expo-router`, `@/ds`
and `@/data`; no `style=`, `StyleSheet`, hex/rgb colors or numeric style values in `app/`; colors
only in `src/ds/tokens.ts`; the splash colors in `app.config.ts` equal the `surface` tokens.

## Checks

```bash
pnpm install                                   # repository root
cd apps/mobile
npx tsc --noEmit
node scripts/check-ds.mjs
EXPO_PUBLIC_SUPABASE_URL=https://example.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=dummy \
  npx expo export --platform ios --output-dir /tmp/mesa-export
npx expo-doctor
```

## Behaviour notes

- The grocery list, recipes and Up next are cached on the device (AsyncStorage) and show instantly,
  even offline. Changes are optimistic; offline changes wait and are sent when the connection comes
  back (while the app stays open — they are not kept across a restart).
- Groceries refetch when the tab gains focus and every 10 s while it is open; imports poll every 3 s
  while one is queued or processing.
- "Delete" on a grocery row sets `status = 'removed'` (so Undo can restore it); "Already have" calls
  `mark_have`.
