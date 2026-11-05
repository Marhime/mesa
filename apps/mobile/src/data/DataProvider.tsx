import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import type { ReactNode } from 'react';

import { AuthProvider, useSession } from './auth';
import { isConfigured } from './env';
import { registerGroceryMutations } from './groceryMutations';
import { useProfile } from './household';
import { GROCERIES_KEY } from './keys';
import { persister, queryClient, WEEK } from './queryClient';
import { ShareProvider } from './share';

const CACHE_VERSION = '2';

// Before the cache is restored: grocery changes made offline and saved to disk need their server call.
registerGroceryMutations(queryClient);

/** Share intents, the persisted query cache and the auth session. Put it at the very top. */
export function DataProvider({ children }: { children: ReactNode }) {
  return (
    <ShareProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: WEEK,
          buster: CACHE_VERSION,
          // Grocery changes waiting for a connection are saved too, so a check made in a store without
          // signal survives iOS closing the app; they resume, in order, once the cache is back.
          dehydrateOptions: {
            shouldDehydrateQuery: (q) => q.state.status === 'success',
            shouldDehydrateMutation: (m) => m.state.isPaused && m.options.mutationKey?.[0] === GROCERIES_KEY[0],
          },
        }}
        onSuccess={() => void queryClient.resumePausedMutations()}
      >
        <AuthProvider>{children}</AuthProvider>
      </PersistQueryClientProvider>
    </ShareProvider>
  );
}

export type GateStatus = 'unconfigured' | 'loading' | 'signedOut' | 'needsHousehold' | 'ready' | 'error';

/** Where the app should be: setup screen, sign in, household setup, or the app itself. */
export function useGate(): { status: GateStatus; retry: () => void } {
  const { session, ready } = useSession();
  const profile = useProfile();
  const retry = () => void profile.refetch();
  if (!isConfigured) return { status: 'unconfigured', retry };
  if (!ready) return { status: 'loading', retry };
  if (!session) return { status: 'signedOut', retry };
  if (profile.data) return { status: profile.data.household_id ? 'ready' : 'needsHousehold', retry };
  // Failed, or waiting for a connection with nothing cached yet: show a way out instead of the splash.
  if (profile.isError || profile.fetchStatus === 'paused') return { status: 'error', retry };
  return { status: 'loading', retry };
}
