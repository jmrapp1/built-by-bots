// Static checks on the World spots migration (W5). They read the SQL text; they cannot run it.
// The signed-in checks to run after applying are in supabase/world_spots_readback.sql.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rd = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const raw = rd("../supabase/migrations/20261021000001_world_spots.sql");
const sql = raw.replace(/--.*$/gm, "");
const fn = sql.slice(sql.indexOf("create function public.world_unfold"), sql.indexOf("revoke execute on function public.world_unfold"));
const oldFn = rd("../supabase/migrations/20261020000007_margins_keepsakes.sql").replace(/--.*$/gm, "");
const oldBody = oldFn.slice(oldFn.indexOf("create or replace function public.margins_unfold"));
const read = rd("../supabase/world_spots_readback.sql");
const world = JSON.parse(rd("../data/world.json"));

describe("world spots migration: what it changes", () => {
  it("says in plain words that it is not purely additive and not applied", () => {
    expect(raw).toMatch(/NOT purely additive/);
    expect(raw).toMatch(/REPLACED/);
    expect(raw).toMatch(/NOT applied/);
  });
  it("drops only the old key and the old spot check, and nothing else", () => {
    expect([...sql.matchAll(/drop\s+(\w+)\s+(\w+)/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, " "))).toEqual([
      "drop constraint margins_claims_pkey", "drop constraint margins_claims_spot_check",
    ]);
    expect(sql).not.toMatch(/drop\s+(table|column|function|policy|schema)/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bupdate\s+public\./i);
  });
  it("adds a region column defaulting to margins, so old rows stay valid", () => {
    expect(sql).toMatch(/add column region text not null default 'margins' references public\.game_spot_regions \(region\)/);
    expect(sql).toMatch(/add primary key \(owner, day, region, spot\)/);
  });
  it("seeds the regions: the gate keeps 12, the World regions are listed", () => {
    expect(sql).toMatch(/values \('margins', 12\), \('meadow', 4\), \('inkwood', 8\)/);
  });
  it("seeded region ids match the World's region ids in the data/code", () => {
    const code = rd("../lib/worldMap.ts");
    for (const r of ["meadow", "inkwood"]) expect(code).toContain(`"${r}"`);
    expect(world.density).toHaveProperty("meadow");
    expect(world.density).toHaveProperty("inkwood");
  });
  it("the new table is read-only to clients, behind RLS", () => {
    expect(sql).toMatch(/alter table public\.game_spot_regions enable row level security/);
    expect(sql).toMatch(/revoke all on public\.game_spot_regions from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.game_spot_regions to authenticated/);
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*game_spot_regions/i);
  });
});

