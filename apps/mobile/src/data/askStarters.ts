// The questions Ask Mesa offers before the first one, from what is going on in this kitchen: the food to
// use first, what's on the menu (or that nothing is), the creators you follow. Pure.

/** What the starters are made of; every list is in the order it matters (most urgent first). */
export interface StarterKitchen {
  /** The recipe questions are about ("Tinga"); null: the whole kitchen. */
  about: string | null;
  /** Food to use soon. */
  useSoon: readonly string[];
  /** Dinners on the menu. */
  onMenu: readonly string[];
  /** How many recipes are saved. */
  recipes: number;
  /** Creators followed. */
  following: readonly string[];
}

const MAX_STARTERS = 3;
const ABOUT_RECIPE = ['Make it with what we have', 'Make it for 2', 'Can I make it ahead?'];
/** When the kitchen says nothing particular. */
const ANY_DAY = ['What can I make in 20 min?', 'Find me a new chicken dish', 'Add what we need for pasta night'];

const lower = (name: string) => name.trim().toLowerCase();

export function askStarters(k: StarterKitchen): string[] {
  if (k.about) return ABOUT_RECIPE;
  const soon = k.useSoon[0];
  const dinner = k.onMenu[0];
  const creator = k.following[0];
  const picks = [
    soon ? `What can I make with the ${lower(soon)}?` : null,
    dinner ? `Do we have everything for ${dinner}?` : k.recipes > 0 ? 'Plan our dinners this week' : null,
    creator ? `Something new from ${creator}` : k.recipes === 0 ? 'Find me an easy weeknight dinner' : null,
    ...ANY_DAY,
  ].filter((q): q is string => q !== null);
  return [...new Set(picks)].slice(0, MAX_STARTERS);
}
