// S13: two quiet, one-time lines that point a first-timer at Home. Pure logic and wording. No three.js, no React, no server.
// Which lines were shown lives in local storage only. Blocked or bad storage degrades to this session.
import { browserStore, type Store } from "@/lib/guide";

export const HOME_HINT_KEY = "blotty.homeHint";
export const HOME_HINT_VERSION = 1;

export type HomeHint = "door" | "inside";
export const HOME_HINTS: readonly HomeHint[] = ["door", "inside"];

// Every word the player sees from this. Wording changes here, not in logic.
export const HOME_HINT_TEXT = {
  door: "Your Home is inside. Come and arrange it.",
  inside: "Pick a spot to decorate. Nothing is ever lost.",
} as const;

export { browserStore };

// Reads the lines already shown. Anything unreadable, unknown or from another version is an empty list.
export function readShown(store: Store | null): HomeHint[] {
  try {
    const raw = store?.getItem(HOME_HINT_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw) as { v?: unknown; shown?: unknown };
    if (!v || v.v !== HOME_HINT_VERSION || !Array.isArray(v.shown)) return [];
    return HOME_HINTS.filter((h) => (v.shown as unknown[]).includes(h));
  } catch {
    return [];
  }
}

// Returns whether it stuck. A false means "this session only", which is fine.
export function writeShown(store: Store | null, shown: readonly HomeHint[]): boolean {
  try {
    if (!store) return false;
    store.setItem(HOME_HINT_KEY, JSON.stringify({ v: HOME_HINT_VERSION, shown: HOME_HINTS.filter((h) => shown.includes(h)) }));
    return true;
  } catch {
    return false;
  }
}

export const markShown = (shown: readonly HomeHint[], h: HomeHint): HomeHint[] => (shown.includes(h) ? [...shown] : [...shown, h]);

export type Ctx = {
  ready: boolean; // signed in, progress read, nothing covering the world
  guideDone: boolean; // the first-run guide is finished or skipped
  guideHint: boolean; // a guide hint is on screen (the guide wins)
  hasCreature: boolean; // the player has a Print
  nearDoor: boolean; // at the garden's Home door (its prompt is showing)
  nearPlot: boolean; // at a Home decoration plot (the Decorate prompt)
  decorated: boolean; // a Decorate succeeded in this visit
};

// The one line to show now, or null. `shown` = lines already used up; `active` = the line on screen right now,
// which stays up while its place is still true even though it is already counted as shown.
export function nextHint(shown: readonly HomeHint[], c: Ctx, active: HomeHint | null = null, dismissed: readonly HomeHint[] = []): HomeHint | null {
  if (!c.ready || !c.guideDone || c.guideHint || !c.hasCreature) return null;
  const open = (h: HomeHint) => !dismissed.includes(h) && (!shown.includes(h) || active === h);
  if (c.nearDoor && open("door")) return "door";
  if (c.nearPlot && !c.decorated && open("inside")) return "inside";
  return null;
}

// Dev preview (?homehint=door|inside|reset): compiled out of production.
export type HomeHintPreview = "door" | "inside" | "reset";
export const homeHintOverride = (search: string, isProduction: boolean): HomeHintPreview | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("homehint");
  return v === "door" || v === "inside" || v === "reset" ? v : null;
};
