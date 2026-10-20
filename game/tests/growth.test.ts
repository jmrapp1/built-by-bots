import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { STAGES, creditedSeconds, growthPulse, progressToNext, stageById, stageChanged, stageFor, stageIndex } from "@/lib/growth";
import foods from "@/data/foods.json";
import rules from "@/data/rules.json";

const sql = readFileSync(new URL("../supabase/migrations/20261019000003_growth_stages.sql", import.meta.url), "utf8");

describe("stage data", () => {
  it("runs blot, sprout, full, elder with rising requirements", () => {
    expect(STAGES.map((s) => s.id)).toEqual(["blot", "sprout", "full", "elder"]);
    for (let i = 1; i < STAGES.length; i++) {
      expect(STAGES[i].minCare).toBeGreaterThan(STAGES[i - 1].minCare);
      expect(STAGES[i].minAgeSeconds).toBeGreaterThan(STAGES[i - 1].minAgeSeconds);
    }
    expect(STAGES[0].minCare).toBe(0);
  });
  it("matches the migration seed", () => {
    STAGES.forEach((s, i) => expect(sql).toContain(`('${s.id}', ${i}, ${s.minCare}, ${s.minAgeSeconds})`));
    expect(sql).toContain(`('catchup_cap_seconds', ${rules.catchupCapSeconds})`);
    for (const f of foods) expect(sql).toContain(`update public.game_foods set care = ${f.care} where id = '${f.id}'`);
  });
});

describe("stageFor", () => {
  it("needs both care and age", () => {
    expect(stageFor(100, 0)).toBe("blot");
    expect(stageFor(0, 999999)).toBe("blot");
    expect(stageFor(6, 600)).toBe("sprout");
    expect(stageFor(5, 600)).toBe("blot");
    expect(stageFor(6, 599)).toBe("blot");
  });
  it("can pass several stages at once", () => {
    expect(stageFor(60, 86400)).toBe("elder");
    expect(stageFor(20, 3600)).toBe("full");
  });
  it("never goes backwards", () => {
    expect(stageFor(0, 0, "full")).toBe("full");
    expect(stageFor(0, 0, "elder")).toBe("elder");
  });
});

describe("catch-up and progress", () => {
  it("caps away-time and ignores negative time", () => {
    expect(creditedSeconds(100)).toBe(100);
    expect(creditedSeconds(rules.catchupCapSeconds * 10)).toBe(rules.catchupCapSeconds);
    expect(creditedSeconds(-50)).toBe(0);
  });
  it("progress is between 0 and 1 and uses the slower requirement", () => {
    expect(progressToNext("blot", 0, 0)).toBe(0);
    expect(progressToNext("blot", 3, 600)).toBeCloseTo(0.5);
    expect(progressToNext("blot", 6, 300)).toBeCloseTo(0.5);
    expect(progressToNext("elder", 0, 0)).toBe(1);
    for (const s of STAGES) expect(progressToNext(s.id, 1e9, 1e9)).toBeLessThanOrEqual(1);
  });
  it("detects a stage change only after one is known", () => {
    expect(stageChanged(null, "blot")).toBe(false);
    expect(stageChanged("blot", "blot")).toBe(false);
    expect(stageChanged("blot", "sprout")).toBe(true);
    expect(stageIndex("nonsense")).toBe(0);
    expect(stageById("elder").name).toBe("Elder");
  });
});

describe("migration safety", () => {
  it("is select-only for players and keeps RLS on", () => {
    expect(sql).toContain("alter table public.game_stages enable row level security");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
    expect(sql).not.toMatch(/grant[^;]*to[^;]*\banon\b/i);
  });
  it("never drops or truncates", () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|policy)|\btruncate\b|\bdelete\s+from\b/i);
  });
  it("hides the internal grow helper and refuses anonymous sessions", () => {
    expect(sql).toContain("revoke execute on function public.grow_creature_row(uuid) from public, anon, authenticated");
    expect(sql.match(/is_anonymous/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it("uses the server clock only", () => {
    expect(sql).toContain("now()");
    expect(sql).not.toMatch(/p_(time|now|age|stage|care)/i);
  });
});

describe("growth animation", () => {
  it("bumps gently and returns to normal size", () => {
    expect(growthPulse(0, false)).toBe(1);
    expect(growthPulse(1, false)).toBe(1);
    expect(growthPulse(0.5, false)).toBeGreaterThan(1);
    expect(growthPulse(0.5, false)).toBeLessThan(1.25);
  });
  it("does nothing for reduced motion", () => {
    for (let p = 0; p <= 1; p += 0.1) expect(growthPulse(p, true)).toBe(1);
  });
  it("gives each stage a distinct look", () => {
    const looks = STAGES.map((s) => `${s.scale}|${s.partsShown}|${s.mark}`);
    expect(new Set(looks).size).toBe(STAGES.length);
  });
});
