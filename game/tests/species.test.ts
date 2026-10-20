import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SPECIES, clampHue, isFavourite, partsFor, speciesById, speciesOverride } from "@/lib/species";
import foods from "@/data/foods.json";
import stages from "@/data/stages.json";

const sql = readFileSync(new URL("../supabase/migrations/20261020000001_leaflet_species.sql", import.meta.url), "utf8");
const code = sql.replace(/--.*$/gm, "");
const starter = readFileSync(new URL("../supabase/migrations/20261019000001_solo_slice.sql", import.meta.url), "utf8");

describe("species data", () => {
  it("has blotling and leaflet with distinct looks", () => {
    expect(SPECIES.map((s) => s.id)).toEqual(["blotling", "leaflet"]);
    const [b, l] = SPECIES;
    expect(b.body).not.toBe(l.body);
    expect(l.parts).not.toEqual(b.parts);
    expect(l.hueMax).toBeLessThan(360);
    expect(l.hueMin).toBeLessThanOrEqual(l.hueMax);
  });
  it("matches the migration seed", () => {
    const l = speciesById("leaflet");
    const parts = l.parts.map((x) => `'${x}'`).join(",");
    const shapes = l.shapes.map((x) => `'${x}'`).join(",");
    expect(sql).toContain(`('leaflet', ${l.hatchSeconds}, array[${shapes}], array[${parts}], ${l.hueMin}, ${l.hueMax})`);
  });
  it("prefers a food that exists", () => {
    for (const s of SPECIES) if (s.favouriteFood) expect(foods.map((f) => f.id)).toContain(s.favouriteFood);
  });
  it("every stage can show the leaflet's parts", () => {
    const l = speciesById("leaflet");
    for (const st of stages) expect(st.partsShown).toBeLessThanOrEqual(l.parts.length);
  });
});

describe("helpers", () => {
  it("falls back to blotling for unknown species", () => {
    expect(speciesById("nope").id).toBe("blotling");
    expect(speciesById(undefined).id).toBe("blotling");
  });
  it("keeps hue inside the range", () => {
    const l = speciesById("leaflet");
    expect(clampHue(10, l)).toBe(l.hueMin);
    expect(clampHue(300, l)).toBe(l.hueMax);
    expect(clampHue(100, l)).toBe(100);
    expect(clampHue(-260, l)).toBe(100);
  });
  it("only keeps parts the species has", () => {
    const l = speciesById("leaflet");
    expect(partsFor(["ears", "tabs"], l)).toEqual(["tabs"]);
    expect(partsFor(["ears", "fins"], l)).toEqual(l.parts.slice(0, 2));
  });
  it("marks the favourite food", () => {
    expect(isFavourite("glyph", "leaflet")).toBe(true);
    expect(isFavourite("ink", "leaflet")).toBe(false);
    expect(isFavourite("glyph", "blotling")).toBe(false);
  });
});

describe("species override (dev preview)", () => {
  it("works outside production", () => {
    expect(speciesOverride("?species=leaflet", false)).toBe("leaflet");
    expect(speciesOverride("?hour=3&species=blotling", false)).toBe("blotling");
  });
  it("is ignored in production", () => {
    expect(speciesOverride("?species=leaflet", true)).toBeNull();
  });
  it("ignores unknown or missing species", () => {
    expect(speciesOverride("?species=dragon", false)).toBeNull();
    expect(speciesOverride("", false)).toBeNull();
  });
});

describe("migration safety", () => {
  it("is additive: no drop, delete, truncate or unscoped update", () => {
    expect(code).not.toMatch(/\bdrop\b|\btruncate\b|\bdelete\s+from\b/i);
    // The only update is the one hatch_egg already had, scoped to the player's own egg.
    const updates = code.match(/\bupdate\s[^;]*;/gi) ?? [];
    expect(updates).toEqual(["update public.eggs set hatched_at = now() where id = e.id;"]);
  });
  it("changes no grants and nothing for anon", () => {
    expect(code).not.toMatch(/\bgrant\b|\brevoke\b|\bpolicy\b/i);
    expect(code).not.toMatch(/\banon\b/i);
  });
  it("does not touch the starter egg", () => {
    expect(code).not.toMatch(/claim_starter_egg/);
    expect(starter).toContain("'blotling'");
  });
  it("hatch_egg still refuses anonymous sessions and uses the server clock", () => {
    expect(sql).toContain("is_anonymous");
    expect(sql).toContain("now() < e.hatch_at");
  });
  it("adds no new food (glyph with care already exists)", () => {
    expect(code).not.toMatch(/game_foods/);
  });
});
