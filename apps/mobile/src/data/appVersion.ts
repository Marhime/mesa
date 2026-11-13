// Which Mesa is running: the version, and whether it is the one built in or an update received over the air.
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

const when = (d: Date): string =>
  new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(d);

/** "Mesa 1.0.0 · built in", "Mesa 1.0.0 · updated Nov 6, 2:50 PM", "Mesa 1.0.0 · development". */
export function appVersionLine(): string {
  const version = `Mesa ${Constants.expoConfig?.version ?? ''}`.trim();
  if (!Updates.isEnabled) return `${version} · development`;
  if (Updates.isEmbeddedLaunch || !Updates.createdAt) return `${version} · built in`;
  return `${version} · updated ${when(Updates.createdAt)}`;
}
