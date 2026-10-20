// Daily egg helpers. The SERVER decides everything (UTC day, one waiting egg, species).
// These only decide what to show. Text and odds live in data/daily.json.
import daily from "@/data/daily.json";

export const DAILY = daily;

// The UTC calendar day as YYYY-MM-DD. Used only to decide whether to SHOW the egg.
export function utcDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Show a daily egg when the player has not collected one today and has nothing waiting in the nest.
export function dailyAvailable(claimedOn: string | null, today: string, hasWaitingEgg: boolean): boolean {
  if (hasWaitingEgg) return false;
  return !claimedOn || claimedOn < today;
}

export function dailyPrompt(available: boolean): string | null {
  return available ? daily.prompt : null;
}

// Gentle wording for the server's answer. Raw messages are never shown.
export function friendlyDailyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already claimed")) return daily.messages.already;
  if (m.includes("hatch your egg")) return daily.messages.busy;
  if (m.includes("sign in")) return "Please sign in again.";
  if (m.includes("fetch") || m.includes("network")) return "Can't reach the garden right now. Check your connection.";
  return daily.messages.error;
}

// Which Print to show when a player has several: newest first, never out of range.
export function activeIndex(count: number, picked: number | null): number {
  if (count <= 0) return 0;
  if (picked === null) return count - 1;
  return Math.min(count - 1, Math.max(0, picked));
}
