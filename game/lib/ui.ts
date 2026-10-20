// Small pure helpers for UI text, so they can be tested.
import type { Place } from "@/lib/world";
import { DAILY } from "@/lib/daily";

export type Face = "happy" | "content" | "sleepy";

// Mood is 0..100. Never a "sad" face: poor care only slows progress.
export function moodFace(mood: number): Face {
  if (mood >= 70) return "happy";
  if (mood >= 35) return "content";
  return "sleepy";
}

// 0..1 fill for an ink drop.
export function dropFill(value: number, max = 100): number {
  return Math.min(1, Math.max(0, value / max));
}

type PromptState = {
  hasEgg: boolean; // the starter egg has been collected
  hasCreature: boolean;
  hatchWait: number;
  hasWaiting?: boolean; // an egg is waiting to hatch (defaults to the old single-egg rule)
  dailyReady?: boolean; // today's egg can be collected
  dailyKnown?: boolean; // the server told us about today's claim
};

export function promptFor(place: Place, s: PromptState): string | null {
  const waiting = s.hasWaiting ?? (s.hasEgg && !s.hasCreature);
  switch (place.kind) {
    case "egg":
      if (!s.hasEgg) return "Take egg";
      if (waiting) return null;
      if (s.dailyReady) return DAILY.prompt;
      return s.dailyKnown ? "Come back tomorrow" : null;
    case "nest":
      if (!waiting) return null;
      return s.hatchWait > 0 ? `Hatching in ${s.hatchWait}s` : "Hatch";
    case "scenery": return null; // the inkwell is decoration only
    case "notice": return "Read the board";
    default: return place.label;
  }
}

// Short human sentences instead of raw auth errors.
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login") || m.includes("invalid credentials")) return "That email and password didn't match. Try again.";
  if (m.includes("already registered") || m.includes("already been registered")) return "That email already has an account. Try signing in.";
  if (m.includes("password") && (m.includes("least") || m.includes("short") || m.includes("weak"))) return "Pick a longer password, at least 8 characters.";
  if (m.includes("email") && m.includes("confirm")) return "Check your email and confirm your account first.";
  if (m.includes("rate") || m.includes("too many")) return "Too many tries. Wait a moment, then try again.";
  if (m.includes("fetch") || m.includes("network")) return "Can't reach the garden right now. Check your connection.";
  return "Something went wrong. Please try again.";
}

// Feed prompt: only for a hatched Print that is close by. Unhatched eggs never get one.
export function feedPrompt(hasCreature: boolean, printNear: boolean): string | null {
  return hasCreature && printNear ? "Hold to feed" : null;
}

export const FED_MESSAGE = "Nom! Your Print is fed.";

// Gentle wording for feed errors from the server. The raw message is never shown.
const FEED_ERRORS = {
  soon: "Easy there, your Print is still munching. Try again in a moment.",
  full: "Your Print is full for today. Come back tomorrow.",
  signin: "Please sign in again.",
  network: "Can't reach the garden right now. Check your connection.",
  other: "That didn't work. Please try again.",
} as const;
export function friendlyFeedError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("too soon")) return FEED_ERRORS.soon;
  if (m.includes("fed enough")) return FEED_ERRORS.full;
  if (m.includes("not signed in") || m.includes("sign in")) return FEED_ERRORS.signin;
  if (m.includes("fetch") || m.includes("network")) return FEED_ERRORS.network;
  return FEED_ERRORS.other;
}
// Feed confirmations and feed errors are short-lived toasts.
export const isFeedMessage = (m: string): boolean => m === FED_MESSAGE || (Object.values(FEED_ERRORS) as string[]).includes(m);
