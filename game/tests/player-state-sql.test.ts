// Static checks on the player/Print state migration (S36 step 1). They read the SQL text; they cannot run it.
// The signed-in checks to run after applying are in supabase/player_state_readback.sql.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = new URL("../supabase/migrations/", import.meta.url);
const NAME = "20261023000001_player_state.sql";
const raw = readFileSync(new URL(NAME, dir), "utf8");
const sql = raw.replace(/--.*$/gm, "");
const fn = sql.slice(sql.indexOf("create function public.save_state"), sql.indexOf("revoke execute on function public.save_state"));
const read = readFileSync(new URL("../supabase/player_state_readback.sql", import.meta.url), "utf8");

describe("player state migration: shape", () => {
  it("says it is additive and not applied", () => {
    expect(raw).toMatch(/Purely additive/);
    expect(raw).toMatch(/NOT applied/);
  });
  it("creates exactly two tables and one function, and drops/alters/changes nothing existing", () => {
    expect([...sql.matchAll(/create\s+table\s+([\w.]+)/gi)].map((m) => m[1])).toEqual(["public.player_state", "public.print_state"]);
    expect([...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)/gi)].map((m) => m[1])).toEqual(["public.save_state"]);
    expect(sql).not.toMatch(/\bdrop\b|\btruncate\b|\bdelete\s+from\b|\bcreate\s+or\s+replace\b/i);
    expect(sql).not.toMatch(/alter\s+table\s+(?!public\.(player_state|print_state)\b)/i);
    expect(sql).not.toMatch(/\bupdate\s+public\./i);
  });
  it("follows the previous migration in name order", () => {
    const names = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    const i = names.indexOf(NAME);
    expect(i).toBeGreaterThan(0);
    expect(names[i - 1]).toBe("20261022000002_reading_room_spots.sql");
    expect(i).toBe(names.length - 1);
  });
  it("player_state: one row per account, cascade, the four zones, checked numbers", () => {
    expect(sql).toMatch(/owner uuid primary key references auth\.users \(id\) on delete cascade/);
    expect(sql).toMatch(/zone text not null check \(zone in \('garden', 'margins', 'home', 'reading'\)\)/);
    for (const c of ["x", "z"]) expect(sql).toContain(`${c} double precision not null check (${c} = ${c} and abs(${c}) <= 140)`);
    for (const c of ["heading", "yaw"]) expect(sql).toContain(`${c} double precision not null check (${c} = ${c} and abs(${c}) <= 32)`);
  });
  it("print_state: keyed by creature, cascade from creatures and users, mode checked", () => {
    expect(sql).toMatch(/creature_id uuid primary key references public\.creatures \(id\) on delete cascade/);
    expect(sql).toMatch(/owner uuid not null references auth\.users \(id\) on delete cascade/);
    expect(sql).toMatch(/mode text not null check \(mode in \('rest', 'wander'\)\)/);
  });
});

describe("player state migration: clients can only read their own rows", () => {
  it("RLS is on for both tables, with a select-own policy each and no other policy", () => {
    for (const t of ["player_state", "print_state"]) {
      expect(sql).toMatch(new RegExp(`alter table public\\.${t} enable row level security`));
      expect(sql).toMatch(new RegExp(`create policy ${t}_select_own on public\\.${t} for select to authenticated using \\(owner = \\(select auth\\.uid\\(\\)\\)\\)`));
    }
    expect([...sql.matchAll(/create\s+policy/gi)].length).toBe(2);
  });
  it("revokes everything, then grants select only", () => {
    for (const t of ["player_state", "print_state"]) {
      expect(sql).toMatch(new RegExp(`revoke all on public\\.${t} from anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant select on public\\.${t} to authenticated`));
    }
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)/i);
    expect(sql).not.toMatch(/\bto\s+(anon|public)\b/i);
  });
});

