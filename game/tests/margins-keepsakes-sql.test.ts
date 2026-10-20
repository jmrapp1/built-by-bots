// Static checks on the Margins keepsakes migration (slice 6d-3a). They read the SQL text; they cannot run it.
// The signed-in checks to run after applying are in supabase/margins_keepsakes_readback.sql.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const raw = readFileSync(new URL("../supabase/migrations/20261020000007_margins_keepsakes.sql", import.meta.url), "utf8");
const sql = raw.replace(/--.*$/gm, "");
const fn = sql.slice(sql.indexOf("create or replace function public.margins_unfold"));
const old = readFileSync(new URL("../supabase/migrations/20261020000005_margins_claims.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
const oldFn = old.slice(old.indexOf("create function public.margins_unfold"));
const read = readFileSync(new URL("../supabase/margins_keepsakes_readback.sql", import.meta.url), "utf8");

describe("margins keepsakes migration: what it changes", () => {
  it("drops only the two old check constraints and replaces them with supersets", () => {
    expect([...sql.matchAll(/drop\s+(\w+)\s+(\w+)/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, " "))).toEqual([
      "drop constraint game_margins_finds_kind_check", "drop constraint margins_claims_result_check",
    ]);
    expect(sql).not.toMatch(/drop\s+(table|column|function|policy|schema)/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bupdate\s+public\./i);
    expect(sql).toMatch(/game_margins_finds_kind_check check \(kind in \('ink', 'glyph', 'scrap', 'egg', 'keepsake'\)\)/);
    expect(sql).toMatch(/margins_claims_result_check check \(result in \('ink', 'glyph', 'scrap', 'egg', 'keepsake'\)\)/);
  });
  it("adds one nullable column that names the keepsake, tied to the result", () => {
    expect(sql.match(/alter table public\.margins_claims add column/gi)?.length).toBe(1);
    expect(sql).toMatch(/add column cosmetic text references public\.game_cosmetics \(id\)/);
    expect(sql).not.toMatch(/cosmetic text not null/);
    expect(sql).toMatch(/check \(\(result = 'keepsake'\) = \(cosmetic is not null\)\)/);
  });
  it("adds a keepsake row to the finds table and nothing else to it", () => {
    expect([...sql.matchAll(/insert into public\.game_margins_finds \(kind, weight\) values \('(\w+)', (\d+)\)/g)].map((m) => m[1])).toEqual(["keepsake"]);
    expect(Number(sql.match(/values \('keepsake', (\d+)\)/)![1])).toBeGreaterThan(0);
  });
  it("says in plain words that it is not purely additive", () => {
    expect(raw).toMatch(/NOT purely additive/);
    expect(raw).toMatch(/REPLACED/);
    expect(raw).toMatch(/NOT applied/);
  });
});

describe("margins keepsakes migration: the replaced function keeps every old rule", () => {
  const rules: [string, RegExp][] = [
    ["signed in only", /uid uuid := auth\.uid\(\)/], ["no anonymous", /is_anonymous/], ["page range", /p_spot < 0 or p_spot >= spots/],
    ["starter-egg guard", /collect your starter egg first/], ["the same lock", /for update/],
    ["server's UTC day", /today date := \(now\(\) at time zone 'utc'\)::date/], ["stored first answer", /if found then return c; end if;/],
    ["ceiling", /if used >= ceiling then raise exception 'enough pages for today'/], ["repeatable roll", /md5\(uid::text \|\| ':' \|\| today::text \|\| ':' \|\| p_spot::text\)/],
    ["egg rule", /pick = 'egg' and \(/], ["blotling only", /id = 'blotling'/], ["definer, empty path", /security definer set search_path = ''/],
  ];
  for (const [name, re] of rules) it(`keeps: ${name}`, () => { expect(oldFn).toMatch(re); expect(fn).toMatch(re); });
  it("keeps the same constants", () => {
    for (const c of ["spots constant int := 12", "ceiling constant int := 10", "egg_gap constant int := 5"]) { expect(oldFn).toContain(c); expect(fn).toContain(c); }
  });
  it("has the same signature and return type, and the same grants", () => {
    expect(fn).toMatch(/^create or replace function public\.margins_unfold\(p_spot int\) returns public\.margins_claims/);
    expect(sql).toMatch(/revoke execute on function public\.margins_unfold\(int\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.margins_unfold\(int\) to authenticated;/);
    expect(sql).not.toMatch(/grant execute[^;]*\bto (anon|public)\b/i);
    expect(fn).not.toMatch(/random\(\)/);
  });
  it("takes the client's page number and nothing else", () => {
    expect(fn.match(/margins_unfold\(([^)]*)\)/)![1]).toBe("p_spot int");
    expect(fn).not.toMatch(/p_(cosmetic|kind|result|day|owner)/);
  });
});

describe("margins keepsakes migration: the keepsake rules", () => {
  it("grants through grant_keepsake('margins'), only for the keepsake pick, before the claim row, in the same function", () => {
    expect(fn).toMatch(/if pick = 'keepsake' then/);
    expect(fn).toMatch(/from public\.grant_keepsake\('margins'\)/);
    expect(fn.match(/grant_keepsake/g)!.length).toBe(1);
    expect(fn.indexOf("grant_keepsake")).toBeLessThan(fn.indexOf("insert into public.margins_claims (owner, day, spot, result, cosmetic)"));
  });
  it("an all-owned player gets food, and so does a player with no Print to wear it", () => {
    expect(fn).toMatch(/if g\.duplicate then pick := 'glyph'/);
    expect(fn).toMatch(/not exists \(select 1 from public\.creatures where owner = uid\) then\s+pick := 'ink'/);
  });
  it("the stored answer is returned before any roll or grant, so a repeat grants nothing", () => {
    expect(fn.indexOf("if found then return c; end if;")).toBeLessThan(fn.indexOf("grant_keepsake"));
    expect(fn.indexOf("if found then return c; end if;")).toBeLessThan(fn.indexOf("used >= ceiling"));
  });
  it("the ceiling check comes before the grant, and the grant and claim row are one transaction (no commit, no exception handler)", () => {
    expect(fn.indexOf("used >= ceiling")).toBeLessThan(fn.indexOf("grant_keepsake"));
    expect(fn).not.toMatch(/\bcommit\b|\bexception\s+when\b|pragma autonomous/i);
  });
  it("the egg rule and the daily egg are untouched", () => {
    expect(fn).toContain("exists (select 1 from public.eggs where owner = uid and hatched_at is null)");
    expect(fn).toContain("result = 'egg' and day > today - egg_gap");
    expect(sql).not.toMatch(/claim_daily_egg|daily_pool|game_daily/i);
    expect(sql).not.toMatch(/feed_creature|elder|care/i);
  });
  it("the cosmetic comes only from the server's grant, never from the caller", () => {
    expect(fn).toMatch(/cos := g\.cosmetic/);
    expect(fn).not.toMatch(/cos := p_/);
  });
});

describe("the read-back script", () => {
  it("has a read-only part and a clearly marked write part inside a rolled-back transaction", () => {
    expect(read).toMatch(/Part A: read-only/);
    expect(read).toMatch(/Part B: WRITES/);
    expect(read).toMatch(/-- begin;/);
    expect(read).toMatch(/-- rollback;/);
    expect(read.indexOf("Part A")).toBeLessThan(read.indexOf("Part B"));
  });
  it("covers a grant, a repeat, the seventh case, the ceiling, no Print, and anon", () => {
    for (const k of ["B1. A keepsake is granted", "B2. A repeat grants nothing", "B3. A seventh case gives food", "B4. The ceiling still holds", "B5.", "B6."]) expect(read).toContain(k);
  });
  it("the executable lines of Part A only select", () => {
    const a = read.slice(read.indexOf("Part A"), read.indexOf("Part B")).replace(/--.*$/gm, "");
    expect(a).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i);
  });
});
