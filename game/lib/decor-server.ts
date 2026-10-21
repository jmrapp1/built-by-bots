// Mapping between the server's Home decoration answers and the client (Decor S4). Pure: no network, no clock.
// The server decides what is owned and what stands where; the client only asks and shows. A failed read is quiet:
// the decorations are simply not shown and no prompt appears.
import { isDecoration, plotOf, type Placed } from "@/lib/decor";

export const DECOR_ERRORS = { network: "Can't reach the garden right now. The spot stays as it was.", other: "That spot won't take it just now." };
export type PlaceOutcome = { ok: true; plot: string; decoration: string | null } | { ok: false; note: string };

/** Decoration ids from claim_starter_decorations ({decoration}) or owned_decorations rows. Malformed rows are skipped. */
export function ownedFromDecorRows(rows: unknown): string[] {
  if (!Array.isArray(rows)) return [];
  const out: string[] = [];
  for (const r of rows) { const d = (r as { decoration?: unknown } | null)?.decoration; if (isDecoration(d) && !out.includes(d)) out.push(d); }
  return out;
}
/** home_decorations rows -> plot id to decoration id. Unknown plots or pieces are skipped. */
export function placedFromRows(rows: unknown): Placed {
  const out: Placed = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const x = r as { plot?: unknown; decoration?: unknown } | null;
    if (typeof x?.plot === "string" && plotOf(x.plot) && isDecoration(x.decoration)) out[x.plot] = x.decoration;
  }
  return out;
}

type Reply = { data: unknown; error: { message?: string } | null };
/** Entering Home: claim the starters (idempotent), then read what is owned and placed. Null when any read fails (nothing is shown). */
export async function loadHomeDecor(
  claim: () => Promise<Reply>, readOwned: () => Promise<Reply>, readPlaced: () => Promise<Reply>,
): Promise<{ owned: string[]; placed: Placed } | null> {
  try {
    await claim(); // its own failure is not fatal: the reads below say what the server holds
    const [o, p] = [await readOwned(), await readPlaced()];
    if (o.error || p.error) return null;
    return { owned: ownedFromDecorRows(o.data), placed: placedFromRows(p.data) };
  } catch { return null; }
}

/** One place or clear. The page changes only when the server confirms. */
export async function runPlace(call: (a: { p_plot: string; p_decoration: string | null }) => Promise<Reply>, plot: string, choice: string | null): Promise<PlaceOutcome> {
  try {
    const { data, error } = await call({ p_plot: plot, p_decoration: choice });
    if (error) return { ok: false, note: /fetch|network|failed to|timeout/i.test(error.message ?? "") ? DECOR_ERRORS.network : DECOR_ERRORS.other };
    const row = (Array.isArray(data) ? data[0] : data) as { plot?: unknown; decoration?: unknown } | null;
    if (!row || row.plot !== plot || (row.decoration ?? null) !== choice) return { ok: false, note: DECOR_ERRORS.other };
    return { ok: true, plot, decoration: choice };
  } catch { return { ok: false, note: DECOR_ERRORS.network }; }
}
export const settlePlaced = (placed: Placed, o: PlaceOutcome): Placed => {
  if (!o.ok) return placed;
  const next = { ...placed };
  if (o.decoration === null) delete next[o.plot]; else next[o.plot] = o.decoration;
  return next;
};
