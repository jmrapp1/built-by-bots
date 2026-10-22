// S21: chapter cards. Pure logic and wording; no React, no server, no storage, no network.
import data from "@/data/chapters.json";
import type { IconName } from "@/lib/npcs";

export type ChapterPlace = "garden" | "margins" | "home";
export const PLACES: ChapterPlace[] = ["garden", "margins", "home"];
export const CHAPTER_MS: number = data.showMs;
export const CHAPTERS = data.places as Record<ChapterPlace, { name: string; icon: IconName }>;

export const isPlace = (v: unknown): v is ChapterPlace => typeof v === "string" && (PLACES as string[]).includes(v);

// Once per place per session, kept in memory only. Skip when another card is open (never queued).
export function canShow(shown: ReadonlySet<ChapterPlace>, place: ChapterPlace, busy: boolean): boolean {
  return !busy && !shown.has(place);
}

// ?chapter=margins|home|garden shows that card once on load and remembers nothing (dev only, ignored in production builds).
export const chapterOverride = (search: string, isProduction: boolean): ChapterPlace | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("chapter");
  return isPlace(v) ? v : null;
};
