import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CARD_TEXT, cardOverride, cardStatus, withCardPreview } from "@/lib/cardStatus";
import { STAGES } from "@/lib/growth";

const c = (fullness: number, mood: number, stage = "blot") => ({ fullness, mood, stage });
const last = STAGES[STAGES.length - 1].id;

describe("cardStatus", () => {
  it("names the next stage from the data", () => {
    STAGES.slice(0, -1).forEach((s, i) => expect(cardStatus(c(80, 80, s.id)).caption).toBe(`Growing toward ${STAGES[i + 1].name}`));
    expect(cardStatus(c(80, 80)).caption).toBe("Growing toward Sprout");
  });
  it("last stage is fully grown", () => {
    expect(cardStatus(c(80, 80, last)).caption).toBe("Fully grown");
    expect(cardStatus(c(80, 80, last)).line).toBe(CARD_TEXT.wellGrown);
  });
  it("unknown or missing stage falls back to blot", () => {
    expect(cardStatus(c(80, 80, "nope"))).toEqual(cardStatus(c(80, 80, "blot")));
    expect(cardStatus({ fullness: 80, mood: 80, stage: null })).toEqual(cardStatus(c(80, 80)));
  });
  it("first match wins, boundary at 35", () => {
    expect(cardStatus(c(34, 80)).line).toBe(CARD_TEXT.hungry);
    expect(cardStatus(c(35, 80)).line).toBe(CARD_TEXT.well);
    expect(cardStatus(c(80, 34)).line).toBe(CARD_TEXT.lonely);
    expect(cardStatus(c(80, 35)).line).toBe(CARD_TEXT.well);
    expect(cardStatus(c(0, 0)).line).toBe(CARD_TEXT.hungry);
  });
  it("69/70 does not change anything", () => {
    expect(cardStatus(c(80, 69))).toEqual(cardStatus(c(80, 70)));
  });
  it("hungry beats lonely even at the last stage", () => expect(cardStatus(c(10, 10, last)).line).toBe(CARD_TEXT.hungry));
  it("keys come from the bound keys and wording is calm", () => {
    expect(CARD_TEXT.hungry).toContain("hold E");
    expect(CARD_TEXT.lonely).toContain("Hold R");
    for (const t of [CARD_TEXT.hungry, CARD_TEXT.lonely, CARD_TEXT.well, CARD_TEXT.wellGrown, CARD_TEXT.grown]) expect(t).not.toMatch(/\d|%|starv|!/i);
  });
});

describe("?card preview", () => {
  it("parses in dev, null in production and for near misses", () => {
    expect(cardOverride("?card=hungry", false)).toBe("hungry");
    expect(cardOverride("?card=lonely", false)).toBe("lonely");
    expect(cardOverride("?card=elder", false)).toBe("elder");
    expect(cardOverride("?card=hungry", true)).toBeNull();
    expect(cardOverride("?card=Hungry", false)).toBeNull();
    expect(cardOverride("", false)).toBeNull();
  });
  it("each preview reaches its line and none mutates the input", () => {
    const base = c(90, 90);
    expect(cardStatus(withCardPreview(base, "hungry")).line).toBe(CARD_TEXT.hungry);
    expect(cardStatus(withCardPreview(base, "lonely")).line).toBe(CARD_TEXT.lonely);
    expect(cardStatus(withCardPreview(base, "elder")).caption).toBe("Fully grown");
    expect(withCardPreview(base, null)).toBe(base);
    expect(base).toEqual(c(90, 90));
  });
});

describe("wiring and safety", () => {
  const strip = (s: string) => s.replace(/\/\/.*$/gm, "");
  const lib = strip(readFileSync("lib/cardStatus.ts", "utf8"));
  it("lib makes no network or storage calls", () => expect(lib).not.toMatch(/fetch\(|supabase|\.rpc\(|localStorage|sessionStorage|Date\.now/));
  it("World.tsx is untouched by S14", () => expect(readFileSync("components/World.tsx", "utf8")).not.toMatch(/cardStatus/));
  it("page uses the card status and keeps the progressbar", () => {
    const p = readFileSync("app/page.tsx", "utf8");
    expect(p).toMatch(/cardStatus\(shown(, tw)?\)/);
    expect(p).toMatch(/role="progressbar"/);
    expect(p).toMatch(/\{status\.caption\}/);
    expect(p).toMatch(/\{status\.line\}/);
  });
  it("the new text has no aria-live", () => expect(readFileSync("app/page.tsx", "utf8")).not.toMatch(/card-note[^>]*aria-live/));
});
