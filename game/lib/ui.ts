// Small pure helpers for UI text, so they can be tested.
import type { Place } from "@/lib/world";

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

export function promptFor(place: Place, s: { hasEgg: boolean; hasCreature: boolean; hatchWait: number }): string | null {
  switch (place.kind) {
    case "egg": return s.hasEgg ? null : "Take egg";
    case "nest":
      if (!s.hasEgg || s.hasCreature) return null;
      return s.hatchWait > 0 ? `Hatching in ${s.hatchWait}s` : "Hatch";
    case "feeding": return s.hasCreature ? "Feed" : null;
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
