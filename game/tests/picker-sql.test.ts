// Static checks on the keepsake picker migration (slice 6e-1). They read the SQL text; they cannot run it.
// The read-back checks to run after applying are in supabase/picker_readback.sql.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../supabase/migrations/", import.meta.url);
const file = "20261020000008_set_worn_cosmetic.sql";
const raw = readFileSync(new URL(file, dir), "utf8");
const sql = raw.replace(/--.*$/gm, "");
const fn = sql.slice(sql.indexOf("create function public.set_worn_cosmetic"));

describe("picker migration", () => {
  it("is the next number after the keepsakes-in-Margins migration", () => {
    const all = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    expect(all.indexOf(file)).toBeGreaterThan(0);
    expect(all[all.indexOf(file) - 1]).toBe("20261020000007_margins_keepsakes.sql");
  });
  it("is purely additive: one new function, nothing dropped, replaced, altered or deleted", () => {
    expect(sql).not.toMatch(/drop\s+|create or replace|alter table|alter column|\bdelete\s+from\b|\btruncate\b|create table|create policy|insert into/i);
    expect(sql.match(/create function/gi)?.length).toBe(1);
  });
  it("is a definer with an empty search path, signed-in only, no anonymous", () => {
    expect(fn).toMatch(/security definer set search_path = ''/);
    expect(fn).toMatch(/uid uuid := auth\.uid\(\)/);
    expect(fn).toMatch(/if uid is null then raise exception 'not signed in'/);
    expect(fn).toMatch(/is_anonymous/);
    expect(fn.match(/create function[^)]*\)/)![0]).toBe("create function public.set_worn_cosmetic(p_creature uuid, p_cosmetic text)");
  });
  it("the caller must own the Print, and the keepsake must be owned by the caller (or null)", () => {
    expect(fn).toMatch(/from public\.creatures c where c\.id = p_creature and c\.owner = uid for update/);
    expect(fn).toMatch(/if cid is null then raise exception 'no such Print'/);
    expect(fn).toMatch(/p_cosmetic is not null and not exists \(\s*select 1 from public\.owned_cosmetics o where o\.owner = uid and o\.cosmetic = p_cosmetic\s*\) then raise exception 'you do not have that keepsake'/);
  });
  it("sets worn_cosmetic on that one Print and nothing else, and returns the stored value", () => {
    const upd = fn.match(/update public\.creatures[^;]*;/g)!;
    expect(upd).toHaveLength(1);
    expect(upd[0]).toBe("update public.creatures c set worn_cosmetic = p_cosmetic where c.id = cid;");
    expect(fn).toMatch(/return query select p_cosmetic;/);
    expect(fn).not.toMatch(/owned_cosmetics[^;]*(insert|update|delete)/i);
  });
  it("is executable by authenticated only", () => {
    expect(sql).toMatch(/revoke execute on function public\.set_worn_cosmetic\(uuid, text\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.set_worn_cosmetic\(uuid, text\) to authenticated;/);
    expect(sql.match(/grant /gi)?.length).toBe(1);
  });
  it("leaves grant_keepsake and margins_unfold alone, and the decision is written down", () => {
    expect(sql).not.toMatch(/grant_keepsake|margins_unfold/);
    expect(raw).toMatch(/An explicit choice sticks/);
    expect(raw).toMatch(/null means "wear nothing", not "go back to automatic"/);
  });
  it("has a read-back script with a read-only part and a rolled-back write part", () => {
    const rb = readFileSync(new URL("../supabase/picker_readback.sql", import.meta.url), "utf8");
    expect(rb).toMatch(/set_worn_cosmetic/); expect(rb).toMatch(/rollback;/); expect(rb).toMatch(/Part A is read-only/);
  });
});
