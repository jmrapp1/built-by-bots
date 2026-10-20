// Pure growth rules. The database (migration 20261019000003) is the authority;
// these mirror it for display and tests. Values come from data/stages.json.
import stages from "@/data/stages.json";
import rules from "@/data/rules.json";

export type Stage = { id: string; name: string; minCare: number; minAgeSeconds: number; scale: number; partsShown: number; mark: string | null };
export const STAGES = stages as Stage[];

export function stageIndex(id: string): number {
  const i = STAGES.findIndex((s) => s.id === id);
  return i < 0 ? 0 : i;
}
export function stageById(id: string): Stage {
  return STAGES[stageIndex(id)];
}

// Seconds of away-time that count per check.
export function creditedSeconds(elapsed: number, cap: number = rules.catchupCapSeconds): number {
  return Math.min(Math.max(0, elapsed), cap);
}

// Which stage the rules give for this much care and age. Never lower than `from`.
export function stageFor(care: number, ageSeconds: number, from: string = STAGES[0].id): string {
  let i = stageIndex(from);
  while (i + 1 < STAGES.length && care >= STAGES[i + 1].minCare && ageSeconds >= STAGES[i + 1].minAgeSeconds) i++;
  return STAGES[i].id;
}

// 0..1 progress to the next stage: the slower of the care and age requirements. 1 for the last stage.
export function progressToNext(stage: string, care: number, ageSeconds: number): number {
  const i = stageIndex(stage);
  const next = STAGES[i + 1];
  if (!next) return 1;
  const cur = STAGES[i];
  const part = (v: number, from: number, to: number) => (to <= from ? 1 : Math.min(1, Math.max(0, (v - from) / (to - from))));
  return Math.min(part(care, cur.minCare, next.minCare), part(ageSeconds, cur.minAgeSeconds, next.minAgeSeconds));
}

export function stageChanged(before: string | null, after: string): boolean {
  return before !== null && before !== after;
}

// Scale pulse for a stage change: 0..1 progress in, a gentle bump out. Reduced motion gets no pulse.
export function growthPulse(progress: number, reduced: boolean): number {
  if (reduced || progress <= 0 || progress >= 1) return 1;
  return 1 + Math.sin(progress * Math.PI) * 0.18;
}
