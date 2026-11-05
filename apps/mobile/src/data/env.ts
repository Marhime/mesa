// Public runtime configuration. Expo inlines EXPO_PUBLIC_* variables at build time.

const rawUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const rawKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const env = {
  supabaseUrl: rawUrl.trim().replace(/\/+$/, ''),
  supabaseAnonKey: rawKey.trim(),
};

/** False when the Supabase keys are missing: the app shows a setup screen instead of crashing. */
export const isConfigured = /^https?:\/\/\S+$/.test(env.supabaseUrl) && env.supabaseAnonKey.length > 0;
