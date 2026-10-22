// "Things to try": a small optional card after the first-run guide. Pure logic and wording; no React, no server.
// Ticks live in local storage only (key blotty.tryList). Blocked or bad storage degrades to this session. Nothing is paid out.
import { browserStore, type Store } from "@/lib/guide";

export const ITEMS = ["forage", "share", "pond", "neighbour", "egg"] as const;
export type Item = (typeof ITEMS)[number];

export const TRY_KEY = "blotty.tryList";
export const TRY_VERSION = 1;

// Every word the player sees from the card. Wording changes here, not in logic.
export const TRY_TEXT = {
  tab: "Things to try",
  title: "A few things to try",
  forage: "Forage a snack",
  share: "Share it with your Print",
  pond: "Visit the pond",
  neighbour: "Meet a neighbour",
  egg: "Collect today's egg",
  eggLater: "Today's egg: come back tomorrow",
  closing: "The garden is yours now.",
  notNow: "Not now",
  close: "Close",
} as const;

export type TryState = { done: Item[]; retired: boolean };
export { browserStore };
export type { Store };

// Unreadable, unknown or other-version data is an empty, not-retired state.
export function readTry(store: Store | null): TryState {
  try {
    const raw = store?.getItem(TRY_KEY);
    if (!raw) return { done: [], retired: false };
    const v = JSON.parse(raw) as { v?: unknown; done?: unknown; retired?: unknown };
    if (!v || v.v !== TRY_VERSION || !Array.isArray(v.done)) return { done: [], retired: false };
    return { done: ITEMS.filter((s) => (v.done as unknown[]).includes(s)), retired: v.retired === true };
  } catch {
    return { done: [], retired: false };
  }
}

// Returns whether it stuck. A false means "this session only", which is fine.
export function writeTry(store: Store | null, s: TryState): boolean {
  try {
    if (!store) return false;
    store.setItem(TRY_KEY, JSON.stringify({ v: TRY_VERSION, done: ITEMS.filter((i) => s.done.includes(i)), retired: s.retired }));
    return true;
  } catch {
    return false;
  }
}

export const markDone = (done: readonly Item[], item: Item): Item[] => (done.includes(item) ? [...done] : [...done, item]);

export type Ctx = { dailyUp: boolean }; // is today's egg there to collect

export type Line = { item: Item; state: "open" | "done" | "later" }; // "later": shown ticked and greyed

// The lines to show, in order. Line 5 is "later" while no daily egg is up and it has not been collected.
export const lines = (done: readonly Item[], c: Ctx): Line[] =>
  ITEMS.map((item) => ({ item, state: done.includes(item) ? "done" : item === "egg" && !c.dailyUp ? "later" : "open" }));

// The first thing still to try, or null.
export const nextOpen = (done: readonly Item[], c: Ctx): Item | null => lines(done, c).find((l) => l.state === "open")?.item ?? null;

// Everything is ticked (or, for the egg, waiting for tomorrow).
export const allDone = (done: readonly Item[], c: Ctx): boolean => nextOpen(done, c) === null;

export const lineText = (l: Line): string => (l.item === "egg" && l.state === "later" ? TRY_TEXT.eggLater : TRY_TEXT[l.item]);

// The tab shows only when the player is in the garden with the guide finished and quiet, and the card has not been retired.
export const tabVisible = (o: { retired: boolean; guideDone: boolean; guideHint: boolean; inGarden: boolean; loaded: boolean; dailyKnown: boolean }): boolean =>
  !o.retired && o.guideDone && !o.guideHint && o.inGarden && o.loaded && o.dailyKnown;

// ?try=on shows the card on a fresh profile; ?try=reset clears the saved key (dev only, ignored in production builds).
export const tryOverride = (search: string, isProduction: boolean): "on" | "reset" | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("try");
  return v === "on" || v === "reset" ? v : null;
};
