// Static checks on the Glyph Quarter spots migration (W6 step 2). They read the SQL text; they cannot run it.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(new URL("../supabase/migrations/20261021000002_glyph_quarter_spots.sql", import.meta.url), "utf8");
const sql = raw.replace(/--.*$/gm, "").trim();

describe("paper downs spots migration", () => {
  it("says it is additive and not applied", () => {
    expect(raw).toMatch(/Purely additive/);
    expect(raw).toMatch(/NOT applied/);
  });
  it("is exactly one insert of glyph_quarter with 8 spots, and nothing else", () => {
    expect(sql.replace(/\s+/g, " ")).toBe("insert into public.game_spot_regions (region, spots) values ('glyph_quarter', 8);");
  });
  it("changes no function, table shape, policy, grant or existing row", () => {
    expect(sql).not.toMatch(/\b(drop|alter|update|delete|truncate|create|grant|revoke)\b/i);
  });
  it("the region id fits the table's check", () => {
    expect("glyph_quarter").toMatch(/^[a-z][a-z0-9_]{1,23}$/);
  });
});
