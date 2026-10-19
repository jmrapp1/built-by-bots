// Pure rules. The database functions in supabase/migrations are the authority;
// these mirror them for display and tests. Values come from data/*.json.
import foods from "@/data/foods.json";
import rules from "@/data/rules.json";

export type Food = { id: string; name: string; fullness: number; mood: number };
export type Stats = { fullness: number; mood: number };

export const FOODS: Food[] = foods;
export const RULES = rules;

export function secondsUntilHatch(hatchAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((hatchAt.getTime() - now.getTime()) / 1000));
}

export function canHatch(hatchAt: Date, now: Date): boolean {
  return now.getTime() >= hatchAt.getTime();
}

export function canFeed(lastFedAt: Date | null, now: Date, feedsToday: number): "ok" | "too soon" | "fed enough for today" {
  if (lastFedAt && now.getTime() < lastFedAt.getTime() + RULES.feedCooldownSeconds * 1000) return "too soon";
  if (feedsToday >= RULES.feedsPerDay) return "fed enough for today";
  return "ok";
}

// Feeding never lowers a stat.
export function applyFeed(s: Stats, food: Food): Stats {
  return {
    fullness: Math.min(RULES.maxStat, s.fullness + food.fullness),
    mood: Math.min(RULES.maxStat, s.mood + food.mood),
  };
}
