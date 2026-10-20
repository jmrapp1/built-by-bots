"use client";
import { createZoneController } from "@/lib/zones";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCreature, buildEgg, type Genes } from "@/lib/creature";
import {
  GARDEN, HOME, cameraDistance, colliders, hoverY, movePlayer, nearestPlace, newWander, printInReach, stepWander, type Place, type Vec, type Wander,
} from "@/lib/world";
import { ripple } from "@/lib/ripple";
import { growthPulse, stageById } from "@/lib/growth";
import { PLAY, feedPose, feedPuffs, holdDone, holdProgress, strokePose, strokePuffs, type Puff } from "@/lib/play";
import { FORAGE, dropOffset, inReach, shimmer, sinceReady, spotReady } from "@/lib/forage";
import { NIGHT, fireflyAnchors, fireflyAt, fireflyLevel, mixPose, routeTo, sleepPhase, sleepPose, stretchPose, swirlPuffs, walkRoute } from "@/lib/night";
import { STANDING, canWalk, lerpPos, sitAdvance, sitFrame, sitToggle, sitWalkKey, SIT, type SitState } from "@/lib/sit";
import {
  POND, PONDIDLE, answerTo, arrived, bigSplashLanded, canPlayerSplash, canStartVisit, dropsAt, edgeNear, firstVisitDelay, maxDrops, nextVisitDelay, overrideState,
  phaseSeconds, playerGestureSeconds, playerLean, playerSplashLanded, pondAdvance, pondBusy, pondOverride, pondPose, pondStart, retryDelay,
  ringAt, ringCount, ringDelay, shorePoint, splashLife, splashSpot, tapsBetween, towardPond, type PondState, type Splash,
} from "@/lib/pond";
import {
  HIDE, HIDEIDLE, canFind, canStartGame, firstGameDelay, hideAdvance, hideAnchor, hideArrived, hideBusy, hideCancel, hideFound, hideOverride, hidePose, hidePuffs,
  hideStart, nextGameDelay, pickSpot, previewSpot, retryDelay as hideRetry, spotBehind, withSpot, type HideState,
} from "@/lib/hide";
import { hourOfDay, hourOverride, lightingAt } from "@/lib/daynight";
import {
  MARGINS, along, arrivalPath, arrivalYaw, buildField, gateFrame, gatePath, generateLayout, heightAt, holdStep, homePoint, glintOpacity, homePath, inGateZone, marginsOverrides, nearestSpot,
  pathLength, pointAlong, spotsForDay, spotsLeft, travelFrame, unfoldSeconds, utcDay, wipeOffset, type Field, type Layout, type Spot,
} from "@/lib/margins";
import { FOUND_EGG, QUIET, afterClaimsRead, foodOf, isLocalPreview, settleUnfold, unfoldView, type Outcome, type Shown } from "@/lib/margins-server";
import { COSMETIC_IDS, cosmeticOverride, cycleAt, lanternGlow, putOnFrame, putOnSeconds } from "@/lib/cosmetics";
import { buildCosmetic, disposeCosmetic, poseCosmetic } from "@/lib/cosmeticsBuild";
import { WORLD, atOverride } from "@/lib/worldMap";
import { HOME_ROOM, ROOM_OFF, doorArrival, doorPath, doorPosts, doorYaw, homeOverride, inDoorZone, roomColliders } from "@/lib/home";
import { buildGardenDoor, buildHomeScene, type HomeScene } from "@/components/homeScene";
import { buildWorldShell, type WorldShell } from "@/components/worldShell";
import { OFF, buildGate, buildMarginsScene, type MarginsScene } from "@/components/marginsScene";

export type EggPhase = "none" | "unclaimed" | "in-nest" | "daily";
type Props = {
  genes: Genes | null;
  species?: string;
  stage?: string;
  eggPhase: EggPhase;
  onNearby: (place: Place | null) => void;
  onInteract: (place: Place) => void;
  onPrintNear: (near: boolean) => void;
  onFindable?: (found: boolean) => void; // the Print is hiding and within reach: E means "found"
  onCanSplash?: (ok: boolean) => void; // the pond can be splashed (day only)
  onFeedPrint: () => void; // the hold finished: ask the server to feed
  fedTick?: number; // goes up each time a feed succeeded, to start the Print's reaction
  onGather?: (kind: string) => "ok" | "full"; // the page owns the pouch; the world only reports a walk-over
  onMargins?: (s: { inside: boolean; left: number; total: number; scraps: number }) => void; // the Margins row and scrap count
  canGather?: (kind: string) => boolean; // there is room in the pouch for a find
  onUnfold?: (spot: number, layoutDay: string) => Promise<Outcome>; // ask the server what is inside a page (it decides, not the client)
  onLoadOpened?: (day: string) => Promise<number[] | null>; // pages this player already opened today, from the server
  onMarginsNote?: (text: string) => void;
  onKeepsake?: (id: string) => void; // the server gave a keepsake: the page sets it as worn // a quiet line for a refusal or a found egg
  worn?: string | null; // the keepsake worn (6d-3 will pass the server's answer; nothing sends it yet)
  canOffer?: boolean; // something is in the pouch
  locked?: boolean; // a feed is in flight, or a panel is open: no new hold or stroke
};


function paperTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f4ecd6";
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = "rgba(120,140,170,0.35)";
  g.lineWidth = 2;
  for (let y = 32; y < 512; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.strokeStyle = "rgba(200,120,120,0.25)";
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(HOME.size / 8, HOME.size / 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const mat = (color: number | string) => new THREE.MeshToonMaterial({ color });

function buildTree(r: number) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.35, r * 0.5, 2.6, 8), mat("#2a2438"));
  trunk.position.y = 1.3;
  g.add(trunk);
  const leaf = mat("#6f9a6a");
  for (const [y, s] of [[3.0, 1.5], [3.9, 1.1], [4.6, 0.7]] as const) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(s * r * 1.5, 1.6, 7), leaf);
    cone.position.y = y;
    g.add(cone);
  }
  return g;
}

// Pond ripples are animated from the render loop; buildPlace registers them here.
const ripples: { mesh: THREE.Mesh; offset: number }[] = [];

function buildPlace(p: Place): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const paper = mat("#fffaf0"), ink = mat("#1b1b2a"), stone = mat("#b9b3a6");
  switch (p.kind) {
    case "gate": {
      g.add(buildGate(gateFrame("garden").d));
      break;
    }
    case "egg": {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.5, 20), stone);
      plinth.position.y = 0.25;
      const page = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.04, 0.8), paper);
      page.position.y = 0.52;
      g.add(plinth, page);
      break;
    }
    case "nest": {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 8, 24), mat("#e6d8b4"));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.18;
      g.add(ring);
      break;
    }
    case "scenery": {
      const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.7, 20), mat("#8a6b4a"));
      table.position.y = 0.35;
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.25, 0.4, 16), ink);
      well.position.y = 0.9;
      g.add(table, well);
      break;
    }
    case "rest": {
      // An ink-blot bench with a soft cushion and a little pillow.
      const blot = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 12), mat("#2f2a44"));
      blot.scale.set(1.5, 0.3, 1);
      blot.position.y = 0.3;
      const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 12), mat("#e8b9a0"));
      cushion.scale.set(1.3, 0.28, 0.85);
      cushion.position.y = 0.62;
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4), mat("#fffaf0"));
      pillow.position.set(-0.7, 0.82, 0);
      pillow.rotation.set(0, 0.4, 0.25);
      g.add(blot, cushion, pillow);
      break;
    }
    case "pond": {
      const r = p.solid ?? 3;
      const bank = new THREE.Mesh(new THREE.RingGeometry(r - 0.05, r + 0.35, 40), mat("#b9b3a6"));
      bank.rotation.x = -Math.PI / 2;
      bank.position.y = 0.015;
      const pond = new THREE.Mesh(
        new THREE.CircleGeometry(r, 40),
        // The pond writes the stencil so splash rings are cut off at the water's edge.
        new THREE.MeshStandardMaterial({ color: 0x2a3a66, roughness: 0.15, metalness: 0.4, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp }),
      );
      pond.rotation.x = -Math.PI / 2;
      pond.position.y = 0.02;
      g.add(bank, pond);
      // Soft ripples: three thin rings that grow and fade (still when reduced motion is on).
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(
          new THREE.RingGeometry(r * 0.9, r * 0.95, 40),
          new THREE.MeshBasicMaterial({ color: 0xcfd9f2, transparent: true, opacity: 0.2, depthWrite: false }),
        );
        m.rotation.x = -Math.PI / 2;
        m.position.set(0, 0.03, 0);
        g.add(m);
        ripples.push({ mesh: m, offset: i / 3 });
      }
      // A few lily pages, one instanced mesh.
      const spots: [number, number, number][] = [[0.9, -0.5, 0.45], [-1.1, 0.4, 0.38], [0.2, 1.1, 0.42], [-0.3, -1.2, 0.34]];
      const lily = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), mat("#6f9a6a"), spots.length);
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      spots.forEach(([x, z, sc], i) => { m4.compose(new THREE.Vector3(x, 0.045, z), q, new THREE.Vector3(sc, sc, sc)); lily.setMatrixAt(i, m4); });
      g.add(lily);
      break;
    }
    case "notice": {
      for (const x of [-0.7, 0.7]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2, 0.12), mat("#5a4632"));
        post.position.set(x, 1, 0);
        g.add(post);
      }
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.08), paper);
      board.position.y = 1.7;
      g.add(board);
      break;
    }
  }
  return g;
}

function buildPlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 6, 12), mat("#2f2a44"));
  body.position.y = 0.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat("#f1e6cf"));
  head.position.y = 1.05;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 12), mat("#2f2a44"));
  hat.position.y = 1.3;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat("#1b1b2a"));
  nose.position.set(0, 1.05, 0.2);
  g.add(body, head, hat, nose);
  return g;
}

export default function World({ genes, species = "blotling", stage = "blot", eggPhase, onNearby, onInteract, onPrintNear, onFeedPrint, onFindable, onCanSplash, fedTick = 0, locked = false, onGather, onMargins, canGather, onUnfold, onLoadOpened, onMarginsNote, onKeepsake, worn = null, canOffer = true }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const cb = useRef({ onNearby, onInteract, onPrintNear, onFeedPrint, onGather, onFindable, onCanSplash, onMargins, canGather, onUnfold, onLoadOpened, onMarginsNote, onKeepsake });
  cb.current = { onNearby, onInteract, onPrintNear, onFeedPrint, onGather, onFindable, onCanSplash, onMargins, canGather, onUnfold, onLoadOpened, onMarginsNote, onKeepsake };
  // Latest props for the render loop, which is created once.
  const live = useRef({ genes, eggPhase, stage, species, locked, canOffer, worn });
  live.current = { genes, eggPhase, stage, species, locked, canOffer, worn };
  // When the server accepts a feed the Print reacts. The loop reads this time stamp.
  const reactAt = useRef(-1);
  const seenTick = useRef(fedTick);
  useEffect(() => {
    if (fedTick !== seenTick.current) { seenTick.current = fedTick; reactAt.current = performance.now(); }
  }, [fedTick]);
  const rebuild = useRef<() => void>(() => {});
  useEffect(() => { rebuild.current(); }, [genes, eggPhase, stage, species]);

  useEffect(() => {
    const el = mount.current!;
    const cols = colliders();
    cols.circles.push(...doorPosts("garden")); // the posts of the Home door (the Print goes round them like any prop)
    const scene = new THREE.Scene();
    // Light follows the player's local clock (data/daynight.json); ?hour=21 previews a time of day.
    const override = hourOverride(window.location.search);
    const L0 = lightingAt(override ?? hourOfDay(new Date()));
    scene.background = new THREE.Color(L0.sky);
    scene.fog = new THREE.Fog(L0.fog, WORLD.fog[0], WORLD.fog[1]);
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, WORLD.cameraFar);
    const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(L0.hemisphereSky, L0.hemisphereGround, L0.hemisphereIntensity);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(L0.sun, L0.sunIntensity);
    sun.position.set(...L0.sunPosition);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HOME.size, HOME.size),
      new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // soft page edge
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(HOME.size * 0.5, HOME.size * 2, 4, 1, Math.PI / 4, Math.PI * 2),
      new THREE.MeshBasicMaterial({ color: L0.sky }),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = -0.05;
    scene.add(edge);

    for (const t of GARDEN.trees) { const m = buildTree(t.r); m.position.set(t.x, 0, t.z); scene.add(m); }
    for (const h of GARDEN.hedges) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(h.w, 1.1, h.d), mat("#86ad7a"));
      m.position.set(h.x, 0.55, h.z);
      scene.add(m);
    }
    for (const p of GARDEN.places) scene.add(buildPlace(p));

    const player = buildPlayer();
    scene.add(player);
    player.rotation.y = Math.PI; // start facing away from the camera
    let pos = { x: GARDEN.player.start[0], z: GARDEN.player.start[1] };
    let yaw = 0;
    let pitch = GARDEN.camera.pitch;
    let camPos = new THREE.Vector3();
    let camInit = false;

    // --- The Margins (slice 6a): a second area, far along x, shown by moving the player and camera there. ---
    const mo = marginsOverrides(window.location.search, process.env.NODE_ENV === "production");
    let mg: MarginsScene | null = null, mLayout: Layout | null = null, mField: Field | null = null, mSpots: Spot[] = [];
    let mDay = "";
    const keepsakePages = new Set<number>(); // pages whose find is drawn as a scrap but is a keepsake: not counted as a scrap
    const heldByDay = new Map<string, Map<number, Shown>>(); // food the server gave while the pouch was full: kept until there is room (this visit only)
    const openedByDay = new Map<string, Set<number>>(); // this visit only: nothing is saved or sent
    let opened = new Set<number>();
    let scraps = 0;
    let mActive: { id: number; since: number } | null = null; // the page that is opening, and when it began (ms)
    let uHold = 0, uSpot: Spot | null = null;
    const local = isLocalPreview(mo); // dev previews of other days, all pages or the nearest page never touch the server
    let serverReady = local, readFailed = false, downNoted = false, uPending = false, quietUntilNext = false, visit = 0;
    let travel: null | { into: "margins" | "garden" | "home"; from: "garden" | "margins" | "home"; start: number; walk: { x: number; z: number }[]; arrive: { x: number; z: number }[]; swapped: boolean } = null;
    let mCols = colliders();
    let reportKey = "";
    let uBlocked = false;
    let trailKey = "";
    let trailPath: { x: number; z: number }[] = [];
    const report = () => {
      const k = `${zones.is("margins")}|${mSpots.length}|${opened.size}|${scraps}`;
      if (k === reportKey) return;
      reportKey = k;
      cb.current.onMargins?.({ inside: zones.is("margins"), left: spotsLeft(mSpots, opened), total: mSpots.length, scraps });
    };
    const wipe = document.createElement("div");
    wipe.className = "page-wipe";
    wipe.style.display = "none";
    el.appendChild(wipe);
    const enterMarginsZone = () => {
      if (!mLayout || !mField) { mLayout = generateLayout(); mField = buildField(mLayout.cols); mCols = mLayout.cols; }
      mg = buildMarginsScene(mLayout);
      scene.add(mg.group);
      mDay = mo.day ?? utcDay(new Date()); // the day is fixed for the whole visit
      mSpots = spotsForDay(mDay, mLayout, mField);
      opened = openedByDay.get(mDay) ?? new Set<number>();
      openedByDay.set(mDay, opened);
      mg.setSpots(mSpots, opened);
      mActive = null; uHold = 0; uSpot = null; uPending = false; quietUntilNext = false;
      const myVisit = ++visit;
      serverReady = local; readFailed = false; downNoted = false;
      if (!local) {
        // What this player already opened today comes from the server, so a reload cannot reroll a page.
        const askDay = mDay;
        Promise.resolve(cb.current.onLoadOpened ? cb.current.onLoadOpened(askDay) : null).catch(() => null).then((rows) => {
          if (myVisit !== visit || !zones.is("margins")) return;
          const r = afterClaimsRead(rows); // a failed read keeps the ring from running; the next entry reads again
          for (const n of r.opened) opened.add(n);
          serverReady = r.ready; readFailed = !r.ready;
          if (readFailed) downNoted = true; // the line is shown now; holding E at a page shows it again
          if (r.note) cb.current.onMarginsNote?.(r.note);
          report();
        });
      }
      (scene.fog as THREE.Fog).near = MARGINS.fog[0]; (scene.fog as THREE.Fog).far = MARGINS.fog[1];
      lightClock = 0;
      report();
    };
    const leaveMarginsZone = () => {
      if (mg) { scene.remove(mg.group); mg.dispose(); mg = null; } // freed on every leave: no growing memory
      if (cosFoundAway) { cosFoundAway = false; cosHold = performance.now() + 900; cosPlayUntil = performance.now() + 4500; } // plays once, after the page-turn has cleared
      mSpots = []; mActive = null; uHold = 0; uSpot = null; uPending = false; visit++; // a call still in flight is settled when its answer arrives (see below)
    };
    // W2: the World round the garden belongs to the garden zone: built on entering it, freed on leaving it.
    let shell: WorldShell | null = null;
    let gdoor: HomeScene | null = null;
    const showShell = () => { if (!gdoor) { gdoor = buildGardenDoor(); scene.add(gdoor.group); } if (!shell) { shell = buildWorldShell(scene); shell.update(pos.x, pos.z, true); shell.setSky((scene.background as THREE.Color)); } };
    const enterGardenZone = () => { showShell(); (scene.fog as THREE.Fog).near = WORLD.fog[0]; (scene.fog as THREE.Fog).far = WORLD.fog[1]; lightClock = 0; report(); };
    const leaveGardenZone = () => { shell?.dispose(); shell = null; gdoor?.dispose(); gdoor = null; };
    // H2: the Home room. Built on entering, freed on leaving; fixed soft daylight inside (no day and night clock in the room).
    let room: HomeScene | null = null;
    const roomCols = roomColliders();
    const enterHomeZone = () => {
      room = buildHomeScene(); room.group.position.x = ROOM_OFF; scene.add(room.group);
      (scene.fog as THREE.Fog).near = HOME_ROOM.light.fog[0]; (scene.fog as THREE.Fog).far = HOME_ROOM.light.fog[1];
      lightClock = 0; report();
    };
    const leaveHomeZone = () => { room?.dispose(); room = null; };
    // The one enter/leave path (W1): the garden is the home zone; each other zone builds and frees its own scene objects.
    const zones = createZoneController([
      { id: "garden", enter: enterGardenZone, leave: leaveGardenZone },
      { id: "margins", enter: enterMarginsZone, leave: leaveMarginsZone },
      { id: "home", enter: enterHomeZone, leave: leaveHomeZone },
    ]);
    const GARDEN_DOOR: Place = { id: "door-home", kind: "door", x: 0, z: 0, label: "Door", prompt: "Go through the door" };
    const ROOM_DOOR: Place = { id: "door-garden", kind: "door", x: 0, z: 0, label: "Door", prompt: "Back to the garden" };
    const offOf = (z: "garden" | "margins" | "home") => (z === "margins" ? OFF : z === "home" ? ROOM_OFF : 0);
    const startTravel = (into: "margins" | "garden" | "home", from: { x: number; z: number }) => {
      if (travel) return;
      const fromZone = zones.current, fo = offOf(fromZone), io = offOf(into);
      const local = { x: from.x - fo, z: from.z };
      // the walk through the gate or door you are at, then the arrival on the far side (each in its own zone's coordinates)
      const walk = (fromZone === "home" ? doorPath(local, "room") : into === "home" ? doorPath(local, "garden") : gatePath(local, into === "margins" ? "garden" : "home")).map((q) => ({ x: q.x + fo, z: q.z }));
      const arrive = (into === "home" ? doorArrival("home") : fromZone === "home" ? doorArrival("garden") : arrivalPath(into)).map((q) => ({ x: q.x + io, z: q.z }));
      travel = { into, from: fromZone, start: performance.now(), walk, arrive, swapped: false };
      sit = STANDING;
      holdStart = -1; uHold = 0;
    };

    // Egg and Print are rebuilt when the game state changes.
    const dynamic = new THREE.Group();
    scene.add(dynamic);
    // The hold ring is a small screen-space circle that follows the Print.
    const SVGNS = "http://www.w3.org/2000/svg";
    const ring = document.createElement("div");
    ring.className = "hold-ring";
    ring.style.display = "none";
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("viewBox", "0 0 72 72");
    svg.setAttribute("aria-hidden", "true");
    const track = document.createElementNS(SVGNS, "circle");
    const arc = document.createElementNS(SVGNS, "circle");
    for (const c of [track, arc]) { c.setAttribute("cx", "36"); c.setAttribute("cy", "36"); c.setAttribute("r", "28"); }
    track.setAttribute("class", "hold-track");
    arc.setAttribute("class", "hold-arc");
    const CIRC = 2 * Math.PI * 28;
    arc.setAttribute("stroke-dasharray", String(CIRC));
    arc.setAttribute("stroke-dashoffset", String(CIRC));
    arc.setAttribute("transform", "rotate(-90 36 36)");
    svg.append(track, arc);
    ring.append(svg);
    el.appendChild(ring);
    // A few ink drops, reused for feeding and stroking.
    const dropGeo = new THREE.SphereGeometry(1, 10, 8);
    const dropMat = new THREE.MeshToonMaterial({ color: "#2b2a33", transparent: true });
    const drops = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(dropGeo, dropMat.clone());
      m.visible = false;
      scene.add(m);
      return m;
    });
    // Snacks to gather: ink puddles and glyph crumbs. Layout and timings come from data/forage.json.
    const t0 = performance.now();
    const spots = FORAGE.spots.map((sp, i) => {
      const g = new THREE.Group();
      g.position.set(sp.x, 0, sp.z);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: sp.kind === "ink" ? 0x5b86d6 : 0xf2b632, transparent: true, opacity: 0.7, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      g.add(glow);
      let body: THREE.Mesh;
      if (sp.kind === "ink") {
        body = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshToonMaterial({ color: "#2b2a33" }));
        body.rotation.x = -Math.PI / 2;
        body.position.y = 0.04;
      } else {
        body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshToonMaterial({ color: "#3b4a8c" }));
        body.position.y = 0.3;
        body.rotation.set(0.4, 0.7, 0.2);
      }
      g.add(body);
      scene.add(g);
      return { sp, g, glow, body, takenAt: null as number | null, hinted: false, phase: i * 1.3 };
    });
    // Night: the Print goes to bed at the rest spot; ink fireflies glow. Everything follows the same hour as the light.
    type Bed = "none" | "yawn" | "walk" | "curl" | "sleep" | "wake";
    let bed: Bed = "none";
    let bedAt = 0, leg = 0, restartAt = 0, wakeMove = false;
    let route: Vec[] = [];
    let curlFrom: Vec = { x: 0, z: 0 }, wakeFrom: Vec = { x: 0, z: 0 };
    // Sitting: a short walk to the seat, a settle, a held pose, and a clear stand-up (lib/sit.ts).
    let sit: SitState = STANDING;
    let sitFrom: Vec = { x: 0, z: 0 };
    let hourNow = override ?? hourOfDay(new Date());
    const anchors = fireflyAnchors();
    const flies = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      NIGHT.fireflies.count,
    );
    flies.frustumCulled = false;
    flies.visible = false;
    scene.add(flies);
    const flyMat = new THREE.Object3D();
    const flyCol = new THREE.Color();
    // Pond play: the Print visits the bank by day, pats the water; the player can splash too (lib/pond.ts).
    let pondS: PondState = PONDIDLE;
    let pondRoute: Vec[] = [];
    let pondLeg = 0;
    let pondNextAt = firstVisitDelay(Math.random());
    let pondPreview = pondOverride(window.location.search, process.env.NODE_ENV === "production");
    let pgStart = -1, pgLanded = false;
    const splashes: Splash[] = [];
    const ringPool: THREE.Mesh[] = [];
    for (let i = 0; i < POND.maxSplashes * 2; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.93, 1, 56),
        new THREE.MeshBasicMaterial({ color: 0xcfd9f2, transparent: true, opacity: 0, depthWrite: false, stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc }),
      );
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;
      m.visible = false;
      scene.add(m);
      ringPool.push(m);
    }
    const splashDrops: THREE.Mesh[] = [];
    for (let i = 0; i < maxDrops(); i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfd9f2, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      splashDrops.push(m);
    }
    const addSplash = (x: number, z: number, big: boolean, at: number) => {
      splashes.push({ start: at, x, z, big });
      while (splashes.length > POND.maxSplashes) splashes.shift();
    };
    // Hide and seek: the Print stops, dashes behind a tree and peeks out until the player finds it (lib/hide.ts).
    let hideS: HideState = HIDEIDLE;
    let hideRoute: Vec[] = [];
    let hideLeg = 0, hideLast = -1, hideSide = 0, hideFindable = false, canSplashShown: boolean | null = null;
    let hideNextAt = firstGameDelay(Math.random());
    let hidePreview = hideOverride(window.location.search, process.env.NODE_ENV === "production");
    const hideDrops = Array.from({ length: 8 }, () => {
      const m = new THREE.Mesh(dropGeo, new THREE.MeshBasicMaterial({ color: 0xcfd9f2, transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return m;
    });
    let holdStart = -1;
    let strokeStart = -1;
    let strokeEnd = -1;
    let wander: Wander | null = null;
    let printMesh: THREE.Group | null = null;
    let baseScale = 1;
    let shownStage: string | null = null;
    let pulseStart = -1;
    // Keepsakes (slice 6d-1): one slot, the newest is worn. A new one plays the put-on motion; a reload or a rebuild just shows it.
    const cosPreview = cosmeticOverride(window.location.search, process.env.NODE_ENV === "production");
    let cosId: string | null = null, cosObj: THREE.Group | null = null, cosOld: THREE.Group | null = null, cosStart = -1, cosResting = false, cosInit = false, cosPlayUntil = 0, cosHold = 0, cosFoundAway = false; // the put-on plays only just after a find, never on load or when switching Prints
    const dropOld = () => { if (cosOld) { disposeCosmetic(cosOld); cosOld = null; } };
    const attachCos = (id: string | null) => {
      if (cosObj) { disposeCosmetic(cosObj); cosObj = null; }
      dropOld();
      cosId = id;
      if (!printMesh || !live.current.genes) return;
      cosObj = buildCosmetic(id, live.current.species, live.current.genes.shape);
      if (cosObj) { printMesh.add(cosObj); poseCosmetic(cosObj, 1, 1, 0); }
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const eggSpot = GARDEN.places.find((p) => p.kind === "egg")!;
    const nest = GARDEN.places.find((p) => p.kind === "nest")!;
    rebuild.current = () => {
      dynamic.clear();
      const { genes: g, eggPhase: phase, stage: st, species: spId } = live.current;
      printMesh = null;
      if (g) {
        const sd = stageById(st);
        printMesh = buildCreature(g, { partsShown: sd.partsShown, mark: sd.mark }, spId);
        baseScale = GARDEN.print.scale * sd.scale;
        printMesh.scale.setScalar(baseScale);
        if (shownStage !== null && shownStage !== st) pulseStart = performance.now();
        shownStage = st;
        dynamic.add(printMesh);
        attachCos(cosId); // a rebuild keeps what is worn, with no motion
        wander = wander ?? newWander({ x: nest.x, z: nest.z + 2 });
      }
      if (phase !== "none") {
        const egg = buildEgg();
        const at = phase === "in-nest" ? nest : eggSpot;
        egg.position.set(at.x, (phase === "in-nest" ? 0.2 : 0.55) + 0.57 * 0.6, at.z);
        egg.scale.multiplyScalar(0.6);
        dynamic.add(egg);
        if (phase === "daily") {
          // A gentle glow so today's egg is easy to spot: a soft golden halo and light, no animation needed.
          const glow = new THREE.Mesh(
            new THREE.SphereGeometry(0.62, 20, 14),
            new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.28, depthWrite: false }),
          );
          glow.position.copy(egg.position);
          dynamic.add(glow);
          const light = new THREE.PointLight(0xffe2a0, 1.2, 4);
          light.position.set(at.x, 1.1, at.z);
          dynamic.add(light);
        }
      }
    };
    rebuild.current();

    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.add(e.code);
      if (e.code === PLAY.keys.hold && !e.repeat) {
        if (travel) {
          // walking through a gate: nothing else to do
        } else if (nearby?.kind === "gate") {
          startTravel(zones.is("margins") ? "garden" : "margins", pos); // the gate in either direction
        } else if (nearby?.kind === "door") {
          startTravel(zones.is("home") ? "garden" : "home", pos); // the Home door in either direction
        } else if (zones.is("home")) {
          // the room is empty for now: nothing else to do
        } else if (zones.is("margins")) {
          // unfolding is a hold, handled each frame
        } else if (hideFindable) {
          hideS = hideFound(hideS); // while the game runs, E near the hiding Print means "found"
        } else if (printNear) {
          // Hold to feed. Not while a feed is in flight, a panel is open, or the last reaction is still playing.
          const reactingNow = reactAt.current >= 0 && performance.now() - reactAt.current < PLAY.reactionSeconds * 1000;
          if (!live.current.locked && live.current.canOffer && !reactingNow && holdStart < 0) holdStart = performance.now();
        } else if (nearby?.kind === "rest") {
          // Sit beside the bed, or get up again; any walking key also stands up.
          const was = sit.phase;
          sit = sitToggle(sit, reducedMotion);
          if (was === "standing" && sit.phase === "going") sitFrom = pos;
        } else if (nearby?.kind === "pond") {
          // No lean and no ring in the dark: the pond follows the Print's own day window.
          if (pgStart < 0 && canPlayerSplash(hourNow)) { pgStart = performance.now(); pgLanded = false; } // lean over and splash
        } else if (nearby) cb.current.onInteract(nearby);
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => keys.clear());

    let dragging = false;
    const dom = renderer.domElement;
    const pd = (e: PointerEvent) => { dragging = true; dom.setPointerCapture(e.pointerId); };
    const pu = () => { dragging = false; };
    const pm = (e: PointerEvent) => {
      if (!dragging) return;
      yaw -= e.movementX * GARDEN.camera.turnSpeed;
      pitch = Math.min(1.2, Math.max(0.1, pitch + e.movementY * GARDEN.camera.turnSpeed));
    };
    dom.addEventListener("pointerdown", pd);
    dom.addEventListener("pointerup", pu);
    dom.addEventListener("pointermove", pm);
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    const onResize = () => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let nearby: Place | null = null;
    let printNear = false;
    const rng = Math.random;
    const target = new THREE.Vector3();
    // Re-read the clock about once a second. The change itself is slow and eased,
    // so there is no sudden flash, which also keeps it gentle for reduced-motion.
    let lightClock = 0;
    const applyLight = () => {
      hourNow = override ?? hourOfDay(new Date());
      const L = lightingAt(zones.is("home") ? HOME_ROOM.light.hour : hourNow); // the room has fixed soft daylight; no clock inside
      (scene.background as THREE.Color).set(zones.is("home") ? HOME_ROOM.look.sky : L.sky);
      (scene.fog as THREE.Fog).color.set(zones.is("home") ? HOME_ROOM.look.sky : L.fog);
      (edge.material as THREE.MeshBasicMaterial).color.set(zones.is("home") ? HOME_ROOM.look.sky : L.sky);
      mg?.setSky(L.sky);
      shell?.setSky(L.sky);
      hemi.color.set(L.hemisphereSky);
      hemi.groundColor.set(L.hemisphereGround);
      hemi.intensity = L.hemisphereIntensity;
      sun.color.set(L.sun);
      sun.intensity = L.sunIntensity;
      sun.position.set(...L.sunPosition);
    };
    // Dev-only starts for the Margins (ignored in production): ?area=margins ?unfold=1 ?gate=1
    const homeStart = homeOverride(window.location.search, process.env.NODE_ENV === "production");
    if (homeStart) {
      zones.enterZone("home");
      const a = doorArrival("home");
      pos = { x: a[1].x + ROOM_OFF, z: a[1].z };
      yaw = doorYaw("home");
    } else if (mo.area || mo.unfold) {
      zones.enterZone("margins");
      const a = arrivalPath("margins");
      pos = { x: a[1].x + OFF, z: a[1].z };
      yaw = arrivalYaw("margins");
      const ml = mLayout as Layout | null;
      if ((mo.unfold) && mSpots[0] && ml) {
        const s0 = mSpots[0];
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const q = { x: s0.x + dx * 0.9, z: s0.z + dz * 0.9 };
          if (!ml.cols.circles.some((c) => Math.hypot(c.x - q.x, c.z - q.z) < c.r + GARDEN.player.radius)) { pos = { x: q.x + OFF, z: q.z }; break; }
        }
        yaw = Math.atan2(-(s0.x - (pos.x - OFF)), -(s0.z - pos.z)) + Math.PI;
      }
    } else if (mo.gate) {
      const { g, d } = gateFrame("garden");
      pos = { x: g.x - d.x * 1.8, z: g.z - d.z * 1.8 };
      yaw = arrivalYaw("margins");
    }
    const atWorld = atOverride(window.location.search, process.env.NODE_ENV === "production"); // dev-only: ?at=x,z looks at the far parts of the World
    if (atWorld && zones.is("garden")) { pos = atWorld; }
    if (zones.is("garden")) showShell(); // the garden zone starts entered, so its World is built here (and again on every return)
    let last = performance.now();
    let raf = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The player walks the whole World; collision data for the streamed chunks comes from the pure map, never from what is drawn.
    const gardenCols = () => (shell ? { circles: [...cols.circles, ...shell.circlesNear(pos.x, pos.z, 8)], boxes: cols.boxes } : cols);
    const tick = (t: number) => {
      for (const rp of ripples) {
        const r = ripple((t / 6000) % 1, rp.offset, reducedMotion);
        rp.mesh.scale.setScalar(r.scale);
        (rp.mesh.material as THREE.MeshBasicMaterial).opacity = r.opacity;
      }
      const dt = Math.min(0.05, (t - last) / 1000);
      if (t - lightClock > 1000) { lightClock = t; applyLight(); }
      last = t;
      const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].some((c) => keys.has(c))) sit = sitWalkKey(sit, reducedMotion);
      sit = sitAdvance(sit, dt, reducedMotion);
      const sf = sitFrame(sit, reducedMotion);
      // While going to the seat the player glides there; while seated or rising they stay put.
      if (sit.phase === "going") pos = lerpPos(sitFrom, NIGHT.sit, sf.move);
      else if (sit.phase === "seated") pos = { x: NIGHT.sit.x, z: NIGHT.sit.z };
            // The player's splash: a smooth lean over the water (down, hold, up); the splash lands once, mid-lean.
      let pgLean = 0;
      if (pgStart >= 0) {
        const pt = (t - pgStart) / 1000;
        if (pt >= playerGestureSeconds()) pgStart = -1;
        else {
          pgLean = playerLean(pt) * (reducedMotion ? POND.calmFactor + 0.3 : 1);
          if (!pgLanded && pt >= POND.player.splashAt) {
            pgLanded = true;
            const at = edgeNear(pos);
            addSplash(at.x, at.z, false, t / 1000);
            const ph0 = sleepPhase(hourNow);
            const next = answerTo(pondS, wander ?? pos, hourNow, ph0 === "awake" && bed === "none");
            if (next !== pondS && !hideBusy(hideS)) { pondS = next; pondRoute = []; pondLeg = 0; }
          }
        }
      }
      let ground = 0;
      if (zones.is("margins") && mLayout) ground = heightAt(pos.x - OFF, pos.z, mLayout.hills);
      let tRes: { pos: { x: number; z: number }; heading: number | null } | null = null;
      if (travel) {
        const tt = (t - travel.start) / 1000, f = travelFrame(tt, reducedMotion);
        if (f.swapped && !travel.swapped) {
          travel.swapped = true; // behind the full page, so nothing flashes
          if (travel.into === "garden") zones.leaveZone(); else zones.enterZone(travel.into);
          yaw = travel.into === "home" ? doorYaw("home") : travel.from === "home" ? doorYaw("garden") : arrivalYaw(travel.into);
          camInit = false;
        }
        const pp = pointAlong(travel.swapped ? travel.arrive : travel.walk, travel.swapped ? f.arrive : f.walk);
        tRes = { pos: pp.p, heading: pp.heading };
        wipe.style.display = f.wipe > 0 || tt < 0.05 ? "block" : "none";
        if (reducedMotion) { wipe.style.transform = "none"; wipe.style.opacity = String(f.wipe); } // a fade, not a sweep
        else { wipe.style.transform = `translateX(${wipeOffset(tt, false)}%)`; wipe.style.opacity = "1"; }
        if (f.done) { travel = null; wipe.style.display = "none"; }
      }
      const res = tRes ? tRes : zones.is("home") && canWalk(sit) ? (() => {
        const l = { x: pos.x - ROOM_OFF, z: pos.z };
        const r = movePlayer(l, { forward: k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown"), right: k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") }, yaw,
          keys.has("ShiftLeft") || keys.has("ShiftRight") ? GARDEN.player.jogSpeed : GARDEN.player.speed, dt, GARDEN.player.radius, roomCols, HOME_ROOM.room.width);
        return { pos: { x: r.pos.x + ROOM_OFF, z: Math.min(r.pos.z, HOME_ROOM.room.depth / 2 + 0.6) }, heading: r.heading }; // the doorway is the way out; no further
      })() : zones.is("margins") && canWalk(sit) ? (() => {
        const l = { x: pos.x - OFF, z: pos.z };
        const r = movePlayer(l, { forward: k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown"), right: k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") }, yaw,
          keys.has("ShiftLeft") || keys.has("ShiftRight") ? GARDEN.player.jogSpeed : GARDEN.player.speed, dt, GARDEN.player.radius, mCols, MARGINS.size);
        return { pos: { x: r.pos.x + OFF, z: r.pos.z }, heading: r.heading };
      })() : !canWalk(sit) ? { pos, heading: Math.atan2(NIGHT.bed.x - pos.x, NIGHT.bed.z - pos.z) } : pgStart >= 0 ? { pos, heading: towardPond(pos) } : movePlayer(
        pos,
        { forward: k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown"), right: k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") },
        yaw,
        keys.has("ShiftLeft") || keys.has("ShiftRight") ? GARDEN.player.jogSpeed : GARDEN.player.speed,
        dt, GARDEN.player.radius, gardenCols(), WORLD.size,
      );
      pos = res.pos;
      if (shell) shell.update(pos.x, pos.z); // streams the nearest missing chunks, a couple per frame
      if (res.heading !== null) {
        let d = res.heading - player.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.rotation.y += d * Math.min(1, dt * 12);
      }
      // The hover bob fades out as the body lowers onto the seat; the pose is a fold, a tilt and a slow sway.
      player.rotation.order = "YXZ";
      player.position.set(pos.x, ground + hoverY(t) + (SIT.y - hoverY(t)) * sf.lower, pos.z);
      player.scale.y = (1 - SIT.lower * sf.lower) * (1 - 0.12 * pgLean);
      player.rotation.x = sf.tilt + pgLean * POND.player.lean;
      player.rotation.z = sf.sway;

      const sinceFeed = reactAt.current < 0 ? -1 : (t - reactAt.current) / 1000;
      const reacting = sinceFeed >= 0 && sinceFeed < PLAY.reactionSeconds;
      if (printMesh && wander) {
        const isLocked = live.current.locked;
        // Hold E: the ring fills; letting go, walking away or a locked state cancels with no feed.
        if (holdStart >= 0 && (!keys.has(PLAY.keys.hold) || !printNear || isLocked || reacting || !live.current.canOffer)) holdStart = -1;
        let heldFor = -1;
        if (holdStart >= 0) {
          heldFor = (t - holdStart) / 1000;
          if (holdDone(heldFor)) { holdStart = -1; heldFor = -1; cb.current.onFeedPrint(); }
        }
        // Hold R: stroke, for fun only.
        const wantStroke = keys.has(PLAY.keys.stroke) && printNear && !reacting && holdStart < 0 && !isLocked;
        if (wantStroke) { if (strokeStart < 0) strokeStart = t; strokeEnd = -1; }
        else if (strokeStart >= 0) {
          if (strokeEnd < 0) strokeEnd = t;
          if ((t - strokeEnd) / 1000 >= PLAY.stroke.easeOut) { strokeStart = -1; strokeEnd = -1; }
        }
        const engaged = holdStart >= 0 || reacting || strokeStart >= 0;
        // Bedtime. The hour decides; being fed or stroked wakes the Print gently and it settles again later.
        const ts = t / 1000, ph = sleepPhase(hourNow), R = GARDEN.print.radius;
        const atBed = Math.hypot(wander.x - NIGHT.bed.x, wander.z - NIGHT.bed.z) < 0.6;
        if (engaged) {
          restartAt = ts + NIGHT.napSeconds;
          if (bed === "yawn" || bed === "walk") bed = "none";
          else if (bed === "curl" || bed === "sleep") { bed = "wake"; bedAt = ts; wakeMove = false; }
        }
        if (ph === "awake") {
          if (bed === "yawn" || bed === "walk") bed = "none";
          if (!engaged && (bed === "curl" || bed === "sleep" || (bed === "none" && atBed))) { bed = "wake"; bedAt = ts; wakeMove = true; wakeFrom = { x: wander.x, z: wander.z }; }
        } else if (bed === "none" && !engaged && ts >= restartAt) {
          bed = atBed ? "curl" : "yawn"; bedAt = ts; curlFrom = { x: wander.x, z: wander.z };
        }
        const holdStill = bed === "none" && atBed && ph !== "awake";
        let owned = false, yBase = holdStill ? NIGHT.bed.y : 0;
        let bedPose: ReturnType<typeof sleepPose> | null = null;
        const ease = (n: number) => n * n * (3 - 2 * n);
        if (bed === "yawn") {
          owned = true; bedPose = stretchPose(ts - bedAt, false, reducedMotion);
          if (ts - bedAt >= NIGHT.yawnSeconds) { route = routeTo(wander, NIGHT.approach, cols, R); leg = 0; bed = "walk"; }
        } else if (bed === "walk") {
          owned = true;
          const r = walkRoute(wander, route, leg, dt, R, cols);
          wander = { ...wander, x: r.pos.x, z: r.pos.z, heading: r.heading ?? wander.heading };
          leg = r.leg;
          if (r.done) { bed = "curl"; bedAt = ts; curlFrom = { x: wander.x, z: wander.z }; }
        } else if (bed === "curl") {
          owned = true;
          const u = Math.min(1, (ts - bedAt) / NIGHT.settleSeconds), e = ease(u);
          wander = { ...wander, x: curlFrom.x + (NIGHT.bed.x - curlFrom.x) * e, z: curlFrom.z + (NIGHT.bed.z - curlFrom.z) * e };
          yBase = NIGHT.bed.y * e;
          bedPose = mixPose({ lean: 0, squash: 1, hop: 0 }, sleepPose(ts, reducedMotion), e);
          if (u >= 1) bed = "sleep";
        } else if (bed === "sleep") {
          owned = true; yBase = NIGHT.bed.y; bedPose = sleepPose(ts, reducedMotion);
          wander = { ...wander, x: NIGHT.bed.x, z: NIGHT.bed.z, wait: 1 };
        } else if (bed === "wake") {
          owned = true;
          const u = Math.min(1, (ts - bedAt) / NIGHT.wakeSeconds), e = ease(u);
          if (wakeMove) {
            wander = { ...wander, x: wakeFrom.x + (NIGHT.approach.x - wakeFrom.x) * e, z: wakeFrom.z + (NIGHT.approach.z - wakeFrom.z) * e };
            yBase = NIGHT.bed.y * (1 - e);
            bedPose = stretchPose(ts - bedAt, true, reducedMotion);
          } else {
            yBase = NIGHT.bed.y;
            bedPose = mixPose(sleepPose(ts, reducedMotion), { lean: 0, squash: 1, hop: 0 }, e);
          }
          if (u >= 1) {
            bed = "none";
            if (wakeMove) wander = { ...wander, x: NIGHT.approach.x, z: NIGHT.approach.z, tx: NIGHT.approach.x, tz: NIGHT.approach.z, wait: 1.5 };
          }
        }
        // Pond play. A feed or stroke, or bedtime, always cancels a visit; it can start again later.
        const awakeNow = ph === "awake" && bed === "none";
        if (pondPreview) {
          const shore = shorePoint();
          wander = { ...wander, x: shore.x, z: shore.z, tx: shore.x, tz: shore.z, wait: 1, heading: towardPond(shore) };
          pondS = overrideState(pondPreview); pondPreview = null;
        }
        if (pondBusy(pondS) && (engaged || !awakeNow)) { pondS = PONDIDLE; wander = { ...wander, tx: wander.x, tz: wander.z, wait: 1 }; pondNextAt = ts + nextVisitDelay(Math.random()); }
        if (!pondBusy(pondS) && !hideBusy(hideS) && awakeNow && !engaged && ts >= pondNextAt) {
          if (canStartVisit(hourNow, true, wander)) pondS = pondStart();
          else pondNextAt = ts + retryDelay(Math.random());
        }
        let pondOwned = false;
        let pondPoseV: ReturnType<typeof pondPose> | null = null;
        if (pondBusy(pondS)) {
          pondOwned = true;
          const shore = shorePoint(), spot = splashSpot(shore);
          const before = pondS, phaseEnd = Math.min(before.t + dt, phaseSeconds(before));
          if (before.phase === "patting") for (let i = tapsBetween(before.t, phaseEnd); i > 0; i--) addSplash(spot.x, spot.z, false, ts);
          if (before.phase === "splashing" && bigSplashLanded(before.t, phaseEnd)) addSplash(spot.x, spot.z, true, ts);
          if (before.phase === "going") {
            const r = walkRoute(wander, pondRoute, pondLeg, dt, GARDEN.print.radius, cols, POND.walkSpeed);
            wander = { ...wander, x: r.pos.x, z: r.pos.z, heading: r.heading ?? wander.heading };
            pondLeg = r.leg;
            pondS = r.done ? arrived(before) : { ...before, t: before.t + dt };
          } else pondS = pondAdvance(before, dt);
          if (before.phase === "watching" && pondS.phase === "going") { pondRoute = routeTo(wander, shore, cols, GARDEN.print.radius); pondLeg = 0; }
          if (pondS.phase === "watching") wander = { ...wander, heading: towardPond(wander) };
          else if (pondS.phase === "flinch" || pondS.phase === "patting" || pondS.phase === "splashing" || pondS.phase === "leaving") {
            // Settle onto the shore point and face the water.
            const k = Math.min(1, dt * 6);
            wander = { ...wander, x: wander.x + (shore.x - wander.x) * k, z: wander.z + (shore.z - wander.z) * k, heading: pondS.phase === "leaving" ? wander.heading : towardPond(shore) };
          }
          if (!pondBusy(pondS)) { pondOwned = false; wander = { ...wander, tx: wander.x, tz: wander.z, wait: 1.2 }; pondNextAt = ts + nextVisitDelay(Math.random()); }
          else pondPoseV = pondPose(pondS, reducedMotion);
        }
        // Hide and seek. A feed, stroke, bedtime or sit ends it gently; a player splash is ignored until it ends.
        if (hidePreview) {
          if (hidePreview === "found") {
            // Hiding just ahead of the player, within reach: one E press plays the found burst.
            const pick = previewSpot(pos, yaw, cols);
            pondS = PONDIDLE;
            wander = { ...wander, x: pick.spot.x, z: pick.spot.z, tx: pick.spot.x, tz: pick.spot.z, wait: 1 };
            hideS = { ...withSpot(hideStart(), pick), phase: "hiding", t: 0 };
          } else if (hidePreview === "1") { pondS = PONDIDLE; hideS = hideStart(); }
          hidePreview = null;
        }
        const pondWasBusy = pondBusy(pondS);
        if (hideBusy(hideS) && (engaged || !awakeNow || sit.phase !== "standing" || pondBusy(pondS))) {
          hideS = hideCancel(); hideRoute = []; wander = { ...wander, tx: wander.x, tz: wander.z, wait: 1.2 }; hideNextAt = ts + nextGameDelay(Math.random());
        }
        if (!hideBusy(hideS) && awakeNow && !engaged && !pondBusy(pondS) && sit.phase === "standing" && ts >= hideNextAt) {
          if (canStartGame(hourNow, true, true, wander, pos)) hideS = hideStart();
          else hideNextAt = ts + hideRetry(Math.random());
        }
        if (pondWasBusy && !pondBusy(pondS)) hideNextAt = Math.max(hideNextAt, ts + HIDE.afterPond);
        let hideOwned = false;
        let hidePoseV: ReturnType<typeof hidePose> | null = null;
        if (hideBusy(hideS)) {
          hideOwned = true;
          const before = hideS;
          if (before.phase === "dashing") {
            const r = walkRoute(wander, hideRoute, hideLeg, dt, GARDEN.print.radius, cols, HIDE.dashSpeed);
            wander = { ...wander, x: r.pos.x, z: r.pos.z, heading: r.heading ?? wander.heading };
            hideLeg = r.leg;
            hideS = r.done ? hideArrived(before) : { ...before, t: before.t + dt };
            if (hideS.phase === "hiding") wander = { ...wander, heading: Math.atan2(pos.x - wander.x, pos.z - wander.z) };
          } else hideS = hideAdvance(before, dt);
          if (before.phase === "inviting" && hideS.phase === "dashing") {
            const pick = pickSpot(pos, wander, hideLast, cols, Math.random(), Math.random(), Math.random());
            if (!pick) hideS = HIDEIDLE; // nowhere good to hide: no game
            else { hideS = withSpot(hideS, pick); hideLast = pick.tree; hideRoute = routeTo(wander, pick.spot, cols, GARDEN.print.radius); hideLeg = 0; }
          }
          if (hideS.phase === "inviting") wander = { ...wander, heading: Math.atan2(pos.x - wander.x, pos.z - wander.z) };
          const anchor = hideAnchor(hideS);
          if (anchor && hideS.phase !== "hiding") wander = { ...wander, x: anchor.x, z: anchor.z, tx: anchor.x, tz: anchor.z };
          if (!hideBusy(hideS)) { hideOwned = false; wander = { ...wander, tx: wander.x, tz: wander.z, wait: 1.2 }; hideNextAt = ts + nextGameDelay(Math.random()); }
          else hidePoseV = hidePose(hideS, reducedMotion);
        }
        // The peek leans out sideways; it is eased so an interrupt never snaps the Print back.
        const sideWant = hidePoseV && hideS.perp ? hidePoseV.side : 0;
        hideSide += (sideWant - hideSide) * Math.min(1, dt * 8);
        if (Math.abs(hideSide) < 0.001) hideSide = 0;
        const hideDir = hideS.perp ?? { x: 0, z: 0 };
        if (!engaged && !owned && !holdStill && !pondOwned && !hideOwned) wander = stepWander(wander, dt, rng, GARDEN.print.radius, GARDEN.print.speed, cols);
        // Pose: the reaction wins, then stroking, otherwise rest.
        const stroked = strokeStart >= 0 ? (t - strokeStart) / 1000 : -1;
        const released = strokeEnd >= 0 ? (t - strokeEnd) / 1000 : 0;
        const reactPose = reacting ? feedPose(sinceFeed, reducedMotion) : stroked >= 0 ? strokePose(stroked, reducedMotion, released) : { lean: 0, squash: 1, hop: 0 };
        const pose = engaged ? (bedPose && bed === "wake" ? mixPose(bedPose, reactPose, 0.7) : reactPose) : bedPose ?? pondPoseV ?? hidePoseV ?? reactPose;
        const faceTarget = engaged ? Math.atan2(pos.x - wander.x, pos.z - wander.z) : wander.heading;
        printMesh.rotation.order = "YXZ";
        let dy = faceTarget + (hidePoseV && !engaged ? hidePoseV.spin : 0) - printMesh.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        printMesh.rotation.y += dy * Math.min(1, dt * 8);
        printMesh.rotation.x = pose.lean;
        printMesh.rotation.z = !engaged ? (pondPoseV?.shake ?? hidePoseV?.shake ?? 0) : 0;
        printMesh.position.set(wander.x + hideDir.x * HIDE.peekOut * hideSide, (owned || holdStill || pondOwned || hideOwned ? 0 : Math.abs(Math.sin(t / 300)) * 0.03 * (engaged ? 0.3 : 1)) + pose.hop + yBase, wander.z + hideDir.z * HIDE.peekOut * hideSide);
        const prog = pulseStart < 0 ? 0 : (performance.now() - pulseStart) / 1200;
        if (prog >= 1) pulseStart = -1;
        const sc = baseScale * growthPulse(prog, reduced);
        const wide = 1 + (1 - pose.squash) * 0.5;
        printMesh.scale.set(sc * wide, sc * pose.squash, sc * wide);

        // Keepsakes: swap to what should be worn, then play the put-on motion (eased; never blocks input).
        const want = cosPreview ? (cosPreview.kind === "one" ? cosPreview.id : cycleAt((t - t0) / 1000)) : live.current.worn;
        const wantId = want && COSMETIC_IDS.includes(want) ? want : null;
        if (wantId !== cosId && (cosPreview || (zones.is("garden") && t >= cosHold))) { // away in the Margins the Print is not on screen: the swap waits until the player is back
          const moving = (cosPreview ? cosInit : t < cosPlayUntil && zones.is("garden")) && (cosObj !== null || wantId !== null); // the first look (a reload, or a preview switch) shows at once
          if (moving && printMesh && live.current.genes) {
            dropOld();
            cosOld = cosObj; cosObj = buildCosmetic(wantId, live.current.species, live.current.genes.shape);
            if (cosObj) printMesh.add(cosObj);
            cosId = wantId; cosStart = t; cosResting = bed === "sleep";
            if (!cosObj && cosOld) { /* taking one off: it just shrinks away */ }
          } else attachCos(wantId);
        }
        cosInit = true;
        if (cosStart >= 0) {
          const pf = putOnFrame((t - cosStart) / 1000, reducedMotion, cosResting);
          if (cosObj) poseCosmetic(cosObj, reducedMotion ? 1 : pf.newScale, reducedMotion ? pf.newFade : 1, 0);
          if (cosOld) poseCosmetic(cosOld, reducedMotion ? 1 : pf.oldScale, reducedMotion ? pf.oldFade : 1, 0);
          printMesh.scale.set(printMesh.scale.x * pf.bodyXZ, printMesh.scale.y * pf.bodyY, printMesh.scale.z * pf.bodyXZ);
          printMesh.position.y += pf.hop * 1.2 * baseScale;
          if (pf.done || (t - cosStart) / 1000 > putOnSeconds(reducedMotion, cosResting)) { cosStart = -1; dropOld(); if (cosObj) poseCosmetic(cosObj, 1, 1, 0); }
        }
        if (cosObj && cosId === "lantern") {
          const gl = cosObj.getObjectByName("glow") as THREE.Mesh | undefined;
          if (gl) (gl.material as THREE.MeshBasicMaterial).opacity = lanternGlow(fireflyLevel(hourNow), t / 1000, reducedMotion) * 0.5 * (cosStart >= 0 ? putOnFrame((t - cosStart) / 1000, reducedMotion, cosResting).newScale : 1);
        }

        // The ring follows the Print on screen.
        if (heldFor >= 0) {
          const v = new THREE.Vector3(wander.x, baseScale * 0.55, wander.z).project(camera);
          ring.style.display = "block";
          ring.style.left = `${(v.x * 0.5 + 0.5) * el.clientWidth}px`;
          ring.style.top = `${(-v.y * 0.5 + 0.5) * el.clientHeight}px`;
          arc.setAttribute("stroke-dashoffset", String(CIRC * (1 - holdProgress(heldFor))));
        } else ring.style.display = "none";

        // Ink drops.
        const puffs: Puff[] = [
          ...(reacting ? feedPuffs(sinceFeed, reducedMotion) : []),
          ...(stroked >= 0 && released === 0 ? strokePuffs(stroked, reducedMotion) : []),
          ...(bed === "sleep" && !engaged ? swirlPuffs(ts, reducedMotion) : []),
        ];
        const hp = !engaged && hideBusy(hideS) ? hidePuffs(hideS, reducedMotion) : [];
        hideDrops.forEach((m, i) => {
          const pf = hp[i];
          m.visible = !!pf;
          if (!pf) return;
          m.position.set(printMesh!.position.x + Math.cos(pf.angle) * pf.dx, baseScale * 0.65 + pf.dy + yBase, printMesh!.position.z + Math.sin(pf.angle) * pf.dx);
          m.scale.setScalar(pf.scale);
          const mt = m.material as THREE.MeshBasicMaterial;
          mt.opacity = pf.opacity;
          mt.color.set(pf.tone === "gold" ? 0xf2b632 : i % 2 ? 0xffffff : 0x3b4a8c);
        });
        drops.forEach((m, i) => {
          const pf = puffs[i];
          m.visible = !!pf;
          if (!pf) return;
          m.position.set(wander!.x + Math.cos(pf.angle) * pf.dx, baseScale * 0.65 + pf.dy + yBase, wander!.z + Math.sin(pf.angle) * pf.dx);
          m.scale.setScalar(pf.scale);
          (m.material as THREE.MeshToonMaterial).opacity = pf.opacity;
        });
      } else { ring.style.display = "none"; drops.forEach((m) => { m.visible = false; }); hideDrops.forEach((m) => { m.visible = false; }); }

      // Splash rings and drops (cut off at the water's edge by the stencil).
      {
        const nowS = t / 1000;
        while (splashes.length && nowS - splashes[0].start > splashLife(splashes[0].big, reducedMotion) + 0.5) splashes.shift();
        let ri = 0, di = 0;
        for (const sp of splashes) {
          const age = nowS - sp.start;
          for (let i = 0; i < ringCount(sp.big, reducedMotion) && ri < ringPool.length; i++, ri++) {
            const r = ringAt(age, sp.big, reducedMotion, ringDelay(i), sp);
            const m = ringPool[ri];
            m.visible = r.opacity > 0.002;
            m.position.set(sp.x, 0.035 + ri * 0.0005, sp.z);
            m.scale.setScalar(Math.max(0.01, r.radius));
            (m.material as THREE.MeshBasicMaterial).opacity = r.opacity;
          }
          for (const d of dropsAt(age, sp.big, reducedMotion)) {
            if (di >= splashDrops.length) break;
            const m = splashDrops[di++];
            m.visible = true;
            m.position.set(sp.x + d.x, 0.05 + d.y, sp.z + d.z);
            m.scale.setScalar(d.scale);
            const mt = m.material as THREE.MeshBasicMaterial;
            mt.opacity = d.opacity;
            mt.color.set(d.dark ? 0x3b4a8c : 0xcfd9f2);
          }
        }
        for (; ri < ringPool.length; ri++) ringPool[ri].visible = false;
        for (; di < splashDrops.length; di++) splashDrops[di].visible = false;
      }

      // Fireflies glow from dusk to dawn.
      const fl = fireflyLevel(hourNow);
      flies.visible = fl > 0;
      if (fl > 0) {
        (flies.material as THREE.MeshBasicMaterial).opacity = fl;
        for (let i = 0; i < NIGHT.fireflies.count; i++) {
          const f = fireflyAt(i, t / 1000, anchors, reducedMotion);
          flyMat.position.set(f.x, f.y, f.z);
          flyMat.scale.setScalar(NIGHT.fireflies.size * (0.8 + 0.4 * f.glow));
          flyMat.updateMatrix();
          flies.setMatrixAt(i, flyMat.matrix);
          flyCol.setRGB(0.95 * f.glow, 0.62 * f.glow, 0.12 * f.glow);
          flies.setColorAt(i, flyCol);
        }
        flies.instanceMatrix.needsUpdate = true;
        if (flies.instanceColor) flies.instanceColor.needsUpdate = true;
      }

      // Snacks: show the ready ones, collect on walk-over, shimmer gently.
      const now = (t - t0) / 1000;
      for (const o of spots) {
        const since = sinceReady(o.takenAt, now, o.sp.readyAfter);
        o.g.visible = since >= 0;
        if (since < 0) continue;
        const near = inReach(pos, o.sp);
        if (near && !o.hinted) {
          const r = cb.current.onGather?.(o.sp.kind);
          if (r === "ok") { o.takenAt = now; o.g.visible = false; continue; }
          o.hinted = true; // full pouch: leave it, hint once until the player walks away
        } else if (!near) o.hinted = false;
        const sh = shimmer(now, o.phase, reducedMotion);
        o.glow.scale.setScalar(sh.scale);
        (o.glow.material as THREE.MeshBasicMaterial).opacity = sh.glow;
        const fall = dropOffset(since, reducedMotion);
        if (o.sp.kind === "glyph") { o.body.position.y = 0.3 + fall; o.body.rotation.y += dt * (reducedMotion ? 0.2 : 0.8); }
        else o.body.scale.setScalar(Math.max(0.05, 1 - fall / FORAGE.dropHeight));
      }

      // The Margins: the glints, the unfold hold, the finds and the way home.
      let mNear: Place | null = null;
      if (zones.is("margins") && mg && mLayout && mField) {
        const l = { x: pos.x - OFF, z: pos.z };
        if (!travel) {
          if (mActive) {
            if ((t - mActive.since) / 1000 >= unfoldSeconds(reducedMotion)) {
              const sp = mSpots.find((q) => q.id === mActive!.id)!;
              opened.add(sp.id);
              const food = foodOf(sp.kind);
              if (sp.kind === "scrap" && !keepsakePages.has(sp.id)) scraps++; else if (food) cb.current.onGather?.(food); // food goes into the pouch
              else if (sp.kind === "egg") cb.current.onMarginsNote?.(FOUND_EGG); // the page reloads the nest
              mActive = null; report();
            }
          } else {
            const cand = nearestSpot(l, mSpots, opened);
            if (cand !== uSpot) { uSpot = cand; uHold = 0; uBlocked = false; }
            const view = unfoldView(local, serverReady, readFailed);
            if (cand && !view.canAsk && view.noteOnHold && keys.has(PLAY.keys.hold)) { if (!downNoted) { cb.current.onMarginsNote?.(view.noteOnHold); downNoted = true; } }
            else if (!keys.has(PLAY.keys.hold)) downNoted = false;
            const holding = !!cand && keys.has(PLAY.keys.hold) && !live.current.locked && !uBlocked && view.canAsk;
            uHold = uPending ? 1 : holdStep(uHold, holding, dt);
            if (cand && !keys.has(PLAY.keys.hold)) uBlocked = false;
            if (uHold >= 1 && cand && !uPending) {
              const full = cb.current.canGather && !cb.current.canGather("ink"); // the server picks the find, so any full pouch stops it first
              if (local ? foodOf(cand.kind) && full : full) { cb.current.onGather?.("ink"); uBlocked = true; uHold = 0; } // a full pouch leaves the page folded, no call made
              else if (local) { mActive = { id: cand.id, since: t }; uHold = 0; }
              else if (heldByDay.get(mDay)?.has(cand.id)) { // the server already gave this find: open it from the hold, no new call
                cand.kind = heldByDay.get(mDay)!.get(cand.id)!; heldByDay.get(mDay)!.delete(cand.id);
                mActive = { id: cand.id, since: t }; uHold = 0;
              }
              else if (quietUntilNext) { cb.current.onMarginsNote?.(QUIET); uBlocked = true; uHold = 0; } // the server already said no; don't ask again this visit
              else if (cb.current.onUnfold) {
                uPending = true; // the ring waits full for the answer; the page opens only once it is back
                const spot = cand, myVisit = visit, askDay = mDay, dayOpened = opened;
                cb.current.onUnfold(spot.id, askDay).catch((): Outcome => ({ ok: false, reason: "network" })).then((o) => {
                  const here = myVisit === visit && zones.is("margins");
                  const room = !cb.current.canGather || cb.current.canGather("ink");
                  const st = settleUnfold(o, here, room);
                  if (st.held) { // a full pouch: the page stays folded and the find is kept, with the gentle hint
                    if (!heldByDay.has(askDay)) heldByDay.set(askDay, new Map());
                    heldByDay.get(askDay)!.set(spot.id, st.held);
                    if (here) { cb.current.onGather?.(st.held); uPending = false; uBlocked = true; uHold = 0; report(); }
                    return;
                  }
                  if (st.open) dayOpened.add(spot.id); // the server wrote it, so the page counts as open on any later visit that day
                  if (!here) {
                    // Left while the call was in flight: still hand over what the server gave, with no animation.
                    if (st.food) cb.current.onGather?.(st.food); else if (st.scrap) scraps++;
                    if (st.egg) cb.current.onMarginsNote?.(FOUND_EGG);
                    if (st.cosmetic) { cosPlayUntil = performance.now() + 3000; cb.current.onKeepsake?.(st.cosmetic); } // the Print is on screen now, so the put-on plays
                    return;
                  }
                  uPending = false;
                  if (st.ceiling) quietUntilNext = true;
                  if (st.note && !st.animate) cb.current.onMarginsNote?.(st.note);
                  if (st.cosmetic) { cosFoundAway = true; cb.current.onKeepsake?.(st.cosmetic); } // the Print is away: it is worn at once, and the put-on plays when the player is back in the garden
                  if (st.animate && st.kind) { if (st.kind === "keepsake") keepsakePages.add(spot.id); spot.kind = st.kind === "keepsake" ? "scrap" : st.kind; /* a keepsake rises as a paper scrap, but is never counted as one */ mActive = { id: spot.id, since: performance.now() }; uHold = 0; }
                  else { uBlocked = true; uHold = 0; report(); } // refused: stays folded, nothing spent. A repeat: shown open, nothing granted.
                });
              } else { uBlocked = true; uHold = 0; }
            }
          }
          if (mActive) mNear = null;
          else if (uSpot) mNear = !unfoldView(local, serverReady, readFailed).prompt ? null : { id: "unfold", kind: "unfold", x: uSpot.x + OFF, z: uSpot.z, label: "Folded page", prompt: "Hold to unfold" };
          else if (inGateZone(l, "home")) mNear = { id: "gate-home", kind: "gate", x: 0, z: 0, label: "Gate", prompt: "Back to the garden" };
        }
        // the way home is recomputed only when the player moves to a new cell
        const key = `${Math.round(l.x / 1.5)},${Math.round(l.z / 1.5)}`;
        if (key !== trailKey) { trailKey = key; trailPath = homePath(mField, l); }
        const A = MARGINS.arrows;
        const hereHome = pathLength(trailPath) < A.hideNear;
        const trail = hereHome ? [] : along(trailPath, A.startDist, A.spacing, A.count, reducedMotion ? 0 : ((t / 1000) * A.flowSpeed) % A.spacing);
        mg.update({ t: t / 1000, dt, player: l, hour: hourNow, reduced: reducedMotion, all: mo.all, opened, active: mActive ? { id: mActive.id, since: (t - mActive.since) / 1000 } : null, target: l, trail });
        if (uHold > 0 && uSpot) {
          const v = new THREE.Vector3(uSpot.x + OFF, 0.5 + heightAt(uSpot.x, uSpot.z, mLayout.hills), uSpot.z).project(camera);
          ring.style.display = "block";
          ring.style.left = `${(v.x * 0.5 + 0.5) * el.clientWidth}px`;
          ring.style.top = `${(-v.y * 0.5 + 0.5) * el.clientHeight}px`;
          arc.setAttribute("stroke-dashoffset", String(CIRC * (1 - uHold)));
        }
      }

      // Third-person follow camera, pulled in near scenery and smoothed.
      const dir = { x: Math.sin(yaw) * Math.cos(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      const flat = Math.hypot(dir.x, dir.z) || 1;
      // While sitting the bench would pull the camera in on top of the player, so it keeps a fixed, slightly closer distance.
      const walkDist = zones.is("home") ? cameraDistance({ x: pos.x - ROOM_OFF, z: pos.z }, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, roomCols) : zones.is("margins") ? cameraDistance({ x: pos.x - OFF, z: pos.z }, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, mCols) : cameraDistance(pos, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, gardenCols());
      // Blend with how far seated you are, so the camera eases in and out instead of jumping.
      const dist = walkDist + (GARDEN.camera.distance * (1 - SIT.cameraIn) - walkDist) * sf.lower;
      target.set(pos.x, ground + GARDEN.camera.height * 0.7, pos.z);
      const want = new THREE.Vector3(
        pos.x + (dir.x / flat) * dist * Math.cos(pitch),
        ground + GARDEN.camera.height + Math.sin(pitch) * dist,
        pos.z + (dir.z / flat) * dist * Math.cos(pitch),
      );
      if (!camInit) { camPos.copy(want); camInit = true; }
      camPos.lerp(want, 1 - Math.exp(-GARDEN.camera.smoothing * dt));
      camera.position.copy(camPos);
      camera.lookAt(target);

      const pn = !!printMesh && !!wander && printInReach(pos, wander);
      if (pn !== printNear) { printNear = pn; cb.current.onPrintNear(pn); }

      const hf = !!wander && canFind(hideS, pos, wander);
      if (hf !== hideFindable) { hideFindable = hf; cb.current.onFindable?.(hf); }
      const cs = canPlayerSplash(hourNow);
      if (cs !== canSplashShown) { canSplashShown = cs; cb.current.onCanSplash?.(cs); }

      const n = travel ? null : zones.is("margins") ? mNear : zones.is("home") ? (inDoorZone({ x: pos.x - ROOM_OFF, z: pos.z }, "room") ? ROOM_DOOR : null) : inDoorZone(pos, "garden") ? GARDEN_DOOR : nearestPlace(pos);
      if (n?.id !== nearby?.id) { nearby = n; cb.current.onNearby(n); }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("resize", onResize);
      ring.remove();
      wipe.remove();
      zones.dispose(); // frees the zone that is showing, through the same path as leaving
      if (mg) { scene.remove(mg.group); mg.dispose(); mg = null; }
      for (const m of [...ringPool, ...splashDrops]) { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      for (const m of hideDrops) { scene.remove(m); (m.material as THREE.Material).dispose(); }
      scene.remove(flies);
      flies.geometry.dispose();
      (flies.material as THREE.Material).dispose();
      spots.forEach((o) => { scene.remove(o.g); o.glow.geometry.dispose(); o.body.geometry.dispose(); (o.glow.material as THREE.Material).dispose(); (o.body.material as THREE.Material).dispose(); });
      dropGeo.dispose();
      drops.forEach((m) => (m.material as THREE.Material).dispose());
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mount} style={{ width: "100%", height: "100%" }} />;
}
