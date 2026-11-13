// Invite codes: making one to share (one per kitchen: a new one replaces the last), typing or pasting one,
// and joining the kitchen it opens. A code is 10 characters from 32 (no 0/O/1/I), shown and shared as two
// groups of five ("ABCDE-FGHJK"); the database ignores spaces, dashes and case (migration 28).
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AS_RAISED, UserFacingError, withMessages } from './errors';
import { rpc } from './rpc';

const CODE_LENGTH = 10;
const GROUP = 5;
const CODE_IN_TEXT = /\b[A-HJ-NP-Z2-9]{5}[-\s]?[A-HJ-NP-Z2-9]{5}\b/g;
const DIDNT_WORK = "That code didn't work. Check it, or ask for a new one.";

/** "abcdefghjk" → "ABCDE-FGHJK" (and "ABCDE-F" while it is typed). */
export function formatInviteCode(code: string): string {
  return code.length > GROUP ? `${code.slice(0, GROUP)}-${code.slice(GROUP)}` : code;
}

/**
 * The invite code in whatever was typed or pasted: "abcde fghjk" → "ABCDEFGHJK", and a whole pasted message
 * ("Join our kitchen on Mesa… enter: K7M2Q-X9P4T") → "K7M2QX9P4T". Never more than 10 characters.
 */
export function inviteCodeFrom(text: string): string {
  const compact = text.replace(/[^a-z0-9]/gi, '').toUpperCase();
  if (compact.length <= CODE_LENGTH) return compact;
  const found = text.match(CODE_IN_TEXT);
  return found ? found[found.length - 1]!.replace(/[^A-Z0-9]/g, '') : compact.slice(0, CODE_LENGTH);
}

/**
 * The invite code field (Setup, Join another kitchen): it shows the code in two groups of five, keeps only
 * the code of what is typed or pasted, and is ready at 10 characters.
 */
export function useInviteCodeInput() {
  const [code, setCode] = useState('');
  return {
    /** What the field shows ("ABCDE-FGHJK"). */
    value: formatInviteCode(code),
    onChangeText: (text: string) => setCode(inviteCodeFrom(text)),
    /** The whole code is there. */
    ready: code.length === CODE_LENGTH,
    /** What to join with. */
    code,
    clear: () => setCode(''),
  };
}

/** What the inviter sends: it works for someone who doesn't have the app yet. */
export function inviteMessage(code: string): string {
  return `Join our kitchen on Mesa. Install it from the TestFlight invite, create your account, choose "Join with a code" and enter: ${code}. The code works once, for 7 days.`;
}

/** A new code for this kitchen, ready to show and share ("ABCDE-FGHJK"); the one made before stops working. */
export function useCreateInvite() {
  return useMutation({ mutationFn: async () => formatInviteCode(await rpc('create_invite', {})) });
}

/**
 * Joins a household with a code; also moves someone who already has one (Settings → Join another kitchen).
 * A code that opens no kitchen (wrong, used, expired: join_household gives null) fails with a sentence, and
 * so does the 11th wrong code in an hour (the database's own words).
 */
export function useJoinHousehold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      // P0002: a database from before migration 28 said "no such code" this way.
      const household = await withMessages(rpc('join_household', { p_code: code }), { P0001: AS_RAISED, P0002: DIDNT_WORK });
      if (!household) throw new UserFacingError(DIDNT_WORK);
      return household;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['profile'] });
      // Lists, recipes and pantry cached so far belong to the previous kitchen.
      await qc.resetQueries({ predicate: (q) => q.queryKey[0] !== 'profile' && q.queryKey[0] !== 'auth-settings' });
    },
    onError: () => qc.invalidateQueries({ queryKey: ['profile'] }),
  });
}
