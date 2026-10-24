// S14: plain words for the "Your Print" card. Pure display logic; no React, no server, no storage.
import { STAGES, progressToNext, stageById } from "@/lib/growth";
import { PLAY } from "@/lib/play";
import { keyLabel } from "@/lib/ui";

export const LOW = 35;

// Every word the player sees from this feature. Wording changes here, not in logic.
export const CARD_TEXT = {
  growing: (next: string) => `Growing toward ${next}`,
  grown: "Fully grown",
  hungry: `Hungry for a snack. Gather one and hold ${keyLabel(PLAY.keys.hold)} beside it.`,
  lonely: `Could use a stroke. Hold ${keyLabel(PLAY.keys.stroke)} beside it.`,
  well: "Doing well. It grows a little as you care for it.",
  wellGrown: "Doing well. Nothing here ever hurries you.",
};

// S38a: the same two lines for a thumb (no key names).
export const CARD_TEXT_TOUCH = {
  hungry: "Hungry for a snack. Gather one and hold the big button beside it.",
  lonely: "Could use a stroke. Hold the stroke button beside it.",
};

export type CardCreature = { fullness: number; mood: number; stage?: string | null };

// One caption under the bar, one status line (first match wins). An unknown stage reads as the first stage.
export function cardStatus(c: CardCreature, touch = false): { caption: string; line: string } {
  const stage = stageById(c.stage ?? STAGES[0].id);
  const next = STAGES[STAGES.findIndex((s) => s.id === stage.id) + 1];
  const caption = next ? CARD_TEXT.growing(next.name) : CARD_TEXT.grown;
  if (c.fullness < LOW) return { caption, line: touch ? CARD_TEXT_TOUCH.hungry : CARD_TEXT.hungry };
  if (c.mood < LOW) return { caption, line: touch ? CARD_TEXT_TOUCH.lonely : CARD_TEXT.lonely };
  return { caption, line: next ? CARD_TEXT.well : CARD_TEXT.wellGrown };
}

export { progressToNext };

// ?card=hungry|lonely|elder fakes the card's values so each line can be seen (dev only, ignored in production builds).
export type CardPreview = "hungry" | "lonely" | "elder";
export const cardOverride = (search: string, isProduction: boolean): CardPreview | null => {
  if (isProduction) return null;
  const v = new URLSearchParams(search).get("card");
  return v === "hungry" || v === "lonely" || v === "elder" ? v : null;
};
export function withCardPreview<T extends CardCreature>(c: T, p: CardPreview | null): T {
  if (!p) return c;
  if (p === "hungry") return { ...c, fullness: 20, mood: 80 };
  if (p === "lonely") return { ...c, fullness: 80, mood: 20 };
  return { ...c, stage: STAGES[STAGES.length - 1].id, fullness: 80, mood: 80 };
}
