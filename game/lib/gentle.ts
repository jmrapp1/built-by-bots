// S20: "Time is gentle". One calm card, shown once per browser. Pure logic and wording; no React, no server, no network.
// Blocked or bad storage never throws: the card then shows once per session at most.
import { browserStore, type Store } from "@/lib/guide";

export const GENTLE_KEY = "blotty.gentle";
export const GENTLE_VERSION = 1;
export const GENTLE_AFTER_MS = 3 * 60_000;

// Every word the player sees from this.
export const GENTLE_TEXT = {
  title: "Take your time",
  body: "Your Print keeps growing while you are away. Nothing is ever lost, and it will be glad to see you.",
  close: "Close",
} as const;

export { browserStore };
export type { Store };

export function readGentle(store: Store | null): boolean {
  try {
    const raw = store?.getItem(GENTLE_KEY);
    if (!raw) return false;
    const v = JSON.parse(raw) as Record<string, unknown>;
    return !!v && v.v === GENTLE_VERSION && v.shown === true;
  } catch {
    return false;
  }
}

// Returns whether it stuck.
export function writeGentle(store: Store | null): boolean {
  try {
    if (!store) return false;
    store.setItem(GENTLE_KEY, JSON.stringify({ v: GENTLE_VERSION, shown: true }));
    return true;
  } catch {
    return false;
  }
}

export function clearGentle(store: (Store & { removeItem?(k: string): void }) | null): boolean {
  try {
    if (!store?.removeItem) return false;
    store.removeItem(GENTLE_KEY);
    return true;
  } catch {
    return false;
  }
}

export type GentleState = {
  hasPrint: boolean;
  inWorldMs: number;
  otherOpen: boolean; // Welcome back, Things to try, guide hint, picker, map, menu or talk is open
  saved: boolean; // blotty.gentle is already set
  doneThisSession: boolean;
  welcomeShown: boolean; // Welcome back showed this session
};

export function shouldShow(s: GentleState): boolean {
  return s.hasPrint && s.inWorldMs >= GENTLE_AFTER_MS && !s.otherOpen && !s.saved && !s.doneThisSession && !s.welcomeShown;
}

// ?gentle=on shows the card at once and saves nothing; ?gentle=reset forgets it (dev only, ignored in production builds).
export type GentlePreview = "on" | "reset";
export const gentleOverride = (search: string, isProduction: boolean): GentlePreview | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("gentle");
  return v === "on" || v === "reset" ? v : null;
};
