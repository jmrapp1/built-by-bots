// S17: "Welcome back". Pure logic and wording; no React, no server, no network.
// One local key (blotty.lastSeen) holds when the player was last here, the last stage seen, and when a card was last shown.
// Blocked or bad storage means no card, never an error. Nothing is paid out and nothing is lost.
import { browserStore, type Store } from "@/lib/guide";

export const WELCOME_KEY = "blotty.lastSeen";
export const WELCOME_VERSION = 1;
export const HOUR_MS = 3_600_000;
export const MIN_AWAY_H = 2;
export const REPEAT_H = 6;
export const WRITE_EVERY_MS = 60_000;

// Every word the player sees from this. {name} is "Your Print" (Prints have no names).
export const WELCOME_TEXT = {
  name: "Your Print",
  title: "Welcome back",
  short: (n: string) => `${n} missed you.`,
  days: (n: string) => `${n} waited by the gate.`,
  long: (n: string) => `${n} kept your page warm.`,
  grew: (n: string) => `${n} grew a little.`,
  hungry: (n: string) => `${n} is ready for a snack.`,
  close: "Close",
} as const;

export type Seen = { t: number; creatureId?: string; stage?: string; shownAt?: number };
export type Tone = "short" | "days" | "long";

export { browserStore };
export type { Store };

export function readSeen(store: Store | null): Seen | null {
  try {
    const raw = store?.getItem(WELCOME_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (!v || v.v !== WELCOME_VERSION || typeof v.t !== "number" || !Number.isFinite(v.t)) return null;
    const s: Seen = { t: v.t };
    if (typeof v.creatureId === "string") s.creatureId = v.creatureId;
    if (typeof v.stage === "string") s.stage = v.stage;
    if (typeof v.shownAt === "number" && Number.isFinite(v.shownAt)) s.shownAt = v.shownAt;
    return s;
  } catch {
    return null;
  }
}

// Returns whether it stuck.
export function writeSeen(store: Store | null, s: Seen): boolean {
  try {
    if (!store) return false;
    store.setItem(WELCOME_KEY, JSON.stringify({ v: WELCOME_VERSION, ...s }));
    return true;
  } catch {
    return false;
  }
}

// 2-24 h, 1-3 d, over 3 d. Under 2 h: no card.
export function toneFor(awayMs: number): Tone | null {
  const h = awayMs / HOUR_MS;
  if (!Number.isFinite(h) || h < MIN_AWAY_H) return null;
  if (h < 24) return "short";
  if (h <= 72) return "days";
  return "long";
}

export type Welcome = { lines: string[] };

// Decides once per visit. prev is what was stored before this visit.
export function welcomeFor(prev: Seen | null, now: number, c: { id: string; stage: string; hungry: boolean } | null): Welcome | null {
  if (!prev || !c) return null;
  const away = now - prev.t;
  if (away < 0) return null; // clock went backwards
  const tone = toneFor(away);
  if (!tone) return null;
  if (prev.shownAt !== undefined && now - prev.shownAt < REPEAT_H * HOUR_MS) return null;
  const n = WELCOME_TEXT.name;
  const lines: string[] = [WELCOME_TEXT[tone](n)];
  if (prev.creatureId === c.id && prev.stage && prev.stage !== c.stage) lines.push(WELCOME_TEXT.grew(n));
  else if (c.hungry) lines.push(WELCOME_TEXT.hungry(n));
  return { lines };
}

// ?welcome=2h|2d|5d fakes the time away, reset forgets when a card was last shown (dev only, ignored in production builds).
export type WelcomePreview = "2h" | "2d" | "5d" | "reset";
export const welcomeOverride = (search: string, isProduction: boolean): WelcomePreview | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("welcome");
  return v === "2h" || v === "2d" || v === "5d" || v === "reset" ? v : null;
};
export const PREVIEW_AWAY_H: Record<Exclude<WelcomePreview, "reset">, number> = { "2h": 3, "2d": 48, "5d": 120 };

// The Menu hints reset: forget when a card was last shown, keep the rest. Returns whether it stuck.
export function forgetShown(store: Store | null): boolean {
  try {
    const s = readSeen(store);
    if (!s) return !!store;
    const { shownAt: _drop, ...rest } = s; // eslint-disable-line @typescript-eslint/no-unused-vars
    return writeSeen(store, rest);
  } catch {
    return false;
  }
}
