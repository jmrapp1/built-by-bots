import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DAILY, activeIndex, dailyAvailable, dailyPrompt, friendlyDailyError, utcDay } from "@/lib/daily";
import species from "@/data/species.json";

const sql = readFileSync(new URL("../supabase/migrations/20261020000002_daily_egg.sql", import.meta.url), "utf8");
const code = sql.replace(/--.*$/gm, "");

describe("daily egg display rules", () => {
  it("shows the egg only if today's is unclaimed and nothing waits", () => {
    expect(dailyAvailable(null, "2026-10-20", false)).toBe(true);
    expect(dailyAvailable("2026-10-19", "2026-10-20", false)).toBe(true);
    expect(dailyAvailable("2026-10-20", "2026-10-20", false)).toBe(false);
    expect(dailyAvailable(null, "2026-10-20", true)).toBe(false);
  });
  it("uses the UTC day, including near midnight", () => {
    expect(utcDay(new Date("2026-10-20T23:59:59Z"))).toBe("2026-10-20");
    expect(utcDay(new Date("2026-10-21T00:00:00Z"))).toBe("2026-10-21");
    expect(utcDay(new Date("2026-10-20T23:30:00-05:00"))).toBe("2026-10-21");
  });
  it("prompts only when available", () => {
    expect(dailyPrompt(true)).toBe("Collect today's egg");
    expect(dailyPrompt(false)).toBeNull();
  });
  it("turns server errors into gentle sentences", () => {
    expect(friendlyDailyError("already claimed today")).toMatch(/Come back tomorrow/);
    expect(friendlyDailyError("hatch your egg first")).toMatch(/will wait/);
    expect(friendlyDailyError("boom: relation x")).toBe(DAILY.messages.error);
    for (const m of Object.values(DAILY.messages)) expect(m).not.toMatch(/\d/);
  });
  it("picks a valid Print to show", () => {
    expect(activeIndex(0, null)).toBe(0);
    expect(activeIndex(3, null)).toBe(2);
    expect(activeIndex(3, 9)).toBe(2);
    expect(activeIndex(3, -4)).toBe(0);
  });
});

describe("daily pool data matches the migration", () => {
  it("lists real species with the same weights", () => {
    for (const p of DAILY.pool) {
      expect(species.map((s) => s.id)).toContain(p.species);
      expect(sql).toContain(`('${p.species}', ${p.weight})`);
    }
  });
});

describe("migration safety", () => {
  it("is a new function, leaves claim_starter_egg alone, and refuses anonymous sessions", () => {
    expect(code).toContain("create function public.claim_daily_egg()");
    expect(code).not.toMatch(/claim_starter_egg/);
    expect(code).toContain("is_anonymous");
  });
  it("uses the server's UTC date only", () => {
    expect(code).toContain("(now() at time zone 'utc')::date");
    expect(code).not.toMatch(/p_\w+|current_date/);
  });
  it("is race-safe: locks the player's claim row before deciding", () => {
    expect(code).toMatch(/from public\.daily_egg_claims where owner = uid for update/);
    expect(code.indexOf("for update")).toBeLessThan(code.indexOf("insert into public.eggs"));
  });
  it("allows one waiting egg and one per day", () => {
    expect(code).toContain("hatched_at is null");
    expect(code).toContain("already claimed today");
    expect(code).toContain("hatch your egg first");
  });
  it("marks the day as used only after the egg is made", () => {
    expect(code.indexOf("insert into public.eggs")).toBeLessThan(code.indexOf("set claimed_on = today"));
  });
  it("drops only the old eggs_kind_check and nothing else", () => {
    const drops = code.match(/\bdrop\s+\w+(\s+\w+)*/gi) ?? [];
    expect(drops).toEqual(["drop constraint eggs_kind_check"]);
    expect(code).not.toMatch(/\btruncate\b|\bdelete\s+from\b/i);
  });
  it("only updates the player's own claim row", () => {
    expect(code.match(/\bupdate\s[^;]*;/gi)).toEqual(["update public.daily_egg_claims set claimed_on = today where owner = uid;"]);
  });
  it("grants select only on new tables, execute to authenticated only", () => {
    expect(code).toContain("revoke all on public.game_daily_pool, public.daily_egg_claims from anon, authenticated");
    expect(code).toContain("grant select on public.game_daily_pool, public.daily_egg_claims to authenticated");
    expect(code).toContain("revoke execute on function public.claim_daily_egg() from public, anon");
    expect(code).toContain("grant execute on function public.claim_daily_egg() to authenticated");
    expect(code).not.toMatch(/grant\s+(insert|update|delete|all)/i);
    expect(code).not.toMatch(/grant[^;]*\banon\b/i);
  });
  it("turns RLS on for both new tables with owner-only claims", () => {
    expect(code).toContain("alter table public.daily_egg_claims enable row level security");
    expect(code).toContain("alter table public.game_daily_pool enable row level security");
    expect(code).toContain("using (owner = auth.uid())");
  });
});
