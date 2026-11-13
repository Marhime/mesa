# Mesa — iPhone app (`@mesa/mobile`)

Expo SDK 58 · React Native 0.88 · Expo Router (typed routes) · TanStack Query (persisted cache) · Supabase.

The app has these screens:

- **Sign in:** email and password, or Apple.
- **Household setup:** create a kitchen or join one with a code.
- **Four tabs:**
  - Home: Tonight's idea, Use soon, Up next.
  - Recipes: For you this week, your creators.
  - Pantry: by food family; filming a shelf or scanning a receipt fills it.
  - Groceries: "Done shopping" puts the purchases away.
- **Recipes:** recipe detail and editor; Cooked! takes what was used out of the pantry.
- **Ask Mesa:** the one assistant. It opens from the small ✦ button above the tab bar, on every tab.
- **Elsewhere:** Settings, and "Save to Mesa" from the iOS share sheet.

It needs every migration in `supabase/migrations` applied. Deploying, over-the-air updates and builds are
in `docs/DEPLOY.md`; the TestFlight checklist is in `docs/RELEASE.md`.

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
| `EAS_PROJECT_ID` (optional) | shell or EAS environment | defaults to the Mesa EAS project (`app.config.ts`) |
| `MESA_IOS_BUNDLE_ID` (optional) | shell or EAS environment | defaults to `com.marhime.mesa`; only for a second build |

If the Supabase values are missing the app shows a "Mesa needs its keys" screen instead of crashing.
`.env` is git-ignored: EAS builds read the same values from the EAS environment (production, preview and
development are set).

`eas.json` has three profiles: `development` (dev client, internal), `preview` (internal ad-hoc build)
and `production` (App Store / TestFlight, build number auto-increments). Builds and over-the-air updates
are in `docs/DEPLOY.md`.

## Code map

```
app/                 Expo Router screens (thin: compose src/ds, read src/data)
  _layout.tsx        providers + auth/household gate (Stack.Protected)
  sign-in.tsx        email + password, Sign in with Apple
  setup.tsx          create or join a household
  (tabs)/            Home, Recipes, Pantry, Groceries + floating TabBar with the Mesa button (✦)
  ask.tsx            Ask Mesa, the one assistant (opens from the Mesa button)
  recipe/[id].tsx    recipe detail, Plan it
  cooked/[id].tsx    Cooked!: what was used comes out of the pantry
  editor.tsx         write or edit a recipe (?id=)
  settings.tsx       household, members, invite, sign out
  import.tsx         "Import recipe" for things shared into the app
  +native-intent.tsx keeps the share-extension deep link from hitting an unknown route
src/ds/              design system: tokens, atoms, molecules, organisms (docs/DESIGN_SYSTEM.md)
src/data/            Supabase client, TanStack Query hooks, one file per domain
src/lib/             pure helpers (input parsing, quantities, dates, text)
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
- Live sync (Supabase Realtime) brings the other phone's changes within a second. On top of it, the
  grocery list reads again when it comes on screen and every 10 s while it stays there. Imports show their
  progress live and fall back to a 3 s poll while live sync is down.
- "Delete" on a grocery row sets `status = 'removed'` (so Undo can restore it); "Already have" calls
  `mark_have`.
