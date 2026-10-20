// H2: the Home room, as pure functions: its size, walls, door frames, walk-through paths and the dev-only start. No three.js.
import home from "@/data/home.json";
import type { Box, Circle, Colliders, Vec } from "./world";

export const HOME_ROOM = home;
export const ROOM_OFF = home.offset; // the room sits this far along x from the garden; positions inside are local
export type DoorSide = "garden" | "room";
const dot = (a: Vec, b: Vec) => a.x * b.x + a.z * b.z;
const WALK_IN: Vec = { x: home.door.walkIn[0], z: home.door.walkIn[1] }; // in the garden: the way you walk through the door
const ROOM_IN: Vec = { x: 0, z: -1 }; // in the room: the way you walk after arriving (north, away from the door)

/** g is the middle of the opening and d the direction you walk through it. */
export function doorFrame(side: DoorSide): { g: Vec; d: Vec } {
  return side === "garden"
    ? { g: { x: home.door.garden.x, z: home.door.garden.z }, d: WALK_IN }
    : { g: { x: 0, z: home.room.depth / 2 }, d: { x: -ROOM_IN.x, z: -ROOM_IN.z } };
}
export function inDoorZone(p: Vec, side: DoorSide): boolean {
  const { g, d } = doorFrame(side), rel = { x: p.x - g.x, z: p.z - g.z };
  const axial = dot(rel, d), lateral = Math.abs(rel.x * d.z - rel.z * d.x);
  return axial >= -home.door.zoneBack && axial <= home.door.zoneFront && lateral <= home.door.zoneLateral;
}
export function doorPosts(side: DoorSide): Circle[] {
  const { g, d } = doorFrame(side), s = home.door.postOffset;
  return [1, -1].map((k) => ({ x: g.x + -d.z * s * k, z: g.z + d.x * s * k, r: home.door.postR }));
}
/** The walk through a door: a point on the near side if needed, then well beyond it. */
export function doorPath(p: Vec, side: DoorSide): Vec[] {
  const { g, d } = doorFrame(side), D = home.door;
  const A = { x: g.x - d.x * D.approach, z: g.z - d.z * D.approach }, B = { x: g.x + d.x * D.threshold, z: g.z + d.z * D.threshold };
  return dot({ x: p.x - g.x, z: p.z - g.z }, d) > -0.5 ? [p, B] : [p, A, B];
}
/** Where you appear after the wipe and how you walk on (local coordinates of the zone you arrive in). */
export function doorArrival(into: "home" | "garden"): Vec[] {
  const dir = into === "home" ? ROOM_IN : { x: -WALK_IN.x, z: -WALK_IN.z }; // coming out of the door you walk the other way
  const { g } = doorFrame(into === "home" ? "room" : "garden"), s = home.door.emerge, a = home.door.arrive;
  const start = { x: g.x - dir.x * s, z: g.z - dir.z * s };
  return [start, { x: start.x + dir.x * a, z: start.z + dir.z * a }];
}
export const doorYaw = (into: "home" | "garden"): number => {
  const dir = into === "home" ? ROOM_IN : { x: -WALK_IN.x, z: -WALK_IN.z };
  return Math.atan2(-dir.x, -dir.z); // the camera looks along the way you are walking
};

/** The four walls as boxes (a gap for the door on the south wall), just outside the walkable floor. */
export function roomColliders(): Colliders {
  const { width: w, depth: d, wallThickness: t } = home.room, gap = home.door.postOffset;
  const boxes: Box[] = [
    { x: 0, z: -d / 2 - t / 2, w: w + 2 * t, d: t },
    { x: -w / 2 - t / 2, z: 0, w: t, d: d },
    { x: w / 2 + t / 2, z: 0, w: t, d: d },
    { x: (-w / 2 - gap) / 2 - 0, z: d / 2 + t / 2, w: w / 2 - gap, d: t },
    { x: (w / 2 + gap) / 2, z: d / 2 + t / 2, w: w / 2 - gap, d: t },
  ];
  return { circles: [], boxes };
}
export const insideRoom = (p: Vec, margin = 0): boolean => Math.abs(p.x) <= home.room.width / 2 - margin && Math.abs(p.z) <= home.room.depth / 2 - margin;

// ?area=home : a dev-only start inside the room. Ignored in production.
export const homeOverride = (search: string, isProduction: boolean): boolean => !isProduction && new URLSearchParams(search).get("area") === "home";
