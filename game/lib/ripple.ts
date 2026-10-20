// Pure helper for the pond's soft ripples. phase is 0..1 for one ripple's life.
export function ripple(phase: number, offset: number, reduced: boolean): { scale: number; opacity: number } {
  if (reduced) return { scale: 0.7 + offset * 0.3, opacity: 0.18 };
  const p = (((phase + offset) % 1) + 1) % 1;
  return { scale: 0.15 + p * 0.85, opacity: 0.35 * Math.sin(p * Math.PI) };
}