describe("player state migration: save_state", () => {
  it("has the spec signature and returns text", () => {
    expect(fn).toMatch(/^create function public\.save_state\(p_zone text, p_x float8, p_z float8, p_heading float8, p_yaw float8, p_prints jsonb\)\s+returns text/);
  });
  it("is security definer with an empty search_path", () => {
    expect(fn).toMatch(/security definer set search_path = ''/);
  });
  it("refuses signed-out and anonymous callers before anything else", () => {
    const a = fn.indexOf("v_uid uuid := auth.uid()");
    expect(a).toBeGreaterThan(0);
    expect(fn).toMatch(/if v_uid is null then raise exception 'not signed in'/);
    expect(fn).toMatch(/is_anonymous/);
    expect(fn.indexOf("is_anonymous")).toBeLessThan(fn.indexOf("p_zone is null"));
  });
  it("takes the owner from auth.uid(); no owner parameter; every write uses v_uid", () => {
    expect(fn).not.toMatch(/p_owner|p_uid|p_creature/);
    expect(fn).toMatch(/values \(v_uid, p_zone/);
    expect(fn).toMatch(/values \(v_id, v_uid,/);
  });
  it("checks zone, finite and bounds for the player fields", () => {
    expect(fn).toMatch(/p_zone not in \('garden', 'margins', 'home', 'reading'\)/);
    expect(fn).toMatch(/p_x = p_x and abs\(p_x\) <= v_bound and p_z = p_z and abs\(p_z\) <= v_bound/);
    expect(fn).toMatch(/p_heading = p_heading and abs\(p_heading\) <= v_turns and p_yaw = p_yaw and abs\(p_yaw\) <= v_turns/);
    expect(fn).toContain("v_bound constant float8 := 140");
  });
  it("validates the Prints array: array type, at most 24, object shape, finite, bounds, mode", () => {
    expect(fn).toContain("v_max_prints constant int := 24");
    expect(fn).toMatch(/jsonb_typeof\(p_prints\) <> 'array'/);
    expect(fn).toMatch(/jsonb_array_length\(p_prints\) > v_max_prints/);
    expect(fn).toMatch(/v_pm not in \('rest', 'wander'\)/);
    expect(fn).toMatch(/v_px = v_px and abs\(v_px\) <= v_bound and v_pz = v_pz and abs\(v_pz\) <= v_bound and v_ph = v_ph and abs\(v_ph\) <= v_turns/);
    expect(fn).toMatch(/jsonb_typeof\(v_el -> 'x'\) <> 'number'/);
  });
  it("validates everything before the first write (no partial save)", () => {
    const firstWrite = fn.indexOf("insert into");
    for (const k of ["p_zone not in", "jsonb_array_length", "v_pm not in", "'skipped'"]) expect(fn.indexOf(k)).toBeLessThan(firstWrite);
  });
  it("has a server flood guard of 5 seconds that returns 'skipped' and writes nothing", () => {
    expect(fn).toContain("v_min_gap constant interval := interval '5 seconds'");
    expect(fn).toMatch(/select s\.updated_at into v_last from public\.player_state s where s\.owner = v_uid/);
    expect(fn).toMatch(/if v_last is not null and clock_timestamp\(\) - v_last < v_min_gap then return 'skipped'; end if;/);
  });
  it("serialises one account's saves so two calls cannot both pass the guard", () => {
    expect(fn).toMatch(/pg_advisory_xact_lock\(hashtextextended\('player_state:' \|\| v_uid::text, 0\)\)/);
    expect(fn.indexOf("pg_advisory_xact_lock")).toBeLessThan(fn.indexOf("select s.updated_at"));
  });
  it("writes a Print only when the caller owns that creature; others are skipped, not raised", () => {
    expect(fn).toMatch(/if exists \(select 1 from public\.creatures c where c\.id = v_id and c\.owner = v_uid\) then/);
    const loop = fn.slice(fn.indexOf("for v_el in select e from jsonb_array_elements(p_prints) as t(e) loop", fn.indexOf("insert into public.player_state")));
    expect(loop.indexOf("exists (select 1 from public.creatures")).toBeLessThan(loop.indexOf("insert into public.print_state"));
    expect(loop).not.toMatch(/raise exception/);
  });
  it("upserts in place by primary key (no history, no deletes), naming the constraint to avoid ambiguity", () => {
    expect(fn).toMatch(/on conflict on constraint player_state_pkey do update/);
    expect(fn).toMatch(/on conflict on constraint print_state_pkey do update/);
    expect(fn).not.toMatch(/\bdelete\b/i);
  });
  it("on conflict never changes owner or creature", () => {
    const sets = [...fn.matchAll(/do update\s+set ([^;]*);/g)].map((m) => m[1]);
    expect(sets.length).toBe(2);
    for (const s of sets) expect(s).not.toMatch(/\bowner\b|creature_id/);
  });
  it("returns only 'saved' or 'skipped'; no other data is returned", () => {
    expect([...fn.matchAll(/return\s+'(\w+)'/g)].map((m) => m[1])).toEqual(["skipped", "saved"]);
    expect(fn).not.toMatch(/returns (table|setof)|return query/i);
  });
  it("execute is for signed-in accounts only", () => {
    const sig = "public\\.save_state\\(text, float8, float8, float8, float8, jsonb\\)";
    expect(sql).toMatch(new RegExp(`revoke execute on function ${sig} from public, anon;`));
    expect(sql).toMatch(new RegExp(`grant execute on function ${sig} to authenticated;`));
    expect(sql).not.toMatch(/grant execute[^;]*\bto (anon|public)\b/i);
  });
  it("uses no randomness and does not touch the care economy or eggs", () => {
    expect(fn).not.toMatch(/random\(\)/);
    expect(sql).not.toMatch(/claim_daily_egg|feed_creature|grant_keepsake|margins_claims/i);
  });
});

describe("the read-back script", () => {
  it("has a read-only part and a clearly marked write part inside a rolled-back transaction", () => {
    expect(read).toMatch(/Part A: read-only/);
    expect(read).toMatch(/Part B: WRITES/);
    expect(read).toMatch(/-- begin;/);
    expect(read).toMatch(/-- rollback;/);
  });
  it("covers save, the flood guard, direct writes, another player's Print, bad input and anon", () => {
    for (const k of ["B1.", "B2. The flood guard", "B3. No direct writes", "B4. Another player's Print", "B5. Bad input", "B6. As anon"]) expect(read).toContain(k);
  });
  it("the executable lines of Part A only select", () => {
    const a = read.slice(read.indexOf("Part A"), read.indexOf("Part B")).replace(/--.*$/gm, "");
    expect(a).not.toMatch(/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i);
  });
});
