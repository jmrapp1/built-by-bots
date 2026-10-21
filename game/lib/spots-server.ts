// W5: mapping between the server's world_unfold answer and the client. Pure: no network, no clock. The server decides what a
// spot gives; the client sends a region name and a spot number and shows the answer. No numbers in any text here.
import { classifyError, mapClaim, outcomeFrom, type Outcome } from "@/lib/margins-server";
import { REGIONS, spotKey } from "@/lib/worldSpots";

export type Call = (region: string, spot: number) => Promise<{ data: unknown; error: { message?: string } | null }>;

// The answer to one world_unfold. A row for a different region is not an answer to this question.
export function worldOutcomeFrom(data: unknown, error: { message?: string } | null, region: string, spot: number, layoutDay: string, alreadyOpen: boolean): Outcome {
  if (error) return { ok: false, reason: classifyError(error.message) };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object" || (row as Record<string, unknown>).region !== region) return { ok: false, reason: "other" };
  return outcomeFrom(row, null, spot, layoutDay, alreadyOpen);
}

// `wasOpen` is the server's own claim row for this region, spot and day, read just before the call (null: it can't say).
export async function runWorldUnfold(call: Call, region: string, spot: number, layoutDay: string, wasOpen: (region: string, spot: number) => Promise<boolean | null>): Promise<Outcome> {
  try {
    const before = await wasOpen(region, spot);
    if (before === null) return { ok: false, reason: "network" };
    const { data, error } = await call(region, spot);
    return worldOutcomeFrom(data, error, region, spot, layoutDay, before);
  } catch {
    return { ok: false, reason: "network" };
  }
}

// Today's rows for the World regions, as keys "region:spot". A row with no region is the old Margins shape and is skipped here.
export function openedWorldFromClaims(rows: unknown, layoutDay: string): string[] {
  const out = new Set<string>();
  if (!Array.isArray(rows)) return [];
  for (const r of rows) {
    const c = mapClaim(r);
    const region = r && typeof r === "object" ? (r as Record<string, unknown>).region : undefined;
    if (c && (c.day === null || c.day === layoutDay) && typeof region === "string" && (REGIONS as string[]).includes(region)) out.add(spotKey(region, c.spot));
  }
  return [...out];
}
