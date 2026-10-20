import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import species from "@/data/species.json";
import foods from "@/data/foods.json";
import rules from "@/data/rules.json";

const sql = readFileSync(new URL("../supabase/migrations/20261019000001_solo_slice.sql", import.meta.url), "utf8");

// The data files are the readable source; the migration seeds the same values.
describe("data files match the migration seed", () => {
  it("species", () => {
    for (const s of species.filter((x) => x.id === "blotling")) {
      const shapes = s.shapes.map((x) => `'${x}'`).join(",");
      const parts = s.parts.map((x) => `'${x}'`).join(",");
      expect(sql).toContain(`('${s.id}', ${s.hatchSeconds}, array[${shapes}], array[${parts}])`);
    }
  });
  it("foods", () => {
    for (const f of foods) expect(sql).toContain(`('${f.id}', ${f.fullness}, ${f.mood})`);
  });
  it("rules", () => {
    expect(sql).toContain(`('feed_cooldown_seconds', ${rules.feedCooldownSeconds})`);
    expect(sql).toContain(`('feeds_per_day', ${rules.feedsPerDay})`);
    expect(sql).toContain(`('max_stat', ${rules.maxStat})`);
    expect(sql).toContain(`('start_stat', ${rules.startStat})`);
  });
});

describe("migration safety", () => {
  it("enables RLS on every game table", () => {
    const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
    for (const t of tables) expect(sql).toContain(`alter table public.${t} enable row level security`);
  });
  it("grants no write access to clients", () => {
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
  });
});

describe("accounts only", () => {
  const sql2 = readFileSync(new URL("../supabase/migrations/20261019000002_accounts_only.sql", import.meta.url), "utf8");
  it("every game function refuses anonymous sessions", () => {
    const fns = sql2.match(/create or replace function public\.\w+/g) ?? [];
    expect(fns.length).toBe(3);
    expect(sql2.match(/is_anonymous/g)!.length).toBeGreaterThanOrEqual(5);
  });
  it("adds no write grants", () => {
    expect(sql2).not.toMatch(/grant\s+(insert|update|delete)/i);
  });
});
