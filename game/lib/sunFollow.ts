// The sun's shadow box is small (36 m square), so it has to travel with the player or the shadows only exist near the origin.
export const SHADOW_SNAP = 1; // metres; the box moves in whole steps so the shadow edges do not crawl

export function sunFollow(offset: readonly [number, number, number], x: number, z: number, follow: boolean): { pos: [number, number, number]; target: [number, number, number] } {
  const cx = follow ? Math.round(x / SHADOW_SNAP) * SHADOW_SNAP : 0, cz = follow ? Math.round(z / SHADOW_SNAP) * SHADOW_SNAP : 0;
  return { pos: [cx + offset[0], offset[1], cz + offset[2]], target: [cx, 0, cz] };
}
