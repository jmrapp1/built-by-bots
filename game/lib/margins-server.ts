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