describe("world spots migration: world_unfold keeps every old rule", () => {
  const rules: [string, RegExp][] = [
    ["signed in only", /uid uuid := auth\.uid\(\)/], ["no anonymous", /is_anonymous/], ["starter-egg guard", /collect your starter egg first/],
    ["the same lock", /for update/], ["server's UTC day", /today date := \(now\(\) at time zone 'utc'\)::date/],
    ["stored first answer", /if found then return c; end if;/], ["ceiling", /if used >= ceiling then raise exception 'enough pages for today'/],
    ["egg rule", /pick = 'egg' and \(/], ["blotling only", /id = 'blotling'/], ["definer, empty path", /security definer set search_path = ''/],
    ["keepsake grant", /from public\.grant_keepsake\('margins'\)/], ["finds table", /from public\.game_margins_finds/],
    ["egg gap check", /result = 'egg' and day > today - egg_gap/],
  ];
  for (const [name, re] of rules) it(`keeps: ${name}`, () => { expect(oldBody).toMatch(re); expect(fn).toMatch(re); });
  it("keeps the same ceiling and egg gap", () => {
    for (const c of ["ceiling constant int := 10", "egg_gap constant int := 5"]) { expect(oldBody).toContain(c); expect(fn).toContain(c); }
  });
  it("the ceiling counts every region together (no region filter on the count)", () => {
    expect(fn).toMatch(/select count\(\*\) into used from public\.margins_claims where owner = uid and day = today;/);
  });
  it("the stored answer is looked up by region and spot, before any roll or grant", () => {
    expect(fn).toMatch(/where owner = uid and day = today and region = p_region and spot = p_spot/);
    expect(fn.indexOf("if found then return c; end if;")).toBeLessThan(fn.indexOf("used >= ceiling"));
    expect(fn.indexOf("used >= ceiling")).toBeLessThan(fn.indexOf("grant_keepsake"));
  });
  it("the spot range comes from the data table; an unknown region is the same quiet refusal", () => {
    expect(fn).toMatch(/from public\.game_spot_regions r where r\.region = p_region/);
    expect(fn).toMatch(/if not found or p_spot is null or p_spot < 0 or p_spot >= spots then raise exception 'no such page'/);
    expect(fn).not.toMatch(/spots constant/);
  });
  it("takes a region name and a spot number and nothing else; no caller input decides a result", () => {
    expect(fn.match(/world_unfold\(([^)]*)\)/)![1]).toBe("p_region text, p_spot int");
    expect(fn).not.toMatch(/p_(cosmetic|kind|result|day|owner|weight|egg)/);
    expect(fn).toMatch(/cos := g\.cosmetic/);
    expect(fn).not.toMatch(/random\(\)/);
    expect(fn).not.toMatch(/\bcommit\b|\bexception\s+when\b|pragma autonomous/i);
  });
  it("the roll text for the Margins is exactly the old one; other regions add the region name", () => {
    expect(oldBody).toMatch(/md5\(uid::text \|\| ':' \|\| today::text \|\| ':' \|\| p_spot::text\)/);
    expect(fn).toMatch(/seed := case when p_region = 'margins' then p_spot::text else p_region \|\| ':' \|\| p_spot::text end/);
    expect(fn).toMatch(/md5\(uid::text \|\| ':' \|\| today::text \|\| ':' \|\| seed\)/);
  });
  it("every claim insert carries the region from the argument", () => {
    const ins = [...fn.matchAll(/insert into public\.margins_claims \(owner, day, region, spot, result[^)]*\) values \(uid, today, p_region, p_spot,/g)];
    expect(ins.length).toBe(3);
    expect(fn.match(/insert into public\.margins_claims/g)!.length).toBe(3);
  });
});

describe("world spots migration: the Margins gate keeps its keys and grants", () => {
  const wrapper = sql.slice(sql.indexOf("create or replace function public.margins_unfold"));
  it("margins_unfold keeps its signature and only calls world_unfold with the fixed region", () => {
    expect(wrapper).toMatch(/^create or replace function public\.margins_unfold\(p_spot int\) returns public\.margins_claims/);
    expect(wrapper).toMatch(/return public\.world_unfold\('margins', p_spot\);/);
    expect(wrapper).toMatch(/security definer set search_path = ''/);
  });
  it("both functions: execute for signed-in accounts only", () => {
    for (const f of ["world_unfold\\(text, int\\)", "margins_unfold\\(int\\)"]) {
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${f} from public, anon;`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${f} to authenticated;`));
    }
    expect(sql).not.toMatch(/grant execute[^;]*\bto (anon|public)\b/i);
  });
  it("does not touch the daily egg or the care economy", () => {
    expect(sql).not.toMatch(/claim_daily_egg|daily_pool|game_daily|feed_creature|elder/i);
  });
});

describe("the read-back script", () => {
  it("has a read-only part and a clearly marked write part inside a rolled-back transaction", () => {
    expect(read).toMatch(/Part A: read-only/);
    expect(read).toMatch(/Part B: WRITES/);
    expect(read).toMatch(/-- begin;/);
    expect(read).toMatch(/-- rollback;/);
  });
  it("covers the gate, a World spot, bad input, the shared ceiling and anon", () => {
    for (const k of ["B1. The gate", "B2. A World spot", "B3.", "B4. The ceiling counts all regions", "B5."]) expect(read).toContain(k);
  });
  it("the executable lines of Part A only select", () => {
    const a = read.slice(read.indexOf("Part A"), read.indexOf("Part B")).replace(/--.*$/gm, "");
    expect(a).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i);
  });
});
