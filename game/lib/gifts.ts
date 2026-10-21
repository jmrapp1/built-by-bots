// NPC gifts (slice N4), client side. Pure mapping, no network or clock here: the page makes the call.
// The server decides everything: the client sends only the neighbour's id and shows what comes back.
// A failed or odd answer grants nothing locally; the strip simply keeps the hint and the next talk tries again.
import { isDecoration } from "@/lib/decor";
import { npcById, type Npc } from "@/lib/npcs";

export const GIFT_ERRORS = { network: "Can't reach the garden right now. Try again next time.", other: "That gift won't come just now. Try again next time." };
export type GiftOutcome = { ok: true; npc: string; decoration: string; isNew: boolean } | { ok: false; note: string };
type Reply = { data: unknown; error: { message?: string } | null };

/** One claim for one neighbour (the id only). Never throws. */
export async function runClaimGift(call: (a: { p_npc: string }) => Promise<Reply>, npcId: string): Promise<GiftOutcome> {
  try {
    const { data, error } = await call({ p_npc: npcId });
    if (error) return { ok: false, note: /fetch|network|failed to|timeout/i.test(error.message ?? "") ? GIFT_ERRORS.network : GIFT_ERRORS.other };
    const row = (Array.isArray(data) ? data[0] : data) as { npc?: unknown; decoration?: unknown; is_new?: unknown } | null;
    if (!row || row.npc !== npcId || !isDecoration(row.decoration) || typeof row.is_new !== "boolean") return { ok: false, note: GIFT_ERRORS.other };
    return { ok: true, npc: npcId, decoration: row.decoration, isNew: row.is_new };
  } catch { return { ok: false, note: GIFT_ERRORS.network }; }
}

/** The strip to show after an answer: the gift line the first time, the thank-you after; null = keep what is showing. */
export function giftStrip(n: Npc | null, o: GiftOutcome): { name: string; text: string; icons: string[] } | null {
  if (!n || !n.gift || !o.ok) return null;
  return { name: n.name, text: o.isNew ? n.gift.line : n.gift.thanks, icons: n.gift.icons };
}
export const giftNpc = (id: string): Npc | null => { const n = npcById(id); return n && n.gift ? n : null; };
/** Add a piece the server said we own, without duplicates (used when the re-read of owned pieces fails). */
export const withOwned = (owned: string[], decoration: string): string[] => (owned.includes(decoration) ? owned : [...owned, decoration]);
