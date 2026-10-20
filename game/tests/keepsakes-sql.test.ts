// Static checks on the keepsakes migration (slice 6d-2). They read the SQL text; they cannot run it.
// The read-back checks to run after applying are in supabase/keepsakes_readback.sql.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import cos from "@/data/cosmetics.json";

const raw = readFileSync(new URL("../supabase/migrations/20261020000006_keepsakes.sql", import.meta.url), "utf8");
const sql = raw.replace(/--.*$/gm, "");
const fn = sql.slice(sql.indexOf("create function public.grant_keepsake"));

describe("keepsakes migration", () => {
  it("is additive: no drops, deletes, truncates, and only creatures gets one new column", () => {
    expect(sql).not.toMatch(/drop\s+/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b|\btruncate\b/i);
    expect(sql.match(/alter table public\.creatures\s+add column/gi)?.length).toBe(1);
    expect(sql).toMatch(/add column worn_cosmetic text references public\.game_cosmetics \(id\)/);
    expect(sql).not.toMatch(/alter column|rename/i);
  });
  it("seeds exactly the cosmetic ids in data/cosmetics.json", () => {
    const seeded = [...sql.slice(sql.indexOf("insert into public.game_cosmetics"), sql.indexOf("create table public.owned")).matchAll(/\('([a-z_]+)',/g)].map((m) => m[1]);
    expect(seeded.sort()).toEqual(cos.cosmetics.map((c: { id: string }) => c.id).sort());
  });
  it("has RLS on, own-rows select only, no client writes", () => {
    expect(sql).toMatch(/alter table public\.owned_cosmetics enable row level security/);
    expect(sql).toMatch(/alter table public\.game_cosmetics enable row level security/);
    expect(sql).toMatch(/on public\.owned_cosmetics for select to authenticated using \(owner = \(select auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/revoke all on public\.game_cosmetics, public\.owned_cosmetics from anon, authenticated/);
    expect(sql).toMatch(/grant select on public\.game_cosmetics, public\.owned_cosmetics to authenticated/);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)/i);
    expect(sql).toMatch(/revoke insert \(worn_cosmetic\), update \(worn_cosmetic\) on public\.creatures from anon, authenticated/);
  });
  it("grant_keepsake is definer, empty search path, not client-callable, signed-in only inside, no client-named cosmetic", () => {
    expect(fn).toMatch(/security definer set search_path = ''/);
    expect(fn).toMatch(/uid uuid := auth\.uid\(\)/);
    expect(fn).toMatch(/is_anonymous/);
    expect(fn.match(/create function[^)]*\)/)![0]).toBe("create function public.grant_keepsake(kind text)");
    expect(sql).toMatch(/revoke execute on function public\.grant_keepsake\(text\) from public, anon, authenticated/);
    expect(sql).not.toMatch(/grant execute on function public\.grant_keepsake/);
    expect(fn).toMatch(/kind is distinct from 'margins' then raise exception/);
  });
  it("locks the Print row, and a duplicate gives food without a row", () => {
    expect(fn).toMatch(/from public\.creatures where owner = uid order by created_at, id limit 1 for update/);
    expect(fn).toMatch(/return query select null::text, true, 1/);
    expect(fn).toMatch(/update public\.creatures set worn_cosmetic = pick where id = cid/);
  });
});
