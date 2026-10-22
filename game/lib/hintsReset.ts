// S16: bring the one-shot hints back. Local only: removes the three hint keys and nothing else. No server, no React.
import { GUIDE_KEY } from "@/lib/guide";
import { TRY_KEY } from "@/lib/tryList";
import { HOME_HINT_KEY } from "@/lib/homeHint";
import { forgetShown } from "@/lib/welcome";

export const HINT_KEYS = [GUIDE_KEY, TRY_KEY, HOME_HINT_KEY] as const;
export const HINTS_AGAIN = "Show the hints again";
export const HINTS_BACK = "Hints will be back next time you open the game.";

export type ResetStore = { removeItem(key: string): void };

// Returns whether it stuck. Null or throwing storage returns false and never throws.
export function resetHints(store: ResetStore | null): boolean {
  try {
    if (!store) return false;
    for (const k of HINT_KEYS) store.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

// The browser's own storage, when it can be had. Blocked storage gives null.
export function resetBrowserHints(): boolean {
  try {
    const st = typeof window === "undefined" ? null : window.localStorage ?? null;
    forgetShown(st); // S17: the Welcome back card may show again on the next qualifying return
    return resetHints(st);
  } catch {
    return false;
  }
}
