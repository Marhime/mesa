// The iOS share extension opens `mesa://dataUrl=mesaShareKey…`. That is not a route: keep the
// current screen (or Home on a cold start); the root layout then opens /import.
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  try {
    if (path.includes('dataUrl=')) return initial ? '/' : null;
    return path;
  } catch {
    return '/';
  }
}
