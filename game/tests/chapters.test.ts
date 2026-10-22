import { describe, expect, it } from "vitest";
import { CHAPTERS, CHAPTER_MS, PLACES, canShow, chapterOverride, type ChapterPlace } from "@/lib/chapters";
import data from "@/data/chapters.json";
import { ICON_PATHS } from "@/lib/npcs";

describe("chapter cards (S21)", () => {
  it("reads wording and time from the data file", () => {
    expect(CHAPTERS.garden.name).toBe(data.places.garden.name);
    expect(CHAPTERS.margins.name).toBe("The Margins");
    expect(CHAPTERS.home.name).toBe("Home");
    expect(CHAPTER_MS).toBe(data.showMs);
    for (const p of PLACES) expect(ICON_PATHS).toHaveProperty(CHAPTERS[p].icon);
  });
  it("shows once per place", () => {
    const s = new Set<ChapterPlace>();
    expect(canShow(s, "margins", false)).toBe(true);
    s.add("margins");
    expect(canShow(s, "margins", false)).toBe(false);
    expect(canShow(s, "home", false)).toBe(true);
  });
  it("skips when another card is open", () => {
    expect(canShow(new Set(), "home", true)).toBe(false);
  });
  it("preview parser is null in production and for junk", () => {
    expect(chapterOverride("?chapter=margins", true)).toBeNull();
    expect(chapterOverride("?chapter=margins", false)).toBe("margins");
    expect(chapterOverride("?chapter=home", false)).toBe("home");
    expect(chapterOverride("?chapter=garden", false)).toBe("garden");
    expect(chapterOverride("?chapter=cave", false)).toBeNull();
    expect(chapterOverride("", false)).toBeNull();
  });
});
