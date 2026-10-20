// Mapping between the server's margins_unfold answer and the client (slice 6c). Pure: no network, no clock.
// The server decides what is inside a page; the client only shows it. No numbers in any text here.
import type { Overrides } from "@/lib/margins";

export type Shown = "ink" | "glyph" | "scrap" | "egg";
export type ClaimRow = { spot: number; result: string; day?: string };
export type FailReason = "ceiling" | "signed-out" | "starter" | "bad-page" | "wrong-day" | "network" | "other";
export type Outcome = { ok: true; kind: Shown; spot: number; duplicate: boolean } | { ok: false; reason: FailReason };

export const QUIET = "The pages are quiet for now.";
export const FOUND_EGG = "A found egg is waiting in your nest.";
export const MARGINS_ERRORS: Record<FailReason, string> = {
  ceiling: QUIET,
  "signed-out": "Sign in to unfold pages.",
  starter: "Collect your first egg before you go exploring.",
  "bad-page": "That page won't open.",
  "wrong-day": QUIET, // the server's day moved on while you were out; the pages will be new next visit
  network: "Can't reach the garden right now. The page stays folded.",
  other: "That page won't open just now.",
};

const KINDS: readonly string[] = ["ink", "glyph", "scrap", "egg"];
export const isShown = (s: unknown): s is Shown => typeof s === "string" && KINDS.includes(s);

// A row from margins_unfold or margins_claims, or null when it is not a valid answer.
export function mapClaim(row: unknown): { spot: number; kind: Shown; day: string | null } | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.spot !== "number" || !Number.isInteger(r.spot) || !isShown(r.result)) return null;
  return { spot: r.spot, kind: r.result, day: typeof r.day === "string" ? r.day : null };
}

// Why a call failed, from the server's own words. Never shown to the player directly.
export function classifyError(message: string | undefined | null): FailReason {
  const m = (message ?? "").toLowerCase();
  if (m.includes("enough pages")) return "ceiling";
  if (m.includes("not signed in") || m.includes("sign in with an account") || m.includes("jwt")) return "signed-out";
  if (m.includes("starter egg")) return "starter";
  if (m.includes("no such page")) return "bad-page";
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to") || m.includes("timeout")) return "network";
  return "other";
}

// The answer to one unfold: either a find to show, or a quiet reason. `layoutDay` is the day the pages were laid out for;
// if the server's day has moved on, the answer is not applied (the pages on screen are for the old day).
export function outcomeFrom(data: unknown, error: { message?: string } | null, spot: number, layoutDay: string, alreadyOpen: boolean): Outcome {
  if (error) return { ok: false, reason: classifyError(error.message) };
  const c = mapClaim(Array.isArray(data) ? data[0] : data);
  if (!c || c.spot !== spot) return { ok: false, reason: "other" };
  if (c.day && c.day !== layoutDay) return { ok: false, reason: "wrong-day" };
  // The server returns the first answer for a repeat claim, so the answer alone cannot say whether it is new. `alreadyOpen` comes
  // from the server's own claim rows read just before the call. No browser clock is involved.
  return { ok: true, kind: c.kind, spot: c.spot, duplicate: alreadyOpen };
}

// Pages the server already holds for this player and day. Anything malformed is skipped.
export function openedFromClaims(rows: unknown, layoutDay: string): Set<number> {
  const out = new Set<number>();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const c = mapClaim(r);
    if (c && (c.day === null || c.day === layoutDay)) out.add(c.spot);
  }
  return out;
}

// Dev-only previews that change which pages exist or what is in them never touch the server.
export const isLocalPreview = (o: Overrides): boolean => o.day !== null || o.all || o.unfold;

// A pouch with no room blocks every unfold before any call, since the server picks the find.
export const needsRoom = (kind: Shown): boolean => kind === "ink" || kind === "glyph";
export const foodOf = (kind: Shown): "ink" | "glyph" | null => (kind === "ink" || kind === "glyph" ? kind : null);

// One unfold, start to finish: ask the server whether this page already has a claim row (`wasOpen`: true, false, or null when it
// can't say), make the call, then check the answer against the day the pages were laid out for. A page that already had a row is
// a repeat. If the server can't say, the page stays folded and nothing is called. Both are passed in so the path is testable.
export async function runUnfold(
  call: (spot: number) => Promise<{ data: unknown; error: { message?: string } | null }>,
  spot: number, layoutDay: string, wasOpen: (spot: number) => Promise<boolean | null>,
): Promise<Outcome> {
  try {
    const before = await wasOpen(spot);
    if (before === null) return { ok: false, reason: "network" };
    const { data, error } = await call(spot);
    return outcomeFrom(data, error, spot, layoutDay, before);
  } catch {
    return { ok: false, reason: "network" };
  }
}

export const ALREADY_OPEN = "That page is already open.";
export type Settle = { open: boolean; animate: boolean; kind: Shown | null; food: "ink" | "glyph" | null; scrap: boolean; egg: boolean; note: string | null; ceiling: boolean; held: Shown | null };
// What to do when an answer arrives. `stillThere` is false when the player left the Margins while the call was in flight:
// the find is then granted at once (the server already wrote it), with no animation, so it is never lost.
// `room` is whether the pouch can take a food find right now. A new food find with no room is not lost: the server wrote it, so the
// page stays folded and the find is held (`held`) until the player has room, with the gentle full-pouch hint.
export function settleUnfold(o: Outcome, stillThere: boolean, room = true): Settle {
  const none = { open: false, animate: false, kind: null, food: null, scrap: false, egg: false, note: null, ceiling: false, held: null };
  if (!o.ok) return { ...none, note: stillThere ? MARGINS_ERRORS[o.reason] : null, ceiling: o.reason === "ceiling" };
  if (o.duplicate) return { ...none, open: true, kind: o.kind, note: stillThere ? ALREADY_OPEN : null };
  if (foodOf(o.kind) && !room) return { ...none, kind: o.kind, held: o.kind };
  return { ...none, open: true, animate: stillThere, kind: o.kind, food: foodOf(o.kind), scrap: o.kind === "scrap", egg: o.kind === "egg", note: o.kind === "egg" ? FOUND_EGG : null };
}

// What the player sees at a folded page while the claims read is not good. Not ready (still reading, or the read failed):
// no "Hold to unfold" prompt, and no call can be made. A failed read also gets the plain line when E is held there.
export function unfoldView(local: boolean, ready: boolean, failed: boolean): { prompt: boolean; canAsk: boolean; noteOnHold: string | null } {
  const ok = local || ready;
  return { prompt: ok, canAsk: ok, noteOnHold: !local && failed ? MARGINS_ERRORS.network : null };
}

// The result of reading today's claims on entering the area. A failed read keeps the ring from running.
export function afterClaimsRead(rows: number[] | null): { ready: boolean; opened: number[]; note: string | null } {
  return rows === null ? { ready: false, opened: [], note: MARGINS_ERRORS.network } : { ready: true, opened: rows, note: null };
}
