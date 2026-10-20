// Static checks on the Margins migration (slice 6b), in the same style as the daily egg tests. They read the
// SQL text; they cannot run it. The read-back checks to run after applying are listed in the migration notes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MARGINS } from "@/lib/margins";

const raw = readFileSync(new URL("../supabase/migrations/20261020000005_margins_claims.sql", import.meta.url), "utf8");
const sql = raw.replace(/--.*$/gm, "");
const fn = sql.slice(sql.indexOf("create function public.margins_unfold"));

describe("margins migration: shape", () => {
  it("is additive: no drops, deletes, truncates or updates of existing rows", () => {
    expect(sql).not.toMatch(/drop\s+(table|function|column|policy|index)/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b|\btruncate\b|\bupdate\s+public\./i);
    expect(sql.match(/drop constraint/gi)?.length).toBe(1); // only eggs_kind_check, replaced by a superset
    expect(sql).toMatch(/drop constraint eggs_kind_check/);
    expect(sql).toMatch(/check \(kind in \('starter', 'daily', 'found'\)\)/);
  });
  it("does not touch feeding, growth, the daily pool or species", () => {
    expect(sql).not.toMatch(/feed_creature|grow_creature|game_daily_pool|game_stages|game_foods|game_species\s*\(/);
    expect(sql).not.toMatch(/insert into public\.creatures|update public\.creatures/);
  });
  it("turns on row level security and only lets players read their own claims", () => {
    expect(sql).toMatch(/alter table public\.margins_claims enable row level security/);
    expect(sql).toMatch(/alter table public\.game_margins_finds enable row level security/);
    expect(sql).toMatch(/on public\.margins_claims for select to authenticated using \(owner = auth\.uid\(\)\)/);
    expect(sql).toMatch(/revoke all on public\.game_margins_finds, public\.margins_claims from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.game_margins_finds, public\.margins_claims to authenticated/);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)/i);
  });
  it("one claim per player, day and page is the primary key", () => {
    expect(sql).toMatch(/primary key \(owner, day, spot\)/);
    expect(sql).toMatch(/spot int not null check \(spot between 0 and 11\)/);
  });
});

describe("margins migration: the function", () => {
  it("is security definer with an empty search path and only for signed-in callers", () => {
    expect(fn).toMatch(/security definer set search_path = ''/);
    expect(sql).toMatch(/revoke execute on function public\.margins_unfold\(int\) from public, anon/);
    expect(sql).toMatch(/grant execute on function public\.margins_unfold\(int\) to authenticated/);
    expect(fn).toMatch(/if uid is null then raise exception 'not signed in'/);
    expect(fn).toMatch(/is_anonymous/);
  });
  it("takes its day and identity from the server, never from the client", () => {
    expect(fn).toMatch(/uid uuid := auth\.uid\(\)/);
    expect(fn).toMatch(/today date := \(now\(\) at time zone 'utc'\)::date/);
    expect(fn.match(/create function[^)]*\)/)![0]).toBe("create function public.margins_unfold(p_spot int)");
  });
  it("refuses a page number outside the day's pages, and the number matches the client", () => {
    expect(fn).toMatch(/p_spot < 0 or p_spot >= spots/);
    expect(fn).toMatch(new RegExp(`spots constant int := ${MARGINS.spots.count};`));
    expect(sql).toMatch(new RegExp(`between 0 and ${MARGINS.spots.count - 1}\\)`));
  });
  it("a repeat claim returns the first answer before any ceiling or write", () => {
    const again = fn.indexOf("from public.margins_claims where owner = uid and day = today and spot = p_spot");
    const ceiling = fn.indexOf("raise exception 'enough pages for today'");
    const insert = fn.indexOf("insert into public.margins_claims");
    expect(again).toBeGreaterThan(0);
    expect(fn.slice(again, again + 120)).toMatch(/if found then return c/);
    expect(again).toBeLessThan(ceiling);
    expect(ceiling).toBeLessThan(insert);
  });
  it("serialises per player with the daily egg's lock", () => {
    expect(fn).toMatch(/from public\.daily_egg_claims where owner = uid for update/);
    expect(fn.indexOf("for update")).toBeLessThan(fn.indexOf("insert into public.margins_claims"));
  });
  it("enforces a daily ceiling, written to nothing when refused", () => {
    expect(fn).toMatch(/ceiling constant int := \d+/);
    expect(fn).toMatch(/if used >= ceiling then raise exception/);
    expect(fn.indexOf("if used >= ceiling")).toBeLessThan(fn.indexOf("insert into public.eggs"));
    expect(Number(fn.match(/ceiling constant int := (\d+)/)![1])).toBeLessThan(MARGINS.spots.count);
  });
  it("the roll is repeatable: from the player, day and page, with no random()", () => {
    expect(fn).toMatch(/md5\(uid::text \|\| ':' \|\| today::text \|\| ':' \|\| p_spot::text\)/);
    expect(fn).not.toMatch(/random\(\)/);
  });
  it("a found egg: blotling only, kind found, only with a free nest and not too often, else food", () => {
    expect(fn).toMatch(/select \* into sp from public\.game_species where id = 'blotling'/);
    expect(fn).toMatch(/values \(uid, 'found', sp\.id/);
    expect(fn).not.toMatch(/leaflet/);
    expect(fn).toMatch(/exists \(select 1 from public\.eggs where owner = uid and hatched_at is null\)/);
    expect(fn).toMatch(/result = 'egg' and day > today - egg_gap/);
    expect(fn).toMatch(/pick := 'glyph'/);
    expect(fn.indexOf("pick := 'glyph'")).toBeLessThan(fn.indexOf("values (uid, 'found'"));
  });
  it("a brand-new account must have collected its starter egg", () => {
    expect(fn).toMatch(/collect your starter egg first/);
  });
  it("the finds table lists only the four kinds and the egg is the rarest", () => {
    const rows = [...sql.matchAll(/\('(ink|glyph|scrap|egg)', (\d+)\)/g)].map((m) => [m[1], Number(m[2])] as const);
    expect(rows.map((r) => r[0]).sort()).toEqual(["egg", "glyph", "ink", "scrap"]);
    const egg = rows.find((r) => r[0] === "egg")![1];
    for (const r of rows) if (r[0] !== "egg") expect(r[1]).toBeGreaterThan(egg);
  });
});
