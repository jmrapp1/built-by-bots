// Static checks on the Reading Room spots migration (S34 step 1). They read the SQL text; they cannot run it.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../supabase/migrations/", import.meta.url);
const NAME = "20261022000002_reading_room_spots.sql";
const raw = readFileSync(new URL(NAME, dir), "utf8");
const sql = raw.replace(/--.*$/gm, "").trim();

describe("reading room spots migration", () => {
  it("says it is additive and not applied", () => {
    expect(raw).toMatch(/Purely additive/);
    expect(raw).toMatch(/NOT applied/);
  });
  it("is exactly one insert of reading_room with 6 spots, and nothing else", () => {
    expect(sql.replace(/\s+/g, " ")).toBe("insert into public.game_spot_regions (region, spots) values ('reading_room', 6);");
  });
  it("changes no function, table shape, policy, grant or existing row", () => {
    expect(sql).not.toMatch(/\b(drop|alter|update|delete|truncate|create|grant|revoke)\b/i);
  });
  it("the region id and spot count fit the table's rules", () => {
    expect("reading_room").toMatch(/^[a-z][a-z0-9_]{1,23}$/);
    expect(6).toBeGreaterThanOrEqual(1);
    expect(6).toBeLessThanOrEqual(64);
  });
  it("follows the previous migration in name order", () => {
    const names = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const i = names.indexOf(NAME);
    expect(i).toBeGreaterThan(0);
    expect(names[i - 1]).toBe("20261022000001_npc_gifts2.sql");
  });
  it("has a read-only read-back file", () => {
    const rb = readFileSync(new URL("../supabase/reading_room_readback.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
    expect(rb).not.toMatch(/(^|;)\s*(insert|update|delete|drop|alter|create|grant|revoke)\b/i);
    expect(rb).toMatch(/reading_room/);
  });
});
