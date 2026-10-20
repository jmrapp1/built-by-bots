// Notice board text lookup. Content is fixed data (data/board.json): nothing here is player-written.
import board from "@/data/board.json";

export type BoardPage = { id: string; title: string; lines: string[] };
export const BOARD_TITLE: string = board.title;
export const BOARD_PAGES = board.pages as BoardPage[];

// Clamp any index to a real page, so next/previous never run off the ends.
export function pageAt(i: number): BoardPage {
  const n = BOARD_PAGES.length;
  return BOARD_PAGES[Math.min(n - 1, Math.max(0, Math.floor(Number.isFinite(i) ? i : 0)))];
}
export function nextPage(i: number): number { return Math.min(BOARD_PAGES.length - 1, Math.max(0, i) + 1); }
export function prevPage(i: number): number { return Math.max(0, Math.min(BOARD_PAGES.length - 1, i) - 1); }
export function pageLabel(i: number): string { return `${Math.min(BOARD_PAGES.length - 1, Math.max(0, i)) + 1} of ${BOARD_PAGES.length}`; }
