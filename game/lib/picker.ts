// The keepsake picker (slice 6e-2). Pure rules: which keepsakes are listed, what a choice sends, what a failure shows and
// what the Print keeps. No React, no clock, no network here except the one injected call in runPick.
// The server (set_worn_cosmetic) decides everything; the client sends the Print id and the keepsake id, or null for none.
import { COSMETICS, isCosmetic } from "@/lib/cosmetics";

export type Choice = { id: string | null; label: string; current: boolean };
export const WEAR_NOTHING = "Wear nothing";
export const PICKER_TITLE = "Keepsakes";
export const PICKER_EMPTY = "No keepsakes yet. Keep exploring the Margins.";
export const PICKER_QUIET = "That didn't change just now.";
export const PICKER_ERRORS = {
  network: "Can't reach the garden right now. Your Print stays as it is.",
  other: PICKER_QUIET,
} as const;
export type PickFail = keyof typeof PICKER_ERRORS;
export type PickOutcome = { ok: true; worn: string | null } | { ok: false; reason: PickFail };

// Owned ids from the server's rows ({ cosmetic }), in the data file's order. Unknown or repeated ids are dropped; anything not an array is none.
export function ownedFromRows(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const have = new Set<string>();
  for (const r of rows) { const id = (r as { cosmetic?: unknown } | null)?.cosmetic; if (isCosmetic(id)) have.add(id); }
  return COSMETICS.map((c) => c.id).filter((id) => have.has(id));
}

// What the picker lists: "Wear nothing" first, then each owned keepsake. `worn` marks the current one.
export function choicesFor(owned: string[], worn: string | null | undefined): Choice[] {
  const current = isCosmetic(worn) ? worn : null;
  const list: Choice[] = [{ id: null, label: WEAR_NOTHING, current: current === null }];
  for (const c of COSMETICS) if (owned.includes(c.id)) list.push({ id: c.id, label: c.name, current: c.id === current });
  return list;
}

// A choice is only sent when it is something listed and not what is already worn.
export function canPick(owned: string[], worn: string | null | undefined, choice: string | null): boolean {
  const current = isCosmetic(worn) ? worn : null;
  if (choice === current) return false;
  return choice === null || (isCosmetic(choice) && owned.includes(choice));
}

// The one call to the server. `call` is injected so this is testable; the page passes the rpc for set_worn_cosmetic.
// The stored value must come back as what was asked for, otherwise it counts as a failure and nothing changes.
export async function runPick(
  call: (args: { p_creature: string; p_cosmetic: string | null }) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
  creatureId: string, choice: string | null,
): Promise<PickOutcome> {
  try {
    const { data, error } = await call({ p_creature: creatureId, p_cosmetic: choice });
    if (error) return { ok: false, reason: "other" };
    const row = Array.isArray(data) ? data[0] : data;
    const stored = (row as { worn_cosmetic?: unknown } | null | undefined)?.worn_cosmetic;
    if (stored === undefined || (stored ?? null) !== choice) return { ok: false, reason: "other" };
    return { ok: true, worn: choice };
  } catch {
    return { ok: false, reason: "network" };
  }
}

// What to do with an answer: the new worn value (unchanged on any failure) and the one quiet line, if any.
export function settlePick(o: PickOutcome, before: string | null | undefined): { worn: string | null; note: string | null } {
  const was = before ?? null;
  return o.ok ? { worn: o.worn, note: null } : { worn: was, note: PICKER_ERRORS[o.reason] };
}

// Dev-only preview: ?picker=stub shows the picker with stubbed owned keepsakes and no server calls. Ignored in production.
export function pickerPreview(search: string, isProduction: boolean): boolean {
  return !isProduction && new URLSearchParams(search).get("picker") === "stub";
}
export const STUB_OWNED = ["ribbon", "paper_crown", "lantern"];

// What the shared strip shows. Keepsakes and decorations both produce one; the strip itself only draws it.
export type StripChoice = { id: string | null; label: string; current: boolean; disabled?: boolean };
export type StripView = { title: string; emptyText: string | null; choices: StripChoice[]; currentSuffix: string };
export function keepsakeStrip(owned: string[], worn: string | null | undefined): StripView {
  return { title: PICKER_TITLE, emptyText: owned.length === 0 ? PICKER_EMPTY : null, choices: choicesFor(owned, worn), currentSuffix: "worn" };
}
