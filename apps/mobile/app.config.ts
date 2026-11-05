import type { ConfigContext, ExpoConfig } from 'expo/config';

// Splash and root background = the `surface` token (src/ds/tokens.ts). The config loader cannot
// import TypeScript modules, so the values are repeated here; scripts/check-ds.mjs fails if they drift.
const SURFACE_LIGHT = '#f3f1ea';
const SURFACE_DARK = '#111016';

// The app's identity on the App Store (MESA_IOS_BUNDLE_ID overrides it, e.g. for a second build).
const IOS_BUNDLE_ID = process.env.MESA_IOS_BUNDLE_ID ?? 'com.marhime.mesa';
// The EAS project (account "marhime", from `eas init`). Needed for push tokens and EAS Build.
const EAS_PROJECT_ID: string | undefined = process.env.EAS_PROJECT_ID ?? '1d77c301-c22c-4393-bd57-094a7f91b2b5';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Mesa',
  slug: 'mesa',
  scheme: 'mesa',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  platforms: ['ios', 'android'],
  userInterfaceStyle: 'automatic',
  backgroundColor: SURFACE_LIGHT,
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: false,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSPhotoLibraryUsageDescription: 'Mesa opens the screenshot you pick to read the recipe in it.',
    },
  },
  android: {
    package: IOS_BUNDLE_ID.replace(/-/g, '_'),
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/images/splash-icon.png',
        imageWidth: 96,
        backgroundColor: SURFACE_LIGHT,
        dark: { image: './assets/images/splash-icon.png', backgroundColor: SURFACE_DARK },
      },
    ],
    'expo-font',
    'expo-apple-authentication',
    [
      'expo-image-picker',
      {
        photosPermission: 'Mesa opens the screenshot you pick to read the recipe in it.',
        cameraPermission: 'Mesa looks at your fridge or a receipt to update your pantry.',
        // iOS asks for the microphone to film; the sound of a fridge video is never used.
        microphonePermission: 'Mesa films your fridge to see what is in it. The sound is not used.',
      },
    ],
    'expo-notifications',
    [
      'expo-share-intent',
      {
        iosActivationRules: {
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsWebPageWithMaxCount: 1,
          NSExtensionActivationSupportsImageWithMaxCount: 1,
          NSExtensionActivationSupportsText: true,
        },
        // Shown in the iOS share sheet. Must differ from the app name (it also names the Xcode target).
        iosShareExtensionName: 'Save to Mesa',
        androidIntentFilters: ['text/*', 'image/*'],
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    ...(EAS_PROJECT_ID ? { eas: { projectId: EAS_PROJECT_ID } } : {}),
  },
});
