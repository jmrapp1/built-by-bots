// The sun's shadow box is small (36 m square), so it has to travel with the player or the shadows only exist near the origin.
export const SHADOW_SNAP = 1; // metres; the box moves in whole steps so the shadow edges do not crawl

export function sunFollow(offset: readonly [number, number, number], x: number, z: number, follow: boolean, dist = 0): { pos: [number, number, number]; target: [number, number, number] } {
  const cx = follow ? Math.round(x / SHADOW_SNAP) * SHADOW_SNAP : 0, cz = follow ? Math.round(z / SHADOW_SNAP) * SHADOW_SNAP : 0;
  const k = dist > 0 ? dist / (Math.hypot(offset[0], offset[1], offset[2]) || 1) : 1; // same direction, set distance
  return { pos: [cx + offset[0] * k, offset[1] * k, cz + offset[2] * k], target: [cx, 0, cz] };
}
