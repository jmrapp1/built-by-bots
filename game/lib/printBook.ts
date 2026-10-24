// S35: the Print book, as pure rules. No React, no three.js, no clock, no network, no random. Which Prints are listed, how
// the highlight moves, which key opens it and when that key is ignored. Choosing a Print only changes which one is picked.
import book from "@/data/printBook.json";
import { cardStatus } from "@/lib/cardStatus";
import { moodFace } from "@/lib/ui";
import { activeIndex } from "@/lib/daily";
import { stageById, progressToNext } from "@/lib/growth";
import { speciesById } from "@/lib/species";
import { COSMETICS } from "@/lib/cosmetics";
import type { Face } from "@/lib/ui";

export const BOOK = book;

export type BookCreature = { id: string; species?: string; worn_cosmetic?: string | null; genes?: { hue: number }; mood: number; fullness?: number; stage?: string; care?: number; age_seconds?: number };
export type BookEntry = { id: string; index: number; species: string; stage: string; face: Face; worn: string | null; progress: number; hue: number; caption: string };

/** Every owned Print is an entry, in the order the page lists them. Unknown species, stage or keepsake fall back, never crash. */
export function bookEntries(creatures: readonly BookCreature[]): BookEntry[] {
  return creatures.map((c, index) => {
    const st = c.stage ?? "blot";
    return {
      id: c.id,
      index,
      species: speciesById(c.species).name,
      stage: stageById(st).name,
      face: moodFace(c.mood),
      worn: COSMETICS.find((k) => k.id === c.worn_cosmetic)?.name ?? null,
      hue: Math.round(((c.genes?.hue ?? 0) % 360 + 360) % 360),
      caption: cardStatus({ fullness: c.fullness ?? 100, mood: c.mood, stage: st }).caption,
      progress: Math.min(1, Math.max(0, progressToNext(st, c.care ?? 0, c.age_seconds ?? 0))),
    };
  });
}

/** Where the highlight starts when the book opens: the picked Print. */
export const startIndex = (count: number, picked: number | null): number => activeIndex(count, picked);

/** The highlight moves with the arrows over a grid with `cols` columns; it stops at the edges (no wrapping). */
export function moveHighlight(count: number, at: number, code: string, cols: number = book.columns): number {
  if (count <= 0) return 0;
  const cur = Math.min(count - 1, Math.max(0, at));
  const c = Math.max(1, cols);
  const to = code === "ArrowLeft" ? cur - 1 : code === "ArrowRight" ? cur + 1 : code === "ArrowUp" ? cur - c : code === "ArrowDown" ? cur + c : code === "Home" ? 0 : code === "End" ? count - 1 : cur;
  return Math.min(count - 1, Math.max(0, to));
}

/** Choosing an entry: the picked index becomes that entry (clamped), the same value Back/Next used to set. */
export const chooseIndex = (count: number, at: number): number => (count <= 0 ? 0 : Math.min(count - 1, Math.max(0, at)));

export type BookGate = { typing: boolean; travelling: boolean; mapOpen: boolean; menuOpen: boolean; panelOpen: boolean; signedIn: boolean };

/** The key opens the book only when nothing else owns the screen. Closing is always allowed (see bookKeyAction). */
export const canOpenBook = (g: BookGate): boolean => g.signedIn && !g.typing && !g.travelling && !g.mapOpen && !g.menuOpen && !g.panelOpen;

export type BookKey = { code: string; repeat: boolean; target: { tagName?: string } | null };
/** What a key press does: "toggle" (the book key), "close" (Esc while open), or nothing. */
export function bookKeyAction(k: BookKey, open: boolean, g: BookGate): "toggle" | "close" | null {
  if (k.target?.tagName === "INPUT" || k.target?.tagName === "TEXTAREA") return null;
  if (k.code === "Escape") return open ? "close" : null;
  if (k.code !== book.key || k.repeat) return null;
  if (open) return g.travelling ? null : "toggle";
  return canOpenBook(g) ? "toggle" : null;
}

/** Tab stays inside the book: from the last control forward goes to the first, from the first backward to the last. */
export function trapTab(count: number, at: number, shift: boolean): number {
  if (count <= 0) return 0;
  return shift ? (at <= 0 ? count - 1 : at - 1) : (at >= count - 1 ? 0 : at + 1);
}
