"use client";
import { createZoneController } from "@/lib/zones";
import { NOTICE0, NPCS, TALK0, closeTalk, greetingIcons, noticeStep, npcSpot, npcSpotUsable, talk, talkStillNear, withinSlack, type Notice, type Npc, type Talk } from "@/lib/npcs";
import { buildNpc, type NpcScene } from "@/components/npcScene";
import { buildSights, type SightScene } from "@/components/sightScene";
import { SIGHTS, levelStep, sightLevel, sightsForDay } from "@/lib/sights";
import { SHORE_SIGHTS, shoreSightsForDay } from "@/lib/shoreSights";
import { REGION_SIGHTS, SIGHT_REGIONS, regionSightsForDay } from "@/lib/regionSights";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { addOutline, disposeTree } from "@/lib/outline";
import { PROP_EDGE_ANGLE, blotGeo, crownGeo, hedgeGeo, inkwellGeo, pageGeo, pillowGeo, plateGeo, plinthGeo, poleGeo, tableGeo, trunkGeo } from "@/lib/propShapes";
import { buildCreature, buildEgg, type Genes } from "@/lib/creature";
import { buildCreatureOld, shapesOverride } from "@/lib/creatureOld";
import {
  GARDEN, HOME, cameraDistance, colliders, hoverY, movePlayer, nearestPlace, newWander, printInReach, stepWander, type Colliders, type Place, type Vec, type Wander,
} from "@/lib/world";
import { ripple } from "@/lib/ripple";
import { growthPulse, stageById } from "@/lib/growth";
import { FOLLOW, FOLLOWIDLE, canOfferFollow, followActive, followAdvance, followDrops, followEnd, followInterrupted, followMove, followOn, followOverride, followPose, followSpeed, followStart, followTarget, followRouteTo, homeGoal, chooseFocus, joiners, restSpot, clampPitch, cameraHeights, type FollowState } from "@/lib/follow";
import { PLAY, feedPose, feedPuffs, holdDone, holdProgress, strokePose, strokePuffs, type Puff } from "@/lib/play";
import { FORAGE, dropOffset, inReach, shimmer, sinceReady, spotReady } from "@/lib/forage";
import { canFidget, fidgetOffsets, fidgetOverride, seedFrom, seeded, startState, stepFidget, type FidgetState } from "@/lib/fidget";
import { NIGHT, fireflyAnchors, fireflyAt, fireflyLevel, mixPose, routeTo, sleepPhase, sleepPose, stretchPose, swirlPuffs, walkRoute } from "@/lib/night";
import { STANDING, canWalk, lerpPos, sitAdvance, sitFrame, sitToggle, sitWalkKey, SIT, type SitState } from "@/lib/sit";
import {
  POND, PONDIDLE, answerTo, arrived, bigSplashLanded, canPlayerSplash, canStartVisit, dropsAt, edgeNear, firstVisitDelay, maxDrops, nextVisitDelay, overrideState,
  phaseSeconds, playerGestureSeconds, playerLean, playerSplashLanded, pondAdvance, pondBusy, pondOverride, pondPose, pondStart, retryDelay,
  ringAt, ringCount, ringDelay, shorePoint, splashLife, splashSpot, tapsBetween, towardPond, type PondState, type Splash,
} from "@/lib/pond";
import { lookDelta } from "@/lib/touchControls";
import { MOBILE_ENABLED, perfStart, perfStep, renderSettings, touchMode, touchOverride } from "@/lib/touchInput";
import { SKIP, canSkip, handPoint, printWatches, skipFrame, skipLandings, skipPlan, skipWorld, watcherHop, type SkipPlan } from "@/lib/skip";
import {
  HIDE, HIDEIDLE, canFind, canStartGame, firstGameDelay, hideAdvance, hideAnchor, hideArrived, hideBusy, hideCancel, hideFound, hideOverride, hidePose, hidePuffs,
  hideStart, nextGameDelay, pickSpot, previewSpot, retryDelay as hideRetry, spotBehind, withSpot, type HideState,
} from "@/lib/hide";
import { hourOfDay, hourOverride, lerpColor, lightingAt } from "@/lib/daynight";
import {
  MARGINS, along, arrivalPath, arrivalYaw, buildField, gateFrame, gatePath, generateLayout, heightAt, holdStep, homePoint, glintOpacity, homePath, inGateZone, marginsOverrides, nearestSpot,
  pathLength, pointAlong, spotsForDay, spotsLeft, travelFrame, unfoldSeconds, utcDay, wipeOffset, type Field, type Layout, type Spot,
} from "@/lib/margins";
import { buildSpotsScene, type SpotsScene } from "@/components/spotsScene";
import { allSpotsForDay, nearestSpot as nearestWorldSpot, spotKey, spotsOverride, type WorldSpot } from "@/lib/worldSpots";
import { FOUND_EGG, QUIET, afterClaimsRead, foodOf, isLocalPreview, settleUnfold, unfoldView, type Outcome, type Shown } from "@/lib/margins-server";
import { COSMETIC_IDS, cosmeticOverride, cycleAt, lanternGlow, putOnFrame, putOnSeconds } from "@/lib/cosmetics";
import { scrapOverride, scrapsFor } from "@/lib/scraps";
import { dayScrapBits } from "@/lib/dayScraps";
import { DREAM, bedYaw, dreamAt, dreamLevel, dreamOverride } from "@/lib/dream";
import { buildDreamGlyph, type DreamGlyph } from "@/components/dreamGlyph";
import { buildDrizzle, type Drizzle } from "@/components/drizzle";
import { localDay, nextGlanceGap, startGlance, weatherAt, weatherLight, weatherOverride, WEATHER } from "@/lib/weather";
import { PALETTE } from "@/lib/palette";
import { dayNumber } from "@/lib/npcs";
import { buildGlyphScraps, type GlyphScraps } from "@/components/glyphScraps";
import { buildCosmetic, disposeCosmetic, poseCosmetic } from "@/lib/cosmeticsBuild";
import { WORLD, atOverride, chunkOf, nearbyCircles, withWorldColliders } from "@/lib/worldMap";
import { NOTICEIDLE, bugConfig, bugPreview, createBugSim, noticeTick, type NoticeState } from "@/lib/bugs";
import { buildBugScene } from "@/components/bugScene";
import { seeded as bugSeeded } from "@/lib/fidget";
import { PS_ENABLED, restoreFrom, restorePlayer, restorePrints, toLocal, type Ladder, type Offsets, type Saved, type Snap } from "@/lib/playerState";
import { MAP, newWalked, opensMap, reveal, storageKey, type Walked } from "@/lib/map";
import { loadWalked, saveWalkedCells } from "@/lib/mapStore";
import { HOME_ROOM, ROOM_OFF, doorArrival, doorPath, doorPosts, doorYaw, homeOverride, inDoorZone, roomColliders } from "@/lib/home";
import { groundLift, groundOn, groundY } from "@/lib/ground";
import { fogAt, regionFogOn } from "@/lib/regionFog";
import { featuresOn } from "@/lib/features";
import { groundInkOn } from "@/lib/groundInk";
import { sunFollow } from "@/lib/sunFollow";
import { SUN_SHADOW, shadowMapSize } from "@/lib/sunShadow";
import { cameraOnGround, keepAbove, shadowLift, smoothPivot } from "@/lib/groundCamera";
import { buildGardenDoor, buildHomeScene, type HomeScene } from "@/components/homeScene";
import { buildDecorScene, type DecorScene } from "@/components/decorScene";
import { nearestPlot, type Placed } from "@/lib/decor";
import { buildWorldShell, type WorldShell } from "@/components/worldShell";
import { buildSkyScene, type SkyScene } from "@/components/skyScene";
import { cloudsEnabled, hazeAt, hazeEnabled, hazeFog, hillsEnabled, moonPhase, skyEnabled, starsEnabled, zenithAt } from "@/lib/sky";
import { OFF, buildGate, buildMarginsScene, type MarginsScene } from "@/components/marginsScene";
import { READING, READING_ENABLED, READING_OFF, READING_SPOTS, doorArrival as readingArrival, doorPath as readingDoorPath, doorYaw as readingYaw, findLook, inDoorZone as inReadingDoor, levelFor, levelStep as readingLevelStep, marginsDoorCircles, nearestReadingSpot, openedFromKeys, previewKind, quietIfUnknown, readingOverride, roomColliders as readingColliders, roomWalkEnd, spotKey as readingSpotKey, type Look } from "@/lib/reading";
import { buildReadingDoor, buildReadingScene, type ReadingScene } from "@/components/readingScene";

export type EggPhase = "none" | "unclaimed" | "in-nest" | "daily";
type Props = {
  genes: Genes | null;
  prints?: PrintInfo[]; // S33: every owned Print; the one in `genes` is the focused one (card, feeding), the rest walk about the garden too
  focusId?: string | null;
  onFocus?: (id: string) => void; // the player walked up to another Print: the page makes it the focused one
  species?: string;
  stage?: string;
  eggPhase: EggPhase;
  onNearby: (place: Place | null) => void;
  onInteract: (place: Place) => void;
  onPrintNear: (near: boolean) => void;
  onFollow?: (mode: "off" | "can" | "on") => void; // come along: the walk-together prompt (can start / is walking)
  onFindable?: (found: boolean) => void; // the Print is hiding and within reach: E means "found"
  onCanSplash?: (ok: boolean) => void; // the pond can be splashed (day only)
  onStroke?: () => void; // a stroke started (the first-run guide counts them)
  onFeedPrint: () => void; // the hold finished: ask the server to feed
  fedTick?: number; // goes up each time a feed succeeded, to start the Print's reaction
  onGather?: (kind: string) => "ok" | "full"; // the page owns the pouch; the world only reports a walk-over
  onMargins?: (s: { inside: boolean; left: number; total: number; scraps: number }) => void; // the Margins row and scrap count
  canGather?: (kind: string) => boolean; // there is room in the pouch for a find
  onUnfold?: (spot: number, layoutDay: string) => Promise<Outcome>; // ask the server what is inside a page (it decides, not the client)
  onLoadOpened?: (day: string) => Promise<number[] | null>; // pages this player already opened today, from the server
  onMarginsNote?: (text: string) => void;
  onNpcTalk?: (line: { id: string; name: string; text: string; icons: string[]; last: boolean } | null) => void; // N1: the hint strip for the neighbour being talked to (null = closed)
  npcClose?: number; // N1: the page bumps this when "Thanks" closes the strip
  onWorldUnfold?: (region: string, spot: number, layoutDay: string) => Promise<Outcome>; // W5: ask the server what is inside a World spot
  onLoadWorldOpened?: (day: string) => Promise<string[] | null>; // W5: World spots this player already opened today (keys "region:spot")
  onSpotsOpened?: (points: { x: number; z: number }[]) => void; // W5: where today's opened spots are, for the map page
  onKeepsake?: (id: string) => void; // the server gave a keepsake: the page sets it as worn // a quiet line for a refusal or a found egg
  worn?: string | null; // the keepsake worn (6d-3 will pass the server's answer; nothing sends it yet)
  canOffer?: boolean; // something is in the pouch
  walkKey?: string | null; // whose map this browser keeps (W4); the walked cells never leave the browser
  mapOpen?: boolean; // the map page is showing: the loop reports where the player stands
  onHome?: () => void; // the player entered the Home room
  onZoneDone?: (zone: "garden" | "margins" | "home") => void; // (the Reading Room reports nothing: it has no chapter card) // S21: a door or gate crossing finished
  onMapKey?: () => void; // M was pressed
  onTravel?: (travelling: boolean) => void; // S35: a door or gate crossing is under way (the Print book stays shut)
  onGuidePose?: (pose: { x: number; z: number; yaw: number } | null) => void; // first-run guide: where the player is in the garden (null elsewhere)
  guideGlow?: boolean; // first-run guide: a faint glow on the egg spot
  onMapPose?: (walked: Walked, pose: { x: number; z: number; yaw: number } | null) => void;
  initialState?: Saved | null; // S36: where the player was last. Read once, when the world is made; a later change is ignored
  reportState?: (s: Snap, travelling: boolean) => void; // S36: where the player and the Prints stand, a few times a second, each zone in its own frame
  decorPlaced?: Placed | null; // the decorations by plot: from the server, or the ?decor=stub test ones (null = not shown)
  locked?: boolean; // a feed is in flight, or a panel is open: no new hold or stroke
};


// S26: paper-grain strength and tint are now parameters (grain default low-strength, warm ink rule by default),
// so the same canvas helper serves the ground (strong rule lines) and other surfaces (faint grain only).
function paperTexture(grainStrength = 0.35, tint = "#f4ecd6") {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = tint;
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = `rgba(120,140,170,${grainStrength})`;
  g.lineWidth = 2;
  for (let y = 32; y < 512; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.strokeStyle = `rgba(200,120,120,${grainStrength * 0.7})`;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(HOME.size / 8, HOME.size / 8);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// S26: ink/sepia toon gradient (3 warm bands) instead of the default smooth ramp, shared by every mat() call.
let gradientMapCache: THREE.DataTexture | null = null;
function gradientMap(): THREE.DataTexture {
  if (gradientMapCache) return gradientMapCache;
  const data = new Uint8Array([120, 120, 120, 255, 190, 190, 190, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  gradientMapCache = t;
  return t;
}
const mat = (color: number | string) => new THREE.MeshToonMaterial({ color, gradientMap: gradientMap() });

function buildTree(r: number) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo(r * 0.35, r * 0.5, 2.6, 8), mat(PALETTE.ink));
  trunk.position.y = 1.3;
  trunk.castShadow = true; trunk.receiveShadow = true; addOutline(trunk);
  g.add(trunk);
  const leaf = mat(PALETTE.moss);
  for (const [y, s] of [[3.0, 1.5], [3.9, 1.1], [4.6, 0.7]] as const) {
    const cone = new THREE.Mesh(crownGeo(s * r * 1.5, 1.6, `garden-tree-${y}`, 7), leaf);
    cone.position.y = y;
    cone.castShadow = true; cone.receiveShadow = true; addOutline(cone);
    g.add(cone);
  }
  return g;
}

// Pond ripples are animated from the render loop; buildPlace registers them here.
const ripples: { mesh: THREE.Mesh; offset: number }[] = [];

function buildPlace(p: Place): THREE.Object3D {
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  const paper = mat(PALETTE.paper), ink = mat(PALETTE.ink), stone = mat(PALETTE.inkSoft);
  switch (p.kind) {
    case "gate": {
      g.add(buildGate(gateFrame("garden").d));
      break;
    }
    case "egg": {
      const plinth = new THREE.Mesh(plinthGeo(0.8, 0.9, 0.5, 20), stone);
      plinth.position.y = 0.25;
      plinth.castShadow = true; plinth.receiveShadow = true; addOutline(plinth);
      const page = new THREE.Mesh(pageGeo(1.1, 0.04, 0.8), paper);
      page.position.y = 0.52;
      page.castShadow = true; page.receiveShadow = true; addOutline(page, undefined, PROP_EDGE_ANGLE);
      g.add(plinth, page);
      break;
    }
    case "nest": {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 8, 24), mat(PALETTE.gold));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.18;
      ring.castShadow = true; ring.receiveShadow = true; addOutline(ring);
      g.add(ring);
      break;
    }
    case "scenery": {
      const table = new THREE.Mesh(tableGeo(0.9, 0.7, 20), mat(PALETTE.sepia));
      table.position.y = 0.35;
      table.castShadow = true; table.receiveShadow = true; addOutline(table);
      const well = new THREE.Mesh(inkwellGeo(0.3, 0.25, 0.4, 3, 16), ink);
      well.position.y = 0.9;
      well.castShadow = true; well.receiveShadow = true; addOutline(well);
      g.add(table, well);
      break;
    }
    case "rest": {
      // An ink-blot bench with a soft cushion and a little pillow.
      const blot = new THREE.Mesh(blotGeo(1.1, 0.2, "garden-blot"), mat(PALETTE.ink));
      blot.scale.set(1.5, 0.3, 1);
      blot.position.y = 0.3;
      blot.castShadow = true; blot.receiveShadow = true; addOutline(blot);
      const cushion = new THREE.Mesh(blotGeo(0.9, 0.08, "garden-cushion"), mat(PALETTE.blush));
      cushion.scale.set(1.3, 0.28, 0.85);
      cushion.position.y = 0.62;
      cushion.castShadow = true; cushion.receiveShadow = true; addOutline(cushion);
      const pillow = new THREE.Mesh(pillowGeo(0.5, 0.18, 0.4), mat(PALETTE.paper));
      pillow.position.set(-0.7, 0.82, 0);
      pillow.rotation.set(0, 0.4, 0.25);
      pillow.castShadow = true; pillow.receiveShadow = true; addOutline(pillow, undefined, PROP_EDGE_ANGLE);
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
        const post = new THREE.Mesh(poleGeo(0.055, 0.065, 2, 6), mat(PALETTE.sepia));
        post.position.set(x, 1, 0);
        post.castShadow = true; post.receiveShadow = true; addOutline(post);
        g.add(post);
      }
      const board = new THREE.Mesh(plateGeo(1.8, 1.0, 0.08, 1.5), paper);
      board.position.y = 1.7;
      board.castShadow = true; board.receiveShadow = true; addOutline(board, undefined, PROP_EDGE_ANGLE);
      g.add(board);
      break;
    }
  }
  return g;
}

function buildPlayer() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 6, 12), mat(PALETTE.ink));
  body.position.y = 0.55;
  body.castShadow = true; body.receiveShadow = true; addOutline(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), mat("#f1e6cf"));
  head.position.y = 1.05;
  head.castShadow = true; head.receiveShadow = true; addOutline(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.3, 12), mat(PALETTE.ink));
  hat.position.y = 1.3;
  hat.castShadow = true; hat.receiveShadow = true; addOutline(hat);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), mat(PALETTE.ink));
  nose.position.set(0, 1.05, 0.2);
  g.add(body, head, hat, nose);
  return g;
}

export type PrintInfo = { id: string; genes: Genes; species: string; stage: string; worn: string | null };

export default function World({ genes, prints, focusId = null, onFocus, species = "blotling", stage = "blot", eggPhase, onNearby, onInteract, onPrintNear, onFeedPrint, onStroke, onFindable, onFollow, onCanSplash, fedTick = 0, locked = false, onGather, onMargins, canGather, onUnfold, onLoadOpened, onMarginsNote, onWorldUnfold, onLoadWorldOpened, onSpotsOpened, onKeepsake, worn = null, canOffer = true, walkKey = null, mapOpen = false, onMapKey, onTravel, onMapPose, onHome, onZoneDone, onGuidePose, guideGlow = false, decorPlaced = null, onNpcTalk, npcClose = 0, initialState, reportState }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const cb = useRef({ onFocus, onStroke, onNpcTalk, onNearby, onInteract, onPrintNear, onFeedPrint, onGather, onFindable, onFollow, onCanSplash, onMargins, canGather, onUnfold, onLoadOpened, onMarginsNote, onWorldUnfold, onLoadWorldOpened, onSpotsOpened, onKeepsake, onMapKey, onTravel, onMapPose, onHome, onZoneDone, onGuidePose, reportState });
  cb.current = { onFocus, onStroke, onNpcTalk, onNearby, onInteract, onPrintNear, onFeedPrint, onGather, onFindable, onFollow, onCanSplash, onMargins, canGather, onUnfold, onLoadOpened, onMarginsNote, onWorldUnfold, onLoadWorldOpened, onSpotsOpened, onKeepsake, onMapKey, onTravel, onMapPose, onHome, onZoneDone, onGuidePose, reportState };
  // Latest props for the render loop, which is created once.
  const live = useRef({ prints, focusId, npcClose, genes, eggPhase, stage, species, locked, canOffer, worn, mapOpen, walkKey, decorPlaced, guideGlow });
  live.current = { prints, focusId, npcClose, genes, eggPhase, stage, species, locked, canOffer, worn, mapOpen, walkKey, decorPlaced, guideGlow };
  // When the server accepts a feed the Print reacts. The loop reads this time stamp.
  const reactAt = useRef(-1);
  const seenTick = useRef(fedTick);
  useEffect(() => {
    if (fedTick !== seenTick.current) { seenTick.current = fedTick; reactAt.current = performance.now(); }
  }, [fedTick]);
  const rebuild = useRef<() => void>(() => {});
  const printsKey = (prints ?? []).map((q) => `${q.id}|${q.species}|${q.stage}|${q.worn ?? ""}|${q.genes.hue}|${q.genes.shape}|${q.genes.parts.join(",")}`).join(";");
  useEffect(() => { rebuild.current(); }, [genes, eggPhase, stage, species, guideGlow, printsKey, focusId]);

  useEffect(() => {
    const el = mount.current!;
    const cols = colliders();
    cols.circles.push(...doorPosts("garden")); // the posts of the Home door (the Print goes round them like any prop)
    const scene = new THREE.Scene();
    // Light follows the player's local clock (data/daynight.json); ?hour=21 previews a time of day.
    // S24: ?dream=1|off (dev only) previews the sleeping Print at the bed; without ?hour= it sets the hour to night.
    const dreamMode = dreamOverride(window.location.search, process.env.NODE_ENV === "production");
    const override = hourOverride(window.location.search) ?? (dreamMode ? DREAM.preview.hour : null);
    // S25: ?weather=1|off (dev only) forces the ink drizzle on or off; otherwise the local date and hour decide. Garden only.
    const weatherMode = weatherOverride(window.location.search, process.env.NODE_ENV === "production");
    const weatherReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const weatherNow = (h: number) => weatherAt(dayNumber(localDay(new Date())) ?? 0, h, weatherReduced, weatherMode);
    const h0 = override ?? hourOfDay(new Date());
    const L0 = weatherLight(lightingAt(h0), weatherNow(h0).tint);
    scene.background = new THREE.Color(L0.sky);
    scene.fog = new THREE.Fog(L0.fog, WORLD.fog[0], WORLD.fog[1]);
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, WORLD.cameraFar);
    const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
    // S37: with the flag off or on a desktop these are exactly today's numbers; a phone gets the lower ratio and the basic shadow filter.
    const touchOv = touchOverride(window.location.search, process.env.NODE_ENV === "production").touch;
    let touchRender = false;
    try { touchRender = touchOv ?? touchMode(window.matchMedia("(pointer: coarse)").matches, navigator.maxTouchPoints ?? 0, MOBILE_ENABLED); } catch { touchRender = false; }
    const RS = renderSettings(touchRender, window.devicePixelRatio);
    renderer.setPixelRatio(RS.pixelRatio);
    renderer.setSize(el.clientWidth, el.clientHeight);
    // S26: one soft shadow pass. The sun casts; the ground and the Print receive. No new objects.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = RS.shadowType === "basic" ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(L0.hemisphereSky, L0.hemisphereGround, L0.hemisphereIntensity);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(L0.sun, L0.sunIntensity);
    sun.position.set(...L0.sunPosition);
    sun.castShadow = true;
    const SM = shadowMapSize(touchRender, RS.shadowMap); sun.shadow.mapSize.set(SM, SM);
    sun.shadow.camera.near = SUN_SHADOW.near;
    sun.shadow.camera.far = SUN_SHADOW.far;
    sun.shadow.camera.left = -SUN_SHADOW.half;
    sun.shadow.camera.right = SUN_SHADOW.half;
    sun.shadow.camera.top = SUN_SHADOW.half;
    sun.shadow.camera.bottom = -SUN_SHADOW.half;
    sun.shadow.bias = SUN_SHADOW.bias;
    scene.add(sun); scene.add(sun.target);
    let sunOff: readonly [number, number, number] = L0.sunPosition as [number, number, number];

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(HOME.size, HOME.size),
      new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
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
      const m = new THREE.Mesh(hedgeGeo(h.w, 1.1, h.d, `garden-hedge-${h.x}-${h.z}`), mat(PALETTE.moss));
      m.position.set(h.x, 0.55, h.z);
      m.castShadow = true; m.receiveShadow = true; addOutline(m, undefined, PROP_EDGE_ANGLE);
      scene.add(m);
    }
    for (const p of GARDEN.places) scene.add(buildPlace(p));

    const player = buildPlayer();
    scene.add(player);
    player.rotation.y = Math.PI; // start facing away from the camera
    let pos = { x: GARDEN.player.start[0], z: GARDEN.player.start[1] };
    let yaw = dreamMode ? bedYaw({ x: pos.x, z: pos.z }, NIGHT.bed) : 0; // S25 follow-up: ?dream= starts with the camera facing the bed (dev only)
    let pitch = GARDEN.camera.pitch;
    let camPos = new THREE.Vector3();
    let camInit = false;
    let camPivot = 0; // H3: smoothed ground height under the player (ground flag on only)

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
    let travel: null | { into: "margins" | "garden" | "home" | "reading"; from: "garden" | "margins" | "home" | "reading"; start: number; walk: { x: number; z: number }[]; arrive: { x: number; z: number }[]; swapped: boolean } = null;
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
    // N1/N2: the neighbours of the Margins (the Binder, the Proof-reader). Trouble with one neighbour's data or shapes skips only that one.
    type Live = { npc: Npc; scene: NpcScene; at: Vec & { face: number }; note: Notice; talk: Talk; t: number };
    let live_npcs: Live[] = [], npcClosed = live.current.npcClose;
    const closeNpcTalk = (n: Live, tell = true) => { if (n.talk.open) { n.talk = closeTalk(n.talk); if (tell) cb.current.onNpcTalk?.(null); } };
    const rebuildNpcCols = () => { if (mLayout) mCols = { circles: [...mLayout.cols.circles, ...live_npcs.map((n) => ({ x: n.at.x, z: n.at.z, r: n.npc.radius }))], boxes: mLayout.cols.boxes }; };
    const buildNpcsIn = () => {
      live_npcs = [];
      for (const npc of NPCS) {
        try {
          const at = npcSpot(npc, mDay);
          if (npc.spots && !npcSpotUsable(at, npc.radius, mLayout?.cols, live_npcs.map((o) => ({ x: o.at.x, z: o.at.z, r: o.npc.radius })))) continue; // a bad day's spot: skip her today
          const scene = buildNpc(npc);
          scene.group.position.set(at.x, 0, at.z);
          if (mg) mg.group.add(scene.group);
          live_npcs.push({ npc, scene, at, note: NOTICE0, talk: TALK0, t: 0 });
        } catch { /* skip only this neighbour */ }
      }
      rebuildNpcCols();
    };
    // T1: tonight's sights in the Margins (looks only). Trouble building them skips them; the world loads.
    let sights: SightScene | null = null, sightLvl = 0;
    const buildSightsIn = () => {
      try {
        sights = null;
        if (!SIGHTS || !mLayout || !mg) return;
        const L = mLayout, sp = mSpots.map((q) => ({ x: q.x, z: q.z })), np = live_npcs.map((n) => ({ x: n.at.x, z: n.at.z }));
        for (const n of NPCS) for (const s of n.spots ?? []) np.push({ x: s.at[0], z: s.at[1] });
        const tonight = sightsForDay(mDay, L, sp, np, SIGHTS);
        sightLvl = sightLevel(hourNow, SIGHTS.window); // already the right level on arrival; only a moving clock fades
        sights = buildSights(tonight, (x, z) => heightAt(x, z, L.hills));
        mg.group.add(sights.group);
      } catch { sights = null; }
    };
    const dropSights = () => { try { sights?.dispose(); } catch { /* nothing */ } sights = null; };
    // T2: tonight's sights on Pressmark Shore (looks only), built with the World shell and freed with it. The shore is flat, so they sit at 0.
    let shoreSights: SightScene | null = null, shoreLvl = 0;
    const buildShoreSights = () => {
      try {
        if (shoreSights || !SHORE_SIGHTS) return;
        shoreLvl = sightLevel(hourNow, SHORE_SIGHTS.window); // already the right level on arrival; only a moving clock fades
        shoreSights = buildSights(shoreSightsForDay(utcDay(new Date()), SHORE_SIGHTS), groundHeight ? groundY : () => 0, SHORE_SIGHTS);
        scene.add(shoreSights.group);
      } catch { shoreSights = null; }
    };
    // S23: glyph scraps, scenery only. Built with the garden, freed when it is left; ?scraps=near|many|off is dev only.
    const scrapMode = scrapOverride(window.location.search, process.env.NODE_ENV === "production");
    let glyphScraps: GlyphScraps | null = null, dayScraps: GlyphScraps | null = null;
    const showScraps = () => {
      if (glyphScraps) return;
      if (scrapMode !== "off") { try { dayScraps = buildGlyphScraps(dayScrapBits(utcDay(new Date())), 1, groundHeight ? groundY : undefined); scene.add(dayScraps.group); } catch { dayScraps = null; } } // the day's scraps across the World (looks only)
      try { const f = scrapsFor(scrapMode); glyphScraps = buildGlyphScraps(f.bits, f.scale); scene.add(glyphScraps.group); } catch { glyphScraps = null; }
    };
    const dropScraps = () => { try { if (dayScraps) scene.remove(dayScraps.group); dayScraps?.dispose(); } catch { /* nothing */ } dayScraps = null; try { if (glyphScraps) scene.remove(glyphScraps.group); glyphScraps?.dispose(); } catch { /* nothing */ } glyphScraps = null; };
    // S24: the dream glyph, one plane. Built with the garden, freed when it is left. Look only.
    let dreamGlyph: DreamGlyph | null = null, dreamLvl = 0, dreamSet = false;
    // S25: the ink drizzle, one line object. Built with the garden, freed when it is left. Look only.
    let drizzle: Drizzle | null = null, glanceWait = nextGlanceGap(0.5, weatherMode === "on");
    const showDrizzle = () => { if (drizzle) return; try { drizzle = buildDrizzle(scene); } catch { drizzle = null; } };
    const dropDrizzle = () => { try { drizzle?.dispose(); } catch { /* nothing */ } drizzle = null; };
    const showDream = () => { if (dreamGlyph) return; try { dreamGlyph = buildDreamGlyph(scene); } catch { dreamGlyph = null; } };
    const dropDream = () => { try { dreamGlyph?.dispose(); } catch { /* nothing */ } dreamGlyph = null; dreamLvl = 0; };
    const dropShoreSights = () => { try { shoreSights?.dispose(); } catch { /* nothing */ } shoreSights = null; };
    // Night sights in Paper Downs, Inkwood and Glyph Quarter: the shore pattern again, one scene per region (looks only).
    const regionSights = new Map<string, SightScene>(); let regionLvl = 0;
    const buildRegionSights = () => {
      for (const r of SIGHT_REGIONS) {
        try {
          const d = REGION_SIGHTS[r]; if (!d || regionSights.has(r)) continue;
          regionLvl = sightLevel(hourNow, d.window);
          const sc = buildSights(regionSightsForDay(utcDay(new Date()), r, d), groundHeight ? groundY : () => 0, d);
          scene.add(sc.group); regionSights.set(r, sc);
        } catch { /* this region's sights are skipped; the world loads */ }
      }
    };
    const dropRegionSights = () => { for (const sc of regionSights.values()) { try { sc.dispose(); } catch { /* nothing */ } } regionSights.clear(); };
    const dropNpc = (n: Live) => { closeNpcTalk(n); n.scene.dispose(); live_npcs = live_npcs.filter((o) => o !== n); rebuildNpcCols(); };
    const dropNpcs = () => { for (const n of [...live_npcs]) closeNpcTalk(n); for (const n of live_npcs) n.scene.dispose(); live_npcs = []; if (mLayout) mCols = mLayout.cols; };
    const wipe = document.createElement("div");
    wipe.className = "page-wipe";
    wipe.style.display = "none";
    el.appendChild(wipe);
    // S31a: the sky dome (and, in the garden, the sun and moon). Built on entering the garden or the Margins, freed on leaving. Home has none.
    const skyPhase = moonPhase(localDay(new Date())); // the moon's phase for the local calendar day
    const skyOn = skyEnabled(window.location.search, process.env.NODE_ENV === "production");
    const starsOn = starsEnabled(window.location.search, process.env.NODE_ENV === "production"); // none in the Margins (a page) or Home (a room)
    const groundHeight = groundOn(window.location.search, process.env.NODE_ENV === "production"); // H1: ground height in the World; off = flat as before
    const regionFog = regionFogOn(window.location.search, process.env.NODE_ENV === "production"); // E1: fog by region in the World; off = the one global fog as before
    const inkOn = groundInkOn(window.location.search, process.env.NODE_ENV === "production"); // ink on the land; off = the plain ground material
    const featuresDrawn = featuresOn(window.location.search, process.env.NODE_ENV === "production"); // E3: authored groves, belts and rows; off = the scatter alone, as before
    const lift = (x: number, z: number): number => groundLift(groundHeight && zones.is("garden"), x, z); // H4: Prints stand on the World's ground; 0 with the switch off or outside the garden
    const hillsOn = hillsEnabled(window.location.search, process.env.NODE_ENV === "production"); // S31c: layered hills; off = the old ridges
    let skyScene: SkyScene | null = null;
    const cloudsOn = cloudsEnabled(window.location.search, process.env.NODE_ENV === "production"); // S31d: none in the Margins or Home
    const hazeOn = hazeEnabled(window.location.search, process.env.NODE_ENV === "production"); // S31e: haze in the garden; off = today's fog exactly
    const showSky = (margins: boolean) => { if (!skyOn || skyScene) return; try { skyScene = buildSkyScene(scene, { bodies: !margins, margins, stars: !margins && starsOn, clouds: !margins && cloudsOn }); lightClock = 0; } catch { skyScene = null; } };
    const dropSky = () => { try { skyScene?.dispose(); } catch { /* nothing */ } skyScene = null; };
    let rdoor: { group: THREE.Group; dispose(): void } | null = null;
    const ensureMarginsLayout = (): { layout: Layout; field: Field } => { if (!mLayout || !mField) { mLayout = generateLayout(); if (READING_ENABLED) mLayout.cols.circles.push(...marginsDoorCircles()); mField = buildField(mLayout.cols); mCols = mLayout.cols; } return { layout: mLayout, field: mField }; }; // the Reading Room door posts are solid (only when the room is on)
    const enterMarginsZone = () => {
      dropSky(); showSky(true); // the garden dome (with sun and moon) is swapped for the Margins one
      const { layout: mLay, field: mFld } = ensureMarginsLayout();
      mg = buildMarginsScene(mLay);
      scene.add(mg.group);
      if (READING_ENABLED) { try { rdoor = buildReadingDoor(); mg.group.add(rdoor.group); } catch { rdoor = null; } } // the door is a look; trouble building it skips only the door
      mDay = mo.day ?? utcDay(new Date()); // the day is fixed for the whole visit
      mSpots = spotsForDay(mDay, mLay, mFld);
      opened = openedByDay.get(mDay) ?? new Set<number>();
      openedByDay.set(mDay, opened);
      mg.setSpots(mSpots, opened);
      buildNpcsIn();
      buildSightsIn();
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
      dropSky();
      dropNpcs();
      dropSights();
      try { rdoor?.dispose(); } catch { /* nothing */ } rdoor = null;
      if (mg) { scene.remove(mg.group); mg.dispose(); mg = null; } // freed on every leave: no growing memory
      if (cosFoundAway) { cosFoundAway = false; cosHold = performance.now() + 900; cosPlayUntil = performance.now() + 4500; } // plays once, after the page-turn has cleared
      mSpots = []; mActive = null; uHold = 0; uSpot = null; uPending = false; visit++; // a call still in flight is settled when its answer arrives (see below)
    };
    // W5: today's spots across the World. Where they lie comes from the day alone; what is inside comes from the server.
    const spotsOff = spotsOverride(window.location.search, process.env.NODE_ENV === "production") === "off" || local; // dev previews never touch the server
    let sc: SpotsScene | null = null, wSpots: WorldSpot[] = [], wDay = "", wOpened = new Set<string>();
    const wOpenedByDay = new Map<string, Set<string>>(), wHeld = new Map<string, Shown>(); // held: food the server gave while the pouch was full (this visit only)
    let wHold = 0, wCand: WorldSpot | null = null, wPending = false, wBlocked = false, wReady = false, wFailed = false, wQuiet = false, wNoted = false, wVisit = 0, wReportKey = "";
    const reportSpots = () => {
      const k = `${wOpened.size}|${wSpots.length}`;
      if (k === wReportKey) return;
      wReportKey = k;
      cb.current.onSpotsOpened?.(wSpots.filter((q) => wOpened.has(spotKey(q.region, q.id))).map((q) => ({ x: q.x, z: q.z })));
    };
    const startSpots = () => {
      buildShoreSights(); // T2: the shore sights come and go with the spots (built once per stay)
      buildRegionSights();
      if (spotsOff || sc) return;
      wDay = utcDay(new Date()); // fixed for this stay in the garden; a new day is laid out on the next return
      wSpots = allSpotsForDay(wDay);
      sc = buildSpotsScene(wSpots, groundHeight ? groundY : undefined); scene.add(sc.group);
      wOpened = wOpenedByDay.get(wDay) ?? new Set<string>(); wOpenedByDay.set(wDay, wOpened);
      sc.setOpened(wOpened);
      wHold = 0; wCand = null; wPending = false; wBlocked = false; wQuiet = false; wReady = false; wFailed = false; wNoted = false;
      const my = ++wVisit;
      Promise.resolve(cb.current.onLoadWorldOpened ? cb.current.onLoadWorldOpened(wDay) : null).catch(() => null).then((rows) => {
        if (my !== wVisit || !sc) return;
        if (rows === null) { wFailed = true; return; } // a failed read keeps the ring from running; the next return reads again
        for (const k of rows) wOpened.add(k);
        wReady = true; sc.setOpened(wOpened); reportSpots();
      });
      reportSpots();
    };
    const stopSpots = () => { dropScraps(); dropDream(); dropDrizzle(); dropShoreSights(); dropRegionSights(); wVisit++; sc?.dispose(); sc = null; wSpots = []; wCand = null; wHold = 0; wPending = false; wReportKey = ""; };
    // W2: the World round the garden belongs to the garden zone: built on entering it, freed on leaving it.
    let shell: WorldShell | null = null;
    let gdoor: HomeScene | null = null;
    const showShell = () => { showSky(false); if (!gdoor) { gdoor = buildGardenDoor(); scene.add(gdoor.group); } if (!shell) { shell = buildWorldShell(scene, { hills: hillsOn, ground: groundHeight, features: featuresDrawn, groundInk: inkOn }); shell.update(pos.x, pos.z, true); shell.setSky((scene.background as THREE.Color)); } showDream(); showDrizzle(); showScraps(); startSpots(); };
    const enterGardenZone = () => { showShell(); (scene.fog as THREE.Fog).near = WORLD.fog[0]; (scene.fog as THREE.Fog).far = WORLD.fog[1]; lightClock = 0; report(); };
    const leaveGardenZone = () => { stopSpots(); shell?.dispose(); shell = null; gdoor?.dispose(); gdoor = null; };
    // H2: the Home room. Built on entering, freed on leaving; fixed soft daylight inside (no day and night clock in the room).
        let room: HomeScene | null = null;
    let decor: DecorScene | null = null, decorShown: Placed | null = null; // ?decor=stub only; built with the room, freed with it
    const roomCols = roomColliders();
    const enterHomeZone = () => {
      dropSky(); // a room has no sky
      room = buildHomeScene(); room.group.position.x = ROOM_OFF; scene.add(room.group);
      if (live.current.decorPlaced) { decor = buildDecorScene(); room.group.add(decor.group); decorShown = live.current.decorPlaced; decor.snap(decorShown); }
      (scene.fog as THREE.Fog).near = HOME_ROOM.light.fog[0]; (scene.fog as THREE.Fog).far = HOME_ROOM.light.fog[1];
      lightClock = 0; report(); cb.current.onHome?.(); // the page claims and reads the Home decorations (once per sign-in)
    };
    const leaveHomeZone = () => { decor?.dispose(); decor = null; decorShown = null; room?.dispose(); room = null; };
    // S34: the Reading Room. Built on entering, freed on leaving; fixed soft light inside (no sky and no clock), like the Home room.
    const rPreview = readingOverride(window.location.search, process.env.NODE_ENV === "production"); // dev only: ?reading=1 / ?reading=reduced
    let rd: ReadingScene | null = null, rDay = "", rOpened = new Set<number>();
    const rOpenedByDay = new Map<string, Set<number>>(), rHeld = new Map<string, Look>(); // held: food the server gave while the pouch was full (this visit only)
    let rActive: { id: number; since: number; look: Look } | null = null, rHold = 0, rCand: (typeof READING_SPOTS)[number] | null = null;
    let rPending = false, rBlocked = false, rReady = false, rFailed = false, rQuiet = false, rNoted = false, rVisit = 0, rLevel = 0, rPrev = 0;
    const rCols = readingColliders();
    let rGrant: { food: "ink" | "glyph" | null; egg: boolean } | null = null, rPreviewN = 0;
    const rGive = () => { const g = rGrant; rGrant = null; if (!g) return; if (g.food) cb.current.onGather?.(g.food); if (g.egg) cb.current.onMarginsNote?.(FOUND_EGG); }; // what the server gave, handed over once
    const enterReadingZone = () => {
      dropSky(); // a room has no sky
      try { rd = buildReadingScene(); rd.group.position.x = READING_OFF; scene.add(rd.group); } catch { rd = null; }
      (scene.fog as THREE.Fog).near = READING.light.fog[0]; (scene.fog as THREE.Fog).far = READING.light.fog[1];
      rDay = utcDay(new Date()); // fixed for the whole visit
      rOpened = rOpenedByDay.get(rDay) ?? new Set<number>(); rOpenedByDay.set(rDay, rOpened);
      rActive = null; rHold = 0; rCand = null; rPending = false; rBlocked = false; rQuiet = false; rNoted = false; rFailed = false;
      rLevel = levelFor(hourNow, !!rPreview); // already the right level on arrival; only a moving clock fades
      rd?.setOpened(rOpened);
      const my = ++rVisit;
      rReady = !!rPreview; // the dev preview never touches the server
      if (!rPreview) {
        // What this player already opened today comes from the server, so a reload cannot reroll a page.
        Promise.resolve(cb.current.onLoadWorldOpened ? cb.current.onLoadWorldOpened(rDay) : null).catch(() => null).then((keys) => {
          if (my !== rVisit || !zones.is("reading")) return;
          if (keys === null) { rFailed = true; return; } // a failed read keeps the ring from running; the next entry reads again
          for (const n of openedFromKeys(keys)) rOpened.add(n);
          rReady = true; rd?.setOpened(rOpened);
        });
      }
      lightClock = 0; report();
    };
    const leaveReadingZone = () => { rVisit++; rGive(); rActive = null; rHold = 0; rCand = null; rPending = false; try { rd?.dispose(); } catch { /* nothing */ } rd = null; }; // a call still in flight is settled when its answer arrives
    // The one enter/leave path (W1): the garden is the home zone; each other zone builds and frees its own scene objects.
    const zones = createZoneController([
      { id: "garden", enter: enterGardenZone, leave: leaveGardenZone },
      { id: "margins", enter: enterMarginsZone, leave: leaveMarginsZone },
      { id: "home", enter: enterHomeZone, leave: leaveHomeZone },
      { id: "reading", enter: enterReadingZone, leave: leaveReadingZone },
    ]);
    const GARDEN_DOOR: Place = { id: "door-home", kind: "door", x: 0, z: 0, label: "Door", prompt: "Go through the door" };
    const ROOM_DOOR: Place = { id: "door-garden", kind: "door", x: 0, z: 0, label: "Door", prompt: "Back to the garden" };
    const offOf = (z: "garden" | "margins" | "home" | "reading") => (z === "margins" ? OFF : z === "home" ? ROOM_OFF : z === "reading" ? READING_OFF : 0);
    const startTravel = (into: "margins" | "garden" | "home" | "reading", from: { x: number; z: number }) => {
      if (travel) return;
      const fromZone = zones.current, fo = offOf(fromZone), io = offOf(into);
      const local = { x: from.x - fo, z: from.z };
      // the walk through the gate or door you are at, then the arrival on the far side (each in its own zone's coordinates)
      const walk = (fromZone === "reading" ? readingDoorPath(local, "room") : into === "reading" ? readingDoorPath(local, "margins") : fromZone === "home" ? doorPath(local, "room") : into === "home" ? doorPath(local, "garden") : gatePath(local, into === "margins" ? "garden" : "home")).map((q) => ({ x: q.x + fo, z: q.z }));
      const arrive = (into === "reading" ? readingArrival("reading") : fromZone === "reading" ? readingArrival("margins") : into === "home" ? doorArrival("home") : fromZone === "home" ? doorArrival("garden") : arrivalPath(into)).map((q) => ({ x: q.x + io, z: q.z }));
      travel = { into, from: fromZone, start: performance.now(), walk, arrive, swapped: false };
      cb.current.onTravel?.(true);
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
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshBasicMaterial({ color: sp.kind === "ink" ? PALETTE.watercolorBlue : PALETTE.gold, transparent: true, opacity: 0.7, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2;
      glow.position.y = 0.02;
      g.add(glow);
      let body: THREE.Mesh;
      if (sp.kind === "ink") {
        body = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), new THREE.MeshToonMaterial({ color: "#2b2a33" }));
        body.rotation.x = -Math.PI / 2;
        body.position.y = 0.04;
      } else {
        body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshToonMaterial({ color: PALETTE.watercolorBlue, gradientMap: gradientMap() }));
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
    // S32: bug watching. With bugWatching.enabled false createBugSim returns null: nothing is built, no loop work, no glance.
    const bugPrev = bugPreview(window.location.search, process.env.NODE_ENV === "production");
    const bugSim = createBugSim(bugConfig(bugPrev));
    const bugScene = bugSim ? buildBugScene(bugSim.cfg) : null;
    if (bugScene) scene.add(bugScene.group);
    const bugReduced = bugPrev === "reduced";
    let bugNotice: NoticeState = NOTICEIDLE, bugGlance = -1, bugGlanceK = 0;
    const bugRoll = bugSeeded(0x5eed32);
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
    let pgStart = -1, pgLanded = false, pgSkip = false;
    // Page-skipping (lib/skip.ts): one folded page at a time, built on the throw and disposed when it has soaked in.
    let sk: { plan: SkipPlan; start: number; from: Vec; hand: { along: number; side: number }; landed: number; cancelAt: number; mesh: THREE.Group | null } | null = null;
    let skAge = -1, skAt: Vec | null = null;
    const endSkip = () => {
      if (!sk) return;
      if (sk.mesh) {
        scene.remove(sk.mesh);
        sk.mesh.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); if (m.material) (m.material as THREE.Material).dispose(); });
      }
      for (let i = splashes.length - 1; i >= 0; i--) if (splashes[i].ringOnly) splashes.splice(i, 1); // no ring is left behind
      sk = null; skAge = -1; skAt = null;
    };
    const buildPage = () => {
      const g = new THREE.Group();
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute([-0.17, 0.035, -0.12, 0, 0, -0.12, 0.17, 0.035, -0.12, -0.17, 0.035, 0.12, 0, 0, 0.12, 0.17, 0.035, 0.12], 3));
      geo.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5]);
      geo.computeVertexNormals();
      const paper = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xf6efe0, side: THREE.DoubleSide, transparent: true }));
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), new THREE.LineBasicMaterial({ color: 0x2b3560, transparent: true }));
      g.add(paper, edge);
      g.renderOrder = 4;
      return g;
    };
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
    const addSplash = (x: number, z: number, big: boolean, at: number, ringOnly = false) => {
      splashes.push({ start: at, x, z, big, ringOnly });
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
    // Come along: by day the Print walks with the player (lib/follow.ts). Client only, nothing stored.
    let followS: FollowState = FOLLOWIDLE, followWant = false, followMoving = false, followRoute: Vec[] = [], followLeg = 0, followRouteAt = -1, followShown: "off" | "can" | "on" = "off";
    let followPreview = followOverride(window.location.search, process.env.NODE_ENV === "production") !== null;
    let followHead = 0, followLast: Vec | null = null;
    let holdStart = -1;
    let strokeStart = -1;
    let strokeEnd = -1;
    let wander: Wander | null = null;
    let printMesh: THREE.Group | null = null;
    // S33: every other owned Print walks about too (a light version of the focused one's life). Client only, nothing stored.
    type Walk = { route: Vec[]; leg: number; at: number };
    type Other = { id: string; idx: number; mesh: THREE.Group; w: Wander; base: number; joined: boolean; slot: number; walk: Walk };
    let others: Other[] = [];
    const wanderBy = new Map<string, Wander>();
    let primaryId: string | null = null, swapped = false, focusAsked: string | null = null;
    const homeWalk: Walk = { route: [], leg: 0, at: -1 };
    // Idle fidgets (lib/fidget.ts): small additive offsets on the standing Print; none when it is busy. Client only, nothing saved.
    const fidgetPick = fidgetOverride(window.location.search, process.env.NODE_ENV === "production");
    let fidgetRng = seeded(1), fidgetS: FidgetState = startState(fidgetRng, fidgetPick), fidgetYaw = 0, fidgetEyes: THREE.Object3D[] = [], fidgetBlinked = false;
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
    const shapesMode = shapesOverride(window.location.search, process.env.NODE_ENV === "production"); // dev-only before/after and gallery stills
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const eggSpot = GARDEN.places.find((p) => p.kind === "egg")!;
    const nest = GARDEN.places.find((p) => p.kind === "nest")!;
    // S36: where to start from, if anything. A dev preview start (?area= ?unfold= ?gate= ?reading= ?at=) always wins; the kill switch and ?nosave=1 arrive here as no record.
    const devStart = !!(rPreview && READING_ENABLED) || homeOverride(window.location.search, process.env.NODE_ENV === "production") || !!mo.area || !!mo.unfold || !!mo.gate || !!atOverride(window.location.search, process.env.NODE_ENV === "production");
    const restore = restoreFrom(PS_ENABLED, initialState, devStart);
    if (restore) { // the Prints start where they stood (garden frame), wandering: never seated, hiding, at the pond or walking along. Bedtime, if it is night, takes them as it does on any reload.
      try { for (const [id, w] of restorePrints(restore.prints, (q) => withWorldColliders(cols, nearbyCircles(chunkOf(q.x), chunkOf(q.z))), GARDEN.print.radius)) wanderBy.set(id, w); } catch { /* start as today */ }
    }
    rebuild.current = () => {
      for (const c of [...dynamic.children]) disposeTree(c); // frees the old Print/egg and their ink outlines
      dynamic.clear();
      const { genes: g, eggPhase: phase, stage: st, species: spId } = live.current;
      for (const o of others) wanderBy.set(o.id, o.w);
      others = [];
      printMesh = null;
      if (g) {
        const sd = stageById(st);
        printMesh = (shapesMode === "old" ? buildCreatureOld : buildCreature)(g, { partsShown: sd.partsShown, mark: sd.mark }, spId);
        baseScale = GARDEN.print.scale * sd.scale;
        printMesh.scale.setScalar(baseScale);
        fidgetEyes = []; printMesh.traverse((o) => { if (o.userData.eye) fidgetEyes.push(o); });
        fidgetYaw = 0; fidgetBlinked = false;
        fidgetRng = seeded(seedFrom(`${spId}|${g.hue}|${g.shape}|${g.parts.join(",")}`)); fidgetS = startState(fidgetRng, fidgetPick);
        if (shownStage !== null && shownStage !== st) pulseStart = performance.now();
        shownStage = st;
        dynamic.add(printMesh);
        if (shapesMode === "gallery") { // dev still: every shape in both bodies, new on the near row and old behind, with all parts
          for (const [row, build] of [[0, buildCreature], [1, buildCreatureOld]] as const) {
            ["round", "tall", "wide"].forEach((shape, i) => {
              for (const [col, sp] of ["blotling", "leaflet"].entries()) {
                const m = build({ hue: g.hue, shape: shape as Genes["shape"], parts: ["ears", "tail", "fins", "tabs", "fold", "spine"] }, { partsShown: 99, mark: "leaf" }, sp);
                m.scale.setScalar(baseScale);
                m.position.set(nest.x - 3.2 + i * 2.2 + col * 7, 0, nest.z + 4 + row * 3);
                dynamic.add(m);
              }
            });
          }
        }
        attachCos(cosId); // a rebuild keeps what is worn, with no motion
        const pid = live.current.focusId ?? "_";
        if (wander && primaryId) wanderBy.set(primaryId, wander);
        if (primaryId !== null && primaryId !== pid) { swapped = true; focusAsked = null; }
        primaryId = pid;
        wander = wanderBy.get(pid) ?? wander ?? newWander({ x: nest.x, z: nest.z + 2 });
      }
      if (g) {
        let n = 0;
        for (const q of live.current.prints ?? []) {
          if (q.id === (live.current.focusId ?? "_")) continue;
          const sd = stageById(q.stage);
          const mesh = buildCreature(q.genes, { partsShown: sd.partsShown, mark: sd.mark }, q.species);
          const base = GARDEN.print.scale * sd.scale;
          mesh.scale.setScalar(base);
          const cos = buildCosmetic(q.worn, q.species, q.genes.shape);
          if (cos) { mesh.add(cos); poseCosmetic(cos, 1, 1, 0); }
          dynamic.add(mesh);
          const side = n % 2 ? 1 : -1;
          const w = wanderBy.get(q.id) ?? newWander({ x: nest.x + side * (1.8 + 0.9 * Math.floor(n / 2)), z: nest.z + 2 + (n % 3) });
          mesh.position.set(w.x, lift(w.x, w.z), w.z);
          others.push({ id: q.id, idx: n, mesh, w, base, joined: false, slot: 0, walk: { route: [], leg: 0, at: -1 } });
          n++;
        }
      }
      if (phase !== "none") {
        const egg = buildEgg();
        const at = phase === "in-nest" ? nest : eggSpot;
        egg.position.set(at.x, (phase === "in-nest" ? 0.2 : 0.55) + 0.57 * 0.6, at.z);
        egg.scale.multiplyScalar(0.6);
        dynamic.add(egg);
        if (phase === "unclaimed" && live.current.guideGlow) { // first-run guide: a faint, still halo on the egg spot
          const halo = new THREE.Mesh(
            new THREE.SphereGeometry(0.62, 20, 14),
            new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.16, depthWrite: false }),
          );
          halo.position.copy(egg.position);
          dynamic.add(halo);
        }
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
    let guideAt = 0, guideSent = false, stateAt = 0;
    const talkTo = (n: Live) => {
      if (live.current.locked || travel) return;
      for (const o of live_npcs) if (o !== n) closeNpcTalk(o, false); // never two strips at once
      n.talk = talk(n.talk, n.npc.hints.length);
      const h = n.npc.hints[n.talk.shown];
      if (h) cb.current.onNpcTalk?.({ id: n.npc.id, name: n.npc.name, text: h.text, icons: h.icons, last: n.talk.shown === n.npc.hints.length - 1 });
    };
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.add(e.code);
      if (opensMap(e.code, e.target as HTMLElement) && !e.repeat) { cb.current.onMapKey?.(); return; }
      if (e.code === SKIP.key && !e.repeat) {
        const idle = pgStart < 0 && holdStart < 0 && strokeStart < 0 && !(reactAt.current >= 0 && performance.now() - reactAt.current < PLAY.reactionSeconds * 1000);
        if (nearby && nearby.id === "pond" && zones.is("garden") && !travel && !live.current.locked && !live.current.mapOpen && sit.phase === "standing" && idle && canSkip(hourNow, { flying: !!sk })) {
          const now = performance.now();
          sk = { plan: skipPlan(Math.floor(now), window.matchMedia("(prefers-reduced-motion: reduce)").matches), start: now, from: { x: pos.x, z: pos.z }, hand: handPoint(pos), landed: 0, cancelAt: -1, mesh: null };
          pgStart = now; pgLanded = true; pgSkip = true; // the lean over the water, without the splash
        }
        return;
      }
      if (e.code === FOLLOW.key && !e.repeat) { followWant = true; return; }
      if (e.code === PLAY.keys.hold && !e.repeat) {
        if (travel) {
          // walking through a gate: nothing else to do
        } else if (nearby?.kind === "gate") {
          startTravel(zones.is("margins") ? "garden" : "margins", pos); // the gate in either direction
        } else if (nearby?.kind === "door" && nearby.id === "door-reading") {
          startTravel("reading", pos); // the Reading Room door, from the Margins
        } else if (nearby?.kind === "door" && nearby.id === "door-margins") {
          startTravel("margins", pos); // and back out of the Reading Room
        } else if (nearby?.kind === "door") {
          startTravel(zones.is("home") ? "garden" : "home", pos); // the Home door in either direction
        } else if (zones.is("reading")) {
          // unfolding is a hold, handled each frame
        } else if (zones.is("home")) {
          if (nearby?.kind === "decor" && !live.current.locked) cb.current.onInteract(nearby); // ?decor=stub: open the strip for this plot
        } else if (nearby?.kind === "npc") {
          const n = live_npcs.find((o) => `npc-${o.npc.id}` === nearby?.id);
          if (n) talkTo(n);
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
          if (pgStart < 0 && canPlayerSplash(hourNow)) { pgStart = performance.now(); pgLanded = false; pgSkip = false; } // lean over and splash
        } else if (nearby) cb.current.onInteract(nearby);
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", () => keys.clear());

    let dragging = false;
    const dom = renderer.domElement;
    let lookId = -1, lastLook = { x: 0, y: 0 }; // S37: one finger turns the camera; touch has no movementX, so use client deltas
    const lookOn = MOBILE_ENABLED; // S37: touch look is part of the phone feature; with the flag off a finger on the canvas turns nothing
    const pd = (e: PointerEvent) => { if (lookOn && dragging && e.pointerType !== "mouse") return; dragging = true; lookId = e.pointerId; lastLook = { x: e.clientX, y: e.clientY }; downAt = { x: e.clientX, y: e.clientY }; dom.setPointerCapture(e.pointerId); };
    let downAt: { x: number; y: number } | null = null;
    const pu = (e: PointerEvent) => {
      if (lookOn && e.pointerType !== "mouse" && e.pointerId !== lookId) return;
      dragging = false;
      const d = downAt; downAt = null;
      if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5 || !live_npcs.length || !zones.is("margins") || travel) return;
      const r = dom.getBoundingClientRect(); // a tap on one, close enough to talk, is the same as pressing E
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      for (const n of live_npcs) {
        if (Math.hypot(pos.x - OFF - n.at.x, pos.z - n.at.z) > n.npc.talkLeave) continue;
        if (ray.intersectObject(n.scene.hit, true).length) { talkTo(n); break; }
      }
    };
    const pm = (e: PointerEvent) => {
      if (!dragging) return;
      if (e.pointerType !== "mouse") {
        if (!lookOn || e.pointerId !== lookId) return;
        const d = lookDelta(lastLook, { x: e.clientX, y: e.clientY }, GARDEN.camera.turnSpeed); lastLook = { x: e.clientX, y: e.clientY };
        yaw += d.yaw; pitch = clampPitch(pitch + d.pitch);
        return;
      }
      yaw -= e.movementX * GARDEN.camera.turnSpeed;
      pitch = clampPitch(pitch + e.movementY * GARDEN.camera.turnSpeed);
    };
    const pc = (e: PointerEvent) => { if (e.pointerId === lookId || e.pointerType === "mouse") { dragging = false; downAt = null; } };
    dom.addEventListener("pointercancel", pc);
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
      const inRoom = zones.is("home") || zones.is("reading"), roomSky = zones.is("reading") ? READING.look.sky : HOME_ROOM.look.sky; // a room: fixed soft daylight, its own sky colour, no clock inside
      const L = weatherLight(lightingAt(zones.is("home") ? HOME_ROOM.light.hour : zones.is("reading") ? READING.light.hour : hourNow), zones.is("garden") ? weatherNow(hourNow).tint : 0); // S25: a touch greyer in the garden while it drizzles. The room has fixed soft daylight; no clock inside
      (scene.background as THREE.Color).set(inRoom ? roomSky : L.sky);
      const haze = hazeOn && zones.is("garden") ? hazeAt(hourNow) : null;
      (scene.fog as THREE.Fog).color.set(inRoom ? roomSky : hazeFog(L.fog, haze));
      (edge.material as THREE.MeshBasicMaterial).color.set(inRoom ? roomSky : L.sky);
      mg?.setSky(L.sky);
      if (skyScene) skyScene.setColors(L.sky, lerpColor(zenithAt(hourNow), L.sky, zones.is("garden") ? weatherNow(hourNow).tint * 0.6 : 0));
      shell?.setSky(L.sky, haze);
      hemi.color.set(L.hemisphereSky);
      hemi.groundColor.set(L.hemisphereGround);
      hemi.intensity = L.hemisphereIntensity;
      sun.color.set(L.sun);
      sun.intensity = L.sunIntensity;
      sunOff = L.sunPosition as [number, number, number]; sun.position.set(...L.sunPosition);
    };
    // Dev-only starts for the Margins (ignored in production): ?area=margins ?unfold=1 ?gate=1
    const homeStart = homeOverride(window.location.search, process.env.NODE_ENV === "production");
    if (rPreview && READING_ENABLED) {
      zones.enterZone("reading");
      const a = readingArrival("reading");
      pos = { x: a[1].x + READING_OFF, z: a[1].z };
      yaw = readingYaw("reading");
    } else if (homeStart) {
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
    let cover: { frames: number; fadeAt: number } | null = null; // S36: the paper stays over the canvas until the saved zone is built and drawn twice
    if (restore) {
      try {
        const sx = restore.x, sz = restore.z;
        const L: Ladder = {
          reading: READING_ENABLED, radius: GARDEN.player.radius,
          zones: {
            garden: { halfW: WORLD.size / 2, halfD: WORLD.size / 2, cols: () => withWorldColliders(cols, nearbyCircles(chunkOf(sx), chunkOf(sz))), spawn: { x: GARDEN.player.start[0], z: GARDEN.player.start[1] }, spawnYaw: 0 },
            margins: { halfW: MARGINS.size / 2, halfD: MARGINS.size / 2, cols: () => ensureMarginsLayout().layout.cols, spawn: arrivalPath("margins")[1], spawnYaw: arrivalYaw("margins") },
            home: { halfW: HOME_ROOM.room.width / 2, halfD: HOME_ROOM.room.depth / 2 + 0.6, cols: () => roomCols, spawn: doorArrival("home")[1], spawnYaw: doorYaw("home") },
            reading: { halfW: READING.room.width / 2, halfD: roomWalkEnd(), cols: () => rCols, spawn: readingArrival("reading")[1], spawnYaw: readingYaw("reading") },
          },
        };
        const r = restorePlayer(restore, L, { garden: 0, margins: OFF, home: ROOM_OFF, reading: READING_OFF });
        zones.enterZone(r.zone); // the one enter path, no door or gate walk (does nothing for the garden, which starts entered)
        pos = { x: r.x, z: r.z }; yaw = r.yaw; player.rotation.y = r.heading;
        wipe.style.transform = "none"; wipe.style.opacity = "1"; wipe.style.display = "block"; cover = { frames: 0, fadeAt: 0 };
      } catch { /* trouble placing: start where the game starts today */ }
    }
    const atWorld = atOverride(window.location.search, process.env.NODE_ENV === "production"); // dev-only: ?at=x,z looks at the far parts of the World
    if (atWorld && zones.is("garden")) { pos = atWorld; }
    if (zones.is("garden")) showShell(); // the garden zone starts entered, so its World is built here (and again on every return)
    // W4: the cells walked so far, kept in this browser only. Revealing is by position; saving is throttled and also happens on leaving.
    let walkedKey = storageKey(live.current.walkKey), walked: Walked = newWalked(), walkDirty = false, walkSaved = 0, poseAt = 0;
    const readWalked = () => { walked = loadWalked(walkedKey); };
    const saveWalked = () => { if (!walkDirty) return; walkDirty = false; saveWalkedCells(walkedKey, walked); };
    readWalked();
    let last = performance.now();
    let raf = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || !!rPreview?.reduced; // ?reading=reduced (dev only) also forces it
    // The player walks the whole World; collision data for the streamed chunks comes from the pure map, never from what is drawn.
    const gardenCols = () => (shell ? { circles: [...cols.circles, ...shell.circlesNear(pos.x, pos.z, 8)], boxes: [...cols.boxes, ...shell.boxesNear(pos.x, pos.z, 8)] } : cols);
    const colsAt = (x: number, z: number): Colliders => (shell ? { circles: [...cols.circles, ...shell.circlesNear(x, z, 8)], boxes: [...cols.boxes, ...shell.boxesNear(x, z, 8)] } : cols);
    const FAR: Vec = { x: 1e6, z: 1e6 };
    // One frame of walking to a goal anywhere in the World, along a route that is re-planned every routeEvery seconds.
    const walkTo = (w: Wander, st: Walk, goal: Vec, speed: number, dt: number, ts: number, gc: Colliders, player: Vec): { w: Wander; moving: boolean } => {
      const R = GARDEN.print.radius;
      if (ts >= st.at) { st.route = followRouteTo(w, goal, gc, R); st.leg = 0; st.at = ts + FOLLOW.routeEvery; }
      while (st.leg < st.route.length - 1 && Math.hypot(st.route[st.leg].x - w.x, st.route[st.leg].z - w.z) < 0.3) st.leg++;
      const g = st.leg < st.route.length - 1 ? st.route[st.leg] : goal;
      const m = followMove(w, g, speed, dt, player, gc, R);
      return { w: { ...w, x: m.pos.x, z: m.pos.z, tx: m.pos.x, tz: m.pos.z, wait: 1, heading: m.moving && m.heading !== null ? m.heading : w.heading }, moving: m.moving };
    };
    // The other Prints: by day they wander Home, come along on a walk, head back home afterwards, and at bedtime settle by the bed.
    const stepOthers = (dt: number, ts: number, ph: ReturnType<typeof sleepPhase>, t: number) => {
      const R = GARDEN.print.radius, fo = followOn(followS);
      for (const o of others) {
        const gc = colsAt(o.w.x, o.w.z);
        let moving = false, sleeping = false;
        if (!fo && o.joined) { o.joined = false; o.w = { ...o.w, tx: o.w.x, tz: o.w.z, wait: 1.2 }; }
        if (fo && o.joined) {
          const dP = Math.hypot(o.w.x - pos.x, o.w.z - pos.z);
          if (dP > FOLLOW.farEnd) { o.joined = false; o.w = { ...o.w, wait: 1.2 }; }
          else {
            const tgt = followTarget(pos, followHead, gc, R, o.slot);
            if (tgt) { const r = walkTo(o.w, o.walk, tgt, followSpeed(Math.hypot(tgt.x - o.w.x, tgt.z - o.w.z)), dt, ts + o.idx * 0.1, gc, pos); o.w = r.w; moving = r.moving; }
            else o.w = { ...o.w, heading: Math.atan2(pos.x - o.w.x, pos.z - o.w.z) };
          }
        } else if (ph !== "awake") {
          const spot = restSpot(NIGHT.bed, o.idx);
          if (Math.hypot(spot.x - o.w.x, spot.z - o.w.z) > 0.3) { const r = walkTo(o.w, o.walk, spot, NIGHT.walkSpeed, dt, ts + o.idx * 0.1, gc, FAR); o.w = r.w; moving = r.moving; }
          else { sleeping = true; o.w = { ...o.w, tx: o.w.x, tz: o.w.z, wait: 1 }; }
        } else {
          const hg = homeGoal(o.w);
          if (hg) { const r = walkTo(o.w, o.walk, hg, FOLLOW.baseSpeed, dt, ts + o.idx * 0.1, gc, FAR); o.w = r.w; moving = r.moving; }
          else o.w = stepWander(o.w, dt, rng, R, GARDEN.print.speed, gc);
        }
        let dy = o.w.heading - o.mesh.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        o.mesh.rotation.order = "YXZ";
        o.mesh.rotation.y += dy * Math.min(1, dt * 8);
        o.mesh.rotation.x = moving ? 0.07 : 0;
        o.mesh.position.set(o.w.x, (moving || sleeping ? 0 : Math.abs(Math.sin(t / 300 + o.idx)) * 0.03) + lift(o.w.x, o.w.z), o.w.z);
        const sq = sleeping ? 0.88 : 1, wide = 1 + (1 - sq) * 0.5;
        o.mesh.scale.set(o.base * wide, o.base * sq, o.base * wide);
      }
    };
    let perf = perfStart(RS.pixelRatio, 0);
    const tick = (t: number) => {
      for (const rp of ripples) {
        const r = ripple((t / 6000) % 1, rp.offset, reducedMotion);
        rp.mesh.scale.setScalar(r.scale);
        (rp.mesh.material as THREE.MeshBasicMaterial).opacity = r.opacity;
      }
      const dt = Math.min(0.05, (t - last) / 1000);
      if (t - lightClock > 1000) { lightClock = t; applyLight(); }
      if (touchRender) { // S37: on a phone only, if frames stay slow for a window, take the pixel ratio down one step; never back up, never touches game state
        const st = perfStep(perf, t - last, t);
        perf = st.perf;
        if (st.dropped) { renderer.setPixelRatio(perf.ratio); renderer.setSize(el.clientWidth, el.clientHeight); }
      }
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
      // The skipped page. Anything that interrupts it fades it out in a moment and clears it away.
      if (sk && sk.cancelAt < 0) {
        const eng = holdStart >= 0 || strokeStart >= 0 || (reactAt.current >= 0 && performance.now() - reactAt.current < PLAY.reactionSeconds * 1000);
        if (eng || travel || !zones.is("garden") || live.current.locked || live.current.mapOpen || sit.phase !== "standing" || !canPlayerSplash(hourNow)) {
          sk.cancelAt = t;
          if (pgSkip) pgStart = -1;
        }
      }
      skAge = -1; skAt = null;
      if (sk) {
        const reducedS = reducedMotion, age = (t - sk.start) / 1000 - SKIP.release;
        if (sk.cancelAt >= 0) {
          if ((t - sk.cancelAt) / 1000 >= SKIP.cancelSeconds) endSkip();
          else if (sk.mesh) sk.mesh.traverse((o) => { const m = o as THREE.Mesh | THREE.LineSegments; if (m.material) (m.material as THREE.Material).opacity = Math.max(0, 1 - (t - sk!.cancelAt) / 1000 / SKIP.cancelSeconds) * (m.material as THREE.Material).opacity; });
        } else if (age >= 0) {
          const f = skipFrame(sk.plan, age, sk.hand, reducedS);
          if (f.done) endSkip();
          else {
            if (!sk.mesh) { sk.mesh = buildPage(); scene.add(sk.mesh); }
            const w = skipWorld(f.at, sk.from), head = Math.atan2(skipWorld({ along: 1, side: 0 }, sk.from).x - skipWorld({ along: 0, side: 0 }, sk.from).x, skipWorld({ along: 1, side: 0 }, sk.from).z - skipWorld({ along: 0, side: 0 }, sk.from).z);
            sk.mesh.position.set(w.x, f.y, w.z);
            sk.mesh.rotation.set(0, head + f.spin, 0);
            sk.mesh.scale.set(1, f.squash, 1);
            sk.mesh.traverse((o) => { const m = o as THREE.Mesh | THREE.LineSegments; if (m.material) (m.material as THREE.Material).opacity = f.opacity; });
            for (const i of skipLandings(sk.plan, Math.max(0, age - dt), age)) { const lw = skipWorld(sk.plan.landings[i], sk.from); addSplash(lw.x, lw.z, false, t / 1000, true); }
            skAge = age; skAt = w;
          }
        }
      }
      let ground = 0;
      if (zones.is("margins") && mLayout) ground = heightAt(pos.x - OFF, pos.z, mLayout.hills);
      else if (groundHeight && zones.is("garden")) ground = groundY(pos.x, pos.z); // H1: the player rides the World's rises (x/z reach and saves are unchanged)
      let tRes: { pos: { x: number; z: number }; heading: number | null } | null = null;
      if (cover) { // S36: lift the boot cover on its normal fade once the zone has been drawn twice; a walk through a gate or door takes over the wipe at once
        if (travel) { wipe.style.transition = ""; cover = null; }
        else if (cover.fadeAt === 0 && ++cover.frames >= 3) { wipe.style.transition = reducedMotion ? "opacity 150ms linear" : "opacity 450ms ease"; wipe.style.opacity = "0"; cover.fadeAt = t; }
        else if (cover.fadeAt > 0 && t - cover.fadeAt > (reducedMotion ? 200 : 500)) { wipe.style.display = "none"; wipe.style.transition = ""; wipe.style.opacity = "1"; cover = null; }
      }
      if (travel) {
        const tt = (t - travel.start) / 1000, f = travelFrame(tt, reducedMotion);
        if (f.swapped && !travel.swapped) {
          travel.swapped = true; // behind the full page, so nothing flashes
          if (travel.into === "garden") zones.leaveZone(); else zones.enterZone(travel.into);
          yaw = travel.into === "reading" ? readingYaw("reading") : travel.from === "reading" ? readingYaw("margins") : travel.into === "home" ? doorYaw("home") : travel.from === "home" ? doorYaw("garden") : arrivalYaw(travel.into);
          camInit = false;
        }
        const pp = pointAlong(travel.swapped ? travel.arrive : travel.walk, travel.swapped ? f.arrive : f.walk);
        tRes = { pos: pp.p, heading: pp.heading };
        wipe.style.display = f.wipe > 0 || tt < 0.05 ? "block" : "none";
        if (reducedMotion) { wipe.style.transform = "none"; wipe.style.opacity = String(f.wipe); } // a fade, not a sweep
        else { wipe.style.transform = `translateX(${wipeOffset(tt, false)}%)`; wipe.style.opacity = "1"; }
        if (f.done) { travel = null; cb.current.onTravel?.(false); wipe.style.display = "none"; const zc = zones.current; if (zc !== "reading") cb.current.onZoneDone?.(zc); }
      }
      const res = tRes ? tRes : zones.is("reading") && canWalk(sit) ? (() => {
        const l = { x: pos.x - READING_OFF, z: pos.z };
        const r = movePlayer(l, { forward: k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown"), right: k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") }, yaw,
          keys.has("ShiftLeft") || keys.has("ShiftRight") ? GARDEN.player.jogSpeed : GARDEN.player.speed, dt, GARDEN.player.radius, rCols, READING.room.width);
        return { pos: { x: r.pos.x + READING_OFF, z: Math.min(r.pos.z, roomWalkEnd()) }, heading: r.heading }; // the doorway is the way out; no further
      })() : zones.is("home") && canWalk(sit) ? (() => {
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
      if (live.current.walkKey !== null && storageKey(live.current.walkKey) !== walkedKey) { saveWalked(); walkedKey = storageKey(live.current.walkKey); readWalked(); } // signed in as someone else
      if (zones.is("garden") && !travel && reveal(walked, pos.x, pos.z)) walkDirty = true;
      if (walkDirty && t / 1000 - walkSaved > MAP.saveEvery) { walkSaved = t / 1000; saveWalked(); }
      if (cb.current.reportState && t - stateAt > 250) { // S36: report where everything stands (the page decides what is worth saving)
        stateAt = t;
        const offs: Offsets = { garden: 0, margins: OFF, home: ROOM_OFF, reading: READING_OFF }, zn = zones.current, lp = toLocal(zn, pos, offs);
        const night = sleepPhase(hourNow) !== "awake", list: Snap["prints"] = [];
        if (primaryId && primaryId !== "_" && wander) list.push({ id: primaryId, x: wander.x, z: wander.z, h: wander.heading, m: night ? "rest" : "wander" });
        for (const o of others) list.push({ id: o.id, x: o.w.x, z: o.w.z, h: o.w.heading, m: night ? "rest" : "wander" });
        cb.current.reportState({ zone: zn, x: lp.x, z: lp.z, heading: player.rotation.y, yaw, prints: list }, !!travel);
      }
      if (t - guideAt > 120) { // first-run guide: the garden pose, a few times a second (null away from the garden)
        guideAt = t;
        const gp = zones.is("garden") && !travel ? { x: pos.x, z: pos.z, yaw } : null;
        if (gp || guideSent) cb.current.onGuidePose?.(gp);
        guideSent = !!gp;
      }
      if (live.current.mapOpen && t - poseAt > 200) { poseAt = t; cb.current.onMapPose?.(walked, zones.is("garden") ? { x: pos.x, z: pos.z, yaw } : null); }
      if (regionFog && zones.is("garden")) { const fg = fogAt(pos.x, pos.z, true); (scene.fog as THREE.Fog).near = fg[0]; (scene.fog as THREE.Fog).far = fg[1]; } // E1: this region's fog, eased across the seams
      { const sf2 = sunFollow(sunOff, pos.x, pos.z, !!shell && zones.is("garden"), SUN_SHADOW.dist); sun.position.set(...sf2.pos); sun.target.position.set(...sf2.target); sun.target.updateMatrixWorld(); } // the shadow box travels with the player in the World
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
        if (wantStroke) { if (strokeStart < 0) { strokeStart = t; cb.current.onStroke?.(); } strokeEnd = -1; }
        else if (strokeStart >= 0) {
          if (strokeEnd < 0) strokeEnd = t;
          if ((t - strokeEnd) / 1000 >= PLAY.stroke.easeOut) { strokeStart = -1; strokeEnd = -1; }
        }
        const engaged = holdStart >= 0 || reacting || strokeStart >= 0;
        // Bedtime. The hour decides; being fed or stroked wakes the Print gently and it settles again later.
        const ts = t / 1000, ph = sleepPhase(hourNow), R = GARDEN.print.radius;
        if (swapped) { swapped = false; bed = "none"; followS = FOLLOWIDLE; pondS = PONDIDLE; hideS = hideCancel(); hideRoute = []; holdStart = -1; } // another Print is now the focused one: it starts fresh from where it stands
        const away = !!homeGoal(wander); // outside Home after a walk: it heads back before bed, a visit or a game
        const atBed = Math.hypot(wander.x - NIGHT.bed.x, wander.z - NIGHT.bed.z) < 0.6;
        if (engaged) {
          restartAt = ts + NIGHT.napSeconds;
          if (bed === "yawn" || bed === "walk") bed = "none";
          else if (bed === "curl" || bed === "sleep") { bed = "wake"; bedAt = ts; wakeMove = false; }
        }
        if (ph === "awake") {
          if (bed === "yawn" || bed === "walk") bed = "none";
          if (!engaged && (bed === "curl" || bed === "sleep" || (bed === "none" && atBed))) { bed = "wake"; bedAt = ts; wakeMove = true; wakeFrom = { x: wander.x, z: wander.z }; }
        } else if (bed === "none" && !engaged && !away && ts >= restartAt) {
          bed = atBed ? "curl" : "yawn"; bedAt = ts; curlFrom = { x: wander.x, z: wander.z };
        }
        if (dreamMode && ph === "asleep" && !engaged && (bed === "none" || bed === "yawn" || bed === "walk" || bed === "curl")) { dreamSet = true; bed = "sleep"; bedAt = ts; wander = { ...wander, x: NIGHT.bed.x, z: NIGHT.bed.z, tx: NIGHT.bed.x, tz: NIGHT.bed.z, wait: 1 }; } // S24 dev preview: asleep at the bed at once, and again after a feed or stroke wakes it
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
        if (followActive(followS) && ts >= pondNextAt) pondNextAt = ts + retryDelay(Math.random()); // a walk together goes first; the visit tries again later
        if (!pondBusy(pondS) && !hideBusy(hideS) && !followActive(followS) && !away && awakeNow && !engaged && ts >= pondNextAt) {
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
        if (followActive(followS) && ts >= hideNextAt) hideNextAt = ts + hideRetry(Math.random()); // same for hide and seek
        if (!hideBusy(hideS) && !followActive(followS) && !away && awakeNow && !engaged && !pondBusy(pondS) && sit.phase === "standing" && ts >= hideNextAt) {
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
        // Come along: C near the Print by day starts a walk; the Print trots a few steps behind and aside. Anything else that wants
        // the Print, a panel, a door, night or leaving the garden ends it with a small settle.
        let followPoseV: ReturnType<typeof followPose> | null = null;
        {
          const gardenNow = zones.is("garden") && !travel, panel = !!live.current.locked || !!live.current.mapOpen;
          const dPrint = Math.hypot(wander.x - pos.x, wander.z - pos.z);
          const lastP = followLast ?? { x: pos.x, z: pos.z }, dp = Math.hypot(pos.x - lastP.x, pos.z - lastP.z);
          if (dp > 1e-4 && dp < 3) followHead = Math.atan2(pos.x - lastP.x, pos.z - lastP.z); // a jump (a door) is not a walk
          const pSpeed = dp < 3 && dt > 0 ? dp / dt : 0;
          followLast = { x: pos.x, z: pos.z };
          const hold = engaged || pondBusy(pondS) || hideBusy(hideS) || sit.phase !== "standing";
          const busy = hold || !!sk || pgStart >= 0;
          const offer = { hour: hourNow, awake: awakeNow, busy, panel, distance: dPrint, following: followActive(followS) };
          if (followActive(followS) && followInterrupted({ awake: awakeNow, hour: hourNow, busy: hold, panel, garden: gardenNow, distance: dPrint })) followS = followEnd(followS);
          const begin = () => {
            followS = followStart(); followRoute = []; followLeg = 0; followRouteAt = -1;
            const ids = joiners(pos, others.map((o) => ({ id: o.id, x: o.w.x, z: o.w.z }))); // the nearest Prints come along too, each in its own place behind
            for (const o of others) { const k = ids.indexOf(o.id); o.joined = k >= 0; o.slot = k + 1; o.walk.at = -1; }
          };
          if (followWant) {
            followWant = false;
            if (followOn(followS)) followS = followEnd(followS);
            else if (gardenNow && canOfferFollow(offer)) begin();
          }
          if (followPreview && gardenNow) { followPreview = false; if (canOfferFollow({ ...offer, distance: 0 })) begin(); } // dev: skip the walk up to the Print
          followMoving = false;
          if (followActive(followS)) {
            const was = followS.phase;
            followS = followAdvance(followS, dt, pSpeed);
            if (!followActive(followS)) wander = { ...wander, tx: wander.x, tz: wander.z, wait: 1.2 };
            else {
              const toPlayer = Math.atan2(pos.x - wander.x, pos.z - wander.z);
              if (was === "on" && followS.phase === "on") {
                const gc = gardenCols(), tgt = followTarget(pos, followHead, gc, GARDEN.print.radius);
                if (tgt) {
                  if (ts >= followRouteAt) { followRoute = followRouteTo(wander, tgt, gc, GARDEN.print.radius); followLeg = 0; followRouteAt = ts + FOLLOW.routeEvery; }
                  while (followLeg < followRoute.length - 1 && Math.hypot(followRoute[followLeg].x - wander.x, followRoute[followLeg].z - wander.z) < 0.3) followLeg++;
                  const goal = followLeg < followRoute.length - 1 ? followRoute[followLeg] : tgt;
                  const m = followMove(wander, goal, followSpeed(Math.hypot(tgt.x - wander.x, tgt.z - wander.z)), dt, pos, gc, GARDEN.print.radius);
                  wander = { ...wander, x: m.pos.x, z: m.pos.z, tx: m.pos.x, tz: m.pos.z, wait: 1, heading: m.moving && m.heading !== null ? m.heading : toPlayer };
                  followMoving = m.moving;
                } else wander = { ...wander, heading: toPlayer };
              } else wander = { ...wander, tx: wander.x, tz: wander.z, wait: 1, heading: toPlayer };
            }
          }
          if (followActive(followS)) followPoseV = followPose(followS, followMoving, reducedMotion);
          const mode = followOn(followS) ? "on" : !followActive(followS) && gardenNow && canOfferFollow(offer) ? "can" : "off";
          if (mode !== followShown) { followShown = mode; cb.current.onFollow?.(mode); }
        }
        // Bug watching: a rare, short glance at a nearby insect while the Print is idle. It never starts, and ends at once, if the Print
        // is fed, stroked, following, at the pond, hiding, asleep, sitting or flying. The check runs on a timer, not every frame.
        if (bugSim) {
          const idle = !engaged && awakeNow && !owned && !holdStill && !pondOwned && !hideOwned && !followActive(followS) && !sk && !travel && sit.phase === "standing" && zones.is("garden");
          const sp = idle ? bugSim.spotAt(wander.x, wander.z) : -1;
          const r = noticeTick(bugNotice, ts, sp >= 0, bugRoll, bugSim.cfg);
          bugNotice = r.state;
          bugGlance = r.active && sp >= 0 ? sp : -1;
          if (bugGlance >= 0) wander = { ...wander, tx: wander.x, tz: wander.z, wait: 1 };
        }
        // The peek leans out sideways; it is eased so an interrupt never snaps the Print back.
        const sideWant = hidePoseV && hideS.perp ? hidePoseV.side : 0;
        hideSide += (sideWant - hideSide) * Math.min(1, dt * 8);
        if (Math.abs(hideSide) < 0.001) hideSide = 0;
        const hideDir = hideS.perp ?? { x: 0, z: 0 };
        if (!engaged && !owned && !holdStill && !pondOwned && !hideOwned && !followActive(followS)) {
          const hg = homeGoal(wander);
          if (hg) wander = walkTo(wander, homeWalk, hg, FOLLOW.baseSpeed, dt, ts, colsAt(wander.x, wander.z), FAR).w;
          else wander = stepWander(wander, dt, rng, GARDEN.print.radius, GARDEN.print.speed, cols);
        }
        stepOthers(dt, ts, ph, t);
        // The nearest Print is the one the card, feeding and stroking use. It only changes while the focused one is idle.
        if (others.length && primaryId && zones.is("garden") && !travel && !engaged && !followActive(followS) && bed === "none" && !pondBusy(pondS) && !hideBusy(hideS) && sit.phase === "standing") {
          const nid = chooseFocus(pos, [{ id: primaryId, x: wander.x, z: wander.z }, ...others.map((o) => ({ id: o.id, x: o.w.x, z: o.w.z }))], primaryId);
          if (nid && nid !== primaryId && nid !== focusAsked) { focusAsked = nid; cb.current.onFocus?.(nid); }
        }
        // Pose: the reaction wins, then stroking, otherwise rest.
        const stroked = strokeStart >= 0 ? (t - strokeStart) / 1000 : -1;
        const released = strokeEnd >= 0 ? (t - strokeEnd) / 1000 : 0;
        const reactPose = reacting ? feedPose(sinceFeed, reducedMotion) : stroked >= 0 ? strokePose(stroked, reducedMotion, released) : { lean: 0, squash: 1, hop: 0 };
        const pose = engaged ? (bedPose && bed === "wake" ? mixPose(bedPose, reactPose, 0.7) : reactPose) : bedPose ?? pondPoseV ?? hidePoseV ?? followPoseV ?? reactPose;
        const watching = !engaged && skAt !== null && sk !== null && printWatches(awakeNow, wander);
        const watchHop = watching && sk ? watcherHop(sk.plan, skAge, reducedMotion) : 0;
        const bugAt = bugSim && bugGlance >= 0 ? bugSim.cfg.spots[bugGlance] : null;
        const faceTarget = engaged ? Math.atan2(pos.x - wander.x, pos.z - wander.z) : bugAt ? Math.atan2(bugAt.x - wander.x, bugAt.z - wander.z) : watching && skAt ? Math.atan2(skAt.x - wander.x, skAt.z - wander.z) : wander.heading;
        printMesh.rotation.order = "YXZ";
        printMesh.rotation.y -= fidgetYaw; // take last frame's glance off before turning toward the target
        let dy = faceTarget + (hidePoseV && !engaged ? hidePoseV.spin : 0) - printMesh.rotation.y;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        printMesh.rotation.y += dy * Math.min(1, dt * 8);
        bugGlanceK += ((bugAt && !engaged ? 1 : 0) - bugGlanceK) * Math.min(1, dt * (reducedMotion ? 3 : 4));
        printMesh.rotation.x = pose.lean + (bugSim ? bugSim.cfg.noticeTilt * bugGlanceK : 0);
        // Idle fidgets: only while standing still by day with nothing else going on.
        const fidgetCan = canFidget({
          day: ph === "awake" && bed === "none", standing: wander.wait > 0, engaged,
          busy: owned || holdStill || pondOwned || hideOwned || followActive(followS) || !!sk || !!travel || sit.phase !== "standing" || !zones.is("garden"),
          panel: !!live.current.locked || !!live.current.mapOpen,
          moving: ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].some((c) => keys.has(c)),
        });
        if (fidgetCan && !reducedMotion && weatherNow(hourNow).intensity >= WEATHER.glance.minIntensity) { // S25: it drizzles, so now and then a look around (the existing glance)
          glanceWait -= dt;
          if (glanceWait <= 0) { glanceWait = nextGlanceGap(fidgetRng(), weatherMode === "on"); fidgetS = startGlance(fidgetS, fidgetRng()); }
        }
        fidgetS = stepFidget(fidgetS, dt, fidgetCan, fidgetRng, reducedMotion, fidgetPick);
        const fo = fidgetOffsets(fidgetS, reducedMotion);
        fidgetYaw = fo.yaw;
        printMesh.rotation.y += fidgetYaw;
        printMesh.rotation.z = (!engaged ? (pondPoseV?.shake ?? hidePoseV?.shake ?? 0) : 0) + fo.roll;
        if (fo.blink > 0 || fidgetBlinked) { for (const e of fidgetEyes) e.scale.y = 1 - fo.blink; fidgetBlinked = fo.blink > 0; }
        printMesh.position.set(wander.x + hideDir.x * HIDE.peekOut * hideSide, (owned || holdStill || pondOwned || hideOwned ? 0 : Math.abs(Math.sin(t / 300)) * 0.03 * (engaged ? 0.3 : 1)) + pose.hop + watchHop + yBase, wander.z + hideDir.z * HIDE.peekOut * hideSide);
        printMesh.position.y += lift(printMesh.position.x, printMesh.position.z); // H4: the focused Print, including while it walks along, stands on the ground
        const prog = pulseStart < 0 ? 0 : (performance.now() - pulseStart) / 1200;
        if (prog >= 1) pulseStart = -1;
        const sc = baseScale * growthPulse(prog, reduced);
        const wide = 1 + (1 - pose.squash) * 0.5;
        printMesh.scale.set(sc * wide, sc * pose.squash * fo.squash, sc * wide);

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
        const hp = !engaged && hideBusy(hideS) ? hidePuffs(hideS, reducedMotion) : !engaged && followActive(followS) ? followDrops(followS, followMoving, reducedMotion) : [];
        hideDrops.forEach((m, i) => {
          const pf = hp[i];
          m.visible = !!pf;
          if (!pf) return;
          m.position.set(printMesh!.position.x + Math.cos(pf.angle) * pf.dx, baseScale * 0.65 + pf.dy + yBase + lift(printMesh!.position.x, printMesh!.position.z), printMesh!.position.z + Math.sin(pf.angle) * pf.dx);
          m.scale.setScalar(pf.scale);
          const mt = m.material as THREE.MeshBasicMaterial;
          mt.opacity = pf.opacity;
          mt.color.set((pf as { tone: string }).tone === "gold" ? 0xd9a15a : i % 2 ? 0xffffff : 0x6f8fb0);
        });
        drops.forEach((m, i) => {
          const pf = puffs[i];
          m.visible = !!pf;
          if (!pf) return;
          m.position.set(wander!.x + Math.cos(pf.angle) * pf.dx, baseScale * 0.65 + pf.dy + yBase + lift(wander!.x, wander!.z), wander!.z + Math.sin(pf.angle) * pf.dx);
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
          for (const d of sp.ringOnly ? [] : dropsAt(age, sp.big, reducedMotion)) {
            if (di >= splashDrops.length) break;
            const m = splashDrops[di++];
            m.visible = true;
            m.position.set(sp.x + d.x, 0.05 + d.y, sp.z + d.z);
            m.scale.setScalar(d.scale);
            const mt = m.material as THREE.MeshBasicMaterial;
            mt.opacity = d.opacity;
            mt.color.set(d.dark ? 0x6f8fb0 : 0xcfd9f2);
          }
        }
        for (; ri < ringPool.length; ri++) ringPool[ri].visible = false;
        for (; di < splashDrops.length; di++) splashDrops[di].visible = false;
      }

      if (bugSim && bugScene) {
        const mvKeys = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].some((c) => keys.has(c));
        bugSim.step(dt, pos, zones.is("garden") && !travel, mvKeys || dragging, hourNow);
        bugScene.update(bugSim, t / 1000, reducedMotion || bugReduced, pos, () => 0);
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
          else if (rdoor && inReadingDoor(l, "margins")) mNear = { id: "door-reading", kind: "door", x: 0, z: 0, label: "Door", prompt: "Go through the door" };
        }
        // the way home is recomputed only when the player moves to a new cell
        const key = `${Math.round(l.x / 1.5)},${Math.round(l.z / 1.5)}`;
        if (key !== trailKey) { trailKey = key; trailPath = homePath(mField, l); }
        const A = MARGINS.arrows;
        const hereHome = pathLength(trailPath) < A.hideNear;
        const trail = hereHome ? [] : along(trailPath, A.startDist, A.spacing, A.count, reducedMotion ? 0 : ((t / 1000) * A.flowSpeed) % A.spacing);
        if (live_npcs.length) { // N1/N2: each notices you, turns, blooms its bubble; a strip closes when you walk off
          let best: { n: Live; dist: number } | null = null;
          for (const n of [...live_npcs]) {
            try {
              const dist = Math.hypot(l.x - n.at.x, l.z - n.at.z);
              n.note = noticeStep(n.note, dist, n.npc.noticeEnter, n.npc.noticeLeave, dt, reducedMotion);
              n.t += dt;
              n.scene.update({ t: n.t, turn: n.note.turn, bubble: n.note.bubble, faceYaw: Math.atan2(l.x - n.at.x, l.z - n.at.z), restYaw: n.at.face, reduced: reducedMotion, icons: greetingIcons(n.npc, hourNow) });
              const was = n.talk.open;
              n.talk = talkStillNear(n.talk, dist, n.npc);
              if (was && !n.talk.open) cb.current.onNpcTalk?.(null);
              if (withinSlack(dist, nearby?.id === `npc-${n.npc.id}`, n.npc.talkEnter, n.npc.talkLeave) && (!best || dist < best.dist)) best = { n, dist };
            } catch { dropNpc(n); } // broken at runtime: skip only this one, keep the world
          }
          if (live.current.npcClose !== npcClosed) { npcClosed = live.current.npcClose; for (const n of live_npcs) closeNpcTalk(n); }
          if (best && !mActive && !uSpot && !inGateZone(l, "home")) mNear = { id: `npc-${best.n.npc.id}`, kind: "npc", x: best.n.at.x + OFF, z: best.n.at.z, label: best.n.npc.prompt, prompt: best.n.npc.prompt };
        }
        if (sights) { // T1: the fade follows the hour (a plain short fade with reduced motion); the first time you come near one, its caption
          try {
            sightLvl = levelStep(sightLvl, sightLevel(hourNow, SIGHTS!.window), dt, reducedMotion);
            const cap = sights.update({ t: t / 1000, dt, player: l, level: sightLvl, reduced: reducedMotion });
            if (cap) cb.current.onMarginsNote?.(cap);
          } catch { dropSights(); }
        }
        mg.update({ t: t / 1000, dt, player: l, hour: hourNow, reduced: reducedMotion, all: mo.all, opened, active: mActive ? { id: mActive.id, since: (t - mActive.since) / 1000 } : null, target: l, trail });
        if (uHold > 0 && uSpot) {
          const v = new THREE.Vector3(uSpot.x + OFF, 0.5 + heightAt(uSpot.x, uSpot.z, mLayout.hills), uSpot.z).project(camera);
          ring.style.display = "block";
          ring.style.left = `${(v.x * 0.5 + 0.5) * el.clientWidth}px`;
          ring.style.top = `${(-v.y * 0.5 + 0.5) * el.clientHeight}px`;
          arc.setAttribute("stroke-dashoffset", String(CIRC * (1 - uHold)));
        }
      }

      // S34: the Reading Room. Hold E at a lit glint; the server says what is inside (world_unfold, region reading_room). Dusk spots ease in with the hour.
      let rNear: Place | null = null;
      if (zones.is("reading") && rd) {
        const l = { x: pos.x - READING_OFF, z: pos.z };
        rLevel = readingLevelStep(rLevel, levelFor(hourNow, !!rPreview), dt, reducedMotion);
        if (!travel) {
          if (rActive) {
            if ((t - rActive.since) / 1000 >= unfoldSeconds(reducedMotion)) { rOpened.add(rActive.id); rGive(); rActive = null; }
          } else {
            const cand = nearestReadingSpot(l, rOpened, rLevel);
            if (cand !== rCand) { rCand = cand; rHold = 0; rBlocked = false; }
            const rv = unfoldView(!!rPreview, rReady, rFailed);
            if (cand && !rv.canAsk && rv.noteOnHold && keys.has(PLAY.keys.hold)) { if (!rNoted) { cb.current.onMarginsNote?.(rv.noteOnHold); rNoted = true; } }
            else if (!keys.has(PLAY.keys.hold)) rNoted = false;
            const holding = !!cand && keys.has(PLAY.keys.hold) && !live.current.locked && !rBlocked && rv.canAsk;
            rHold = rPending ? 1 : holdStep(rHold, holding, dt);
            if (cand && !keys.has(PLAY.keys.hold)) rBlocked = false;
            if (rHold >= 1 && cand && !rPending) {
              const hk = `${rDay}|${cand.id}`;
              const full = cb.current.canGather && !cb.current.canGather("ink"); // the server picks the find, so any full pouch stops it first
              if (rPreview) { // dev preview: cycles through the kinds, never calls the server
                const kind = previewKind(rPreviewN++);
                rActive = { id: cand.id, since: t, look: findLook(kind, cand.dusk) }; rGrant = null; rHold = 0;
              }
              else if (full) { cb.current.onGather?.("ink"); rBlocked = true; rHold = 0; }
              else if (rHeld.has(hk)) { // the server already gave this find: open it from the hold, no new call
                const kind = rHeld.get(hk)!; rHeld.delete(hk);
                rActive = { id: cand.id, since: t, look: kind }; rGrant = { food: kind === "ink" || kind === "lantern" ? "ink" : kind === "glyph" ? "glyph" : null, egg: false }; rHold = 0;
              }
              else if (rQuiet) { cb.current.onMarginsNote?.(QUIET); rBlocked = true; rHold = 0; } // the server already said no; don't ask again this visit
              else if (cb.current.onWorldUnfold) {
                rPending = true; // the ring waits full for the answer; the page opens only once it is back
                const spot = cand, myVisit = rVisit, askDay = rDay, dayOpened = rOpened;
                cb.current.onWorldUnfold(READING.region, spot.id, askDay).catch((): Outcome => ({ ok: false, reason: "network" })).then((raw) => {
                  const o = quietIfUnknown(raw); // a region the server does not know yet is just "the pages are quiet"
                  const here = myVisit === rVisit && zones.is("reading");
                  const room = !cb.current.canGather || cb.current.canGather("ink");
                  const st = settleUnfold(o, here, room);
                  const look = o.ok ? findLook(o.kind, spot.dusk) : "plain"; // chosen after the answer, from the kind the server returned
                  if (st.held) { // a full pouch: the page stays folded and the find is kept, with the gentle hint
                    rHeld.set(`${askDay}|${spot.id}`, look);
                    if (here) { cb.current.onGather?.(st.held); rPending = false; rBlocked = true; rHold = 0; }
                    return;
                  }
                  if (st.open) dayOpened.add(spot.id); // the server wrote it, so the page counts as open on any later visit that day
                  if (!here) {
                    // Left while the call was in flight: still hand over what the server gave, with no animation.
                    if (st.food) cb.current.onGather?.(st.food);
                    if (st.egg) cb.current.onMarginsNote?.(FOUND_EGG);
                    if (st.cosmetic) { cosPlayUntil = performance.now() + 3000; cb.current.onKeepsake?.(st.cosmetic); }
                    return;
                  }
                  rPending = false;
                  if (st.ceiling) rQuiet = true;
                  if (st.note && !st.animate && !st.egg) cb.current.onMarginsNote?.(st.note);
                  if (st.cosmetic) { cosFoundAway = true; cb.current.onKeepsake?.(st.cosmetic); } // the Print is away: worn at once, and the put-on plays when the player is back in the garden
                  if (st.animate && st.kind) { rActive = { id: spot.id, since: performance.now(), look }; rGrant = { food: st.food, egg: st.egg }; rHold = 0; }
                  else { rBlocked = true; rHold = 0; } // refused: stays folded, nothing spent. A repeat: shown open, nothing granted.
                });
              } else { rBlocked = true; rHold = 0; }
            }
          }
          if (rActive) rNear = null;
          else if (rCand) rNear = !unfoldView(!!rPreview, rReady, rFailed).prompt ? null : { id: "unfold", kind: "unfold", x: rCand.x + READING_OFF, z: rCand.z, label: "Folded page", prompt: "Hold to unfold" };
          else if (inReadingDoor(l, "room")) rNear = { id: "door-margins", kind: "door", x: 0, z: 0, label: "Door", prompt: "Go through the door" };
        }
        rd.update({ t: t / 1000, player: l, level: rLevel, reduced: reducedMotion, opened: rOpened, active: rActive ? { id: rActive.id, since: (t - rActive.since) / 1000, look: rActive.look } : null, target: l });
        if (rHold > 0 && rCand) {
          const v = new THREE.Vector3(rCand.x + READING_OFF, 0.5, rCand.z).project(camera);
          ring.style.display = "block";
          ring.style.left = `${(v.x * 0.5 + 0.5) * el.clientWidth}px`;
          ring.style.top = `${(-v.y * 0.5 + 0.5) * el.clientHeight}px`;
          arc.setAttribute("stroke-dashoffset", String(CIRC * (1 - rHold)));
        }
      }

      if (shoreSights && zones.is("garden")) { // T2: the shore sights fade with the hour like the Margins ones; their caption goes to the same note line
        try {
          shoreLvl = levelStep(shoreLvl, sightLevel(hourNow, SHORE_SIGHTS!.window), dt, reducedMotion);
          const cap = shoreSights.update({ t: t / 1000, dt, player: pos, level: shoreLvl, reduced: reducedMotion });
          if (cap) cb.current.onMarginsNote?.(cap);
        } catch { dropShoreSights(); }
      }
      if (regionSights.size && zones.is("garden")) { // the region sights fade with the hour like the shore ones; their caption goes to the same note line
        try {
          regionLvl = levelStep(regionLvl, sightLevel(hourNow, REGION_SIGHTS.paper_downs!.window), dt, reducedMotion);
          for (const sc of regionSights.values()) { const cap = sc.update({ t: t / 1000, dt, player: pos, level: regionLvl, reduced: reducedMotion }); if (cap) cb.current.onMarginsNote?.(cap); }
        } catch { dropRegionSights(); }
      }
      if (dreamGlyph) { // S24: only while asleep in the garden; the plane is hidden (not updated) otherwise
        const asleepNow = bed === "sleep" && zones.is("garden");
        dreamLvl = dreamLevel(dreamLvl, asleepNow, dt);
        if (asleepNow || dreamLvl > 0) dreamGlyph.update(dreamAt(t / 1000, true, reducedMotion, dreamMode === "on"), dreamMode === "off" ? 0 : dreamLvl, { x: NIGHT.bed.x, y: NIGHT.bed.y, z: NIGHT.bed.z }, camera);
        else dreamGlyph.update(dreamAt(0, false, false), 0, { x: 0, y: 0, z: 0 }, camera);
      }
      if (drizzle) { // S25: only in the garden, and only while it drizzles; the object is hidden (not updated) when dry
        if (zones.is("garden")) drizzle.update(weatherNow(hourNow), t / 1000, reducedMotion, { x: pos.x, z: pos.z }, wander ? { x: wander.x, z: wander.z } : { x: NIGHT.bed.x, z: NIGHT.bed.z });
        else drizzle.object.visible = false;
      }
      if (dayScraps && zones.is("garden")) dayScraps.update(t / 1000, reducedMotion); // the day's scraps lift and settle the same way
      if (glyphScraps && zones.is("garden")) glyphScraps.update(t / 1000, reducedMotion); // S23: only the lift and tilt; skipped for reduced motion inside
      // W5: the spots across the World. Hold E at a folded page; the server says what is inside.
      let wNear: Place | null = null;
      if (zones.is("garden") && sc && !travel) {
        sc.update(t / 1000, reducedMotion);
        const idle = sit.phase === "standing" && !printNear && !hideFindable;
        const cand = idle ? nearestWorldSpot(pos, wSpots, wOpened) : null;
        if (cand !== wCand) { wCand = cand; wHold = 0; wBlocked = false; }
        const wv = unfoldView(false, wReady, wFailed);
        if (cand && !wv.canAsk && wv.noteOnHold && keys.has(PLAY.keys.hold)) { if (!wNoted) { cb.current.onMarginsNote?.(wv.noteOnHold); wNoted = true; } }
        else if (!keys.has(PLAY.keys.hold)) wNoted = false;
        const holding = !!cand && keys.has(PLAY.keys.hold) && !live.current.locked && !wBlocked && wv.canAsk;
        wHold = wPending ? 1 : holdStep(wHold, holding, dt);
        if (cand && !keys.has(PLAY.keys.hold)) wBlocked = false;
        if (wHold >= 1 && cand && !wPending) {
          const key = spotKey(cand.region, cand.id), hk = `${wDay}|${key}`;
          const full = cb.current.canGather && !cb.current.canGather("ink"); // the server picks the find, so any full pouch stops it first
          if (full) { cb.current.onGather?.("ink"); wBlocked = true; wHold = 0; }
          else if (wHeld.has(hk)) { // the server already gave this find: open it from the hold, no new call
            const kind = wHeld.get(hk)!; wHeld.delete(hk);
            const st = settleUnfold({ ok: true, kind, spot: cand.id, duplicate: false }, true, true);
            wOpened.add(key); sc.pop(key, t / 1000); wHold = 0;
            if (st.food) cb.current.onGather?.(st.food);
            reportSpots();
          }
          else if (wQuiet) { cb.current.onMarginsNote?.(QUIET); wBlocked = true; wHold = 0; } // the server already said no; don't ask again this stay
          else if (cb.current.onWorldUnfold) {
            wPending = true; // the ring waits full for the answer; the page opens only once it is back
            const spot = cand, myVisit = wVisit, askDay = wDay, dayOpened = wOpened, myScene = sc;
            cb.current.onWorldUnfold(spot.region, spot.id, askDay).catch((): Outcome => ({ ok: false, reason: "network" })).then((o) => {
              const here = myVisit === wVisit && zones.is("garden");
              const room = !cb.current.canGather || cb.current.canGather("ink");
              const st = settleUnfold(o, here, room);
              if (st.held) { // a full pouch: the page stays folded and the find is kept, with the gentle hint
                wHeld.set(`${askDay}|${key}`, st.held);
                if (here) { cb.current.onGather?.(st.held); wPending = false; wBlocked = true; wHold = 0; }
                return;
              }
              if (st.open) dayOpened.add(key); // the server wrote it, so the spot counts as open on any later stay that day
              if (st.food) cb.current.onGather?.(st.food); // a scrap is only shown: the server keeps no stock of it
              if (st.egg) cb.current.onMarginsNote?.(FOUND_EGG);
              if (st.cosmetic) { cosPlayUntil = performance.now() + 3000; cb.current.onKeepsake?.(st.cosmetic); } // the Print is on screen in the garden, so the put-on plays
              if (!here) return;
              wPending = false;
              if (st.ceiling) wQuiet = true;
              if (st.note && !st.egg) cb.current.onMarginsNote?.(st.note);
              if (st.open) { myScene.pop(key, performance.now() / 1000); wHold = 0; reportSpots(); }
              else { wBlocked = true; wHold = 0; } // refused: stays folded, nothing spent
            });
          } else { wBlocked = true; wHold = 0; }
        }
        if (cand) wNear = { id: "spot", kind: "unfold", x: cand.x, z: cand.z, label: "Folded page", prompt: "Hold to unfold" };
        if (cand && !wv.prompt) wNear = null;
        if (wHold > 0 && cand) {
          const v = new THREE.Vector3(cand.x, 0.8, cand.z).project(camera);
          ring.style.display = "block";
          ring.style.left = `${(v.x * 0.5 + 0.5) * el.clientWidth}px`;
          ring.style.top = `${(-v.y * 0.5 + 0.5) * el.clientHeight}px`;
          arc.setAttribute("stroke-dashoffset", String(CIRC * (1 - wHold)));
        }
      }

      // Third-person follow camera, pulled in near scenery and smoothed.
      const dir = { x: Math.sin(yaw) * Math.cos(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      const flat = Math.hypot(dir.x, dir.z) || 1;
      // While sitting the bench would pull the camera in on top of the player, so it keeps a fixed, slightly closer distance.
      const walkDist = zones.is("reading") ? cameraDistance({ x: pos.x - READING_OFF, z: pos.z }, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, rCols) : zones.is("home") ? cameraDistance({ x: pos.x - ROOM_OFF, z: pos.z }, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, roomCols) : zones.is("margins") ? cameraDistance({ x: pos.x - OFF, z: pos.z }, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, mCols) : cameraDistance(pos, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, gardenCols());
      // Blend with how far seated you are, so the camera eases in and out instead of jumping.
      const dist = walkDist + (GARDEN.camera.distance * (1 - SIT.cameraIn) - walkDist) * sf.lower;
      const onRise = groundHeight && zones.is("garden"); // H3: only the World's own rises; Margins and rooms keep today's code
      let hs = cameraHeights(ground, pitch, dist), want: THREE.Vector3;
      if (onRise) {
        if (!camInit) camPivot = ground; else camPivot = smoothPivot(camPivot, ground, dt);
        const cs = cameraOnGround(pos.x, pos.z, { x: dir.x / flat, z: dir.z / flat }, pitch, dist, camPivot, groundY);
        hs = { cam: cs.y, look: cs.look }; want = new THREE.Vector3(cs.x, cs.y, cs.z);
        sun.shadow.normalBias = shadowLift(groundY, pos.x, pos.z);
      } else {
        want = new THREE.Vector3(pos.x + (dir.x / flat) * dist * Math.cos(pitch), hs.cam, pos.z + (dir.z / flat) * dist * Math.cos(pitch));
        if (groundHeight && sun.shadow.normalBias !== 0) sun.shadow.normalBias = 0;
      }
      target.set(pos.x, hs.look, pos.z);
      if (!camInit) { camPos.copy(want); camInit = true; }
      camPos.lerp(want, 1 - Math.exp(-GARDEN.camera.smoothing * dt));
      if (onRise) camPos.y = keepAbove(camPos.x, camPos.y, camPos.z, groundY);
      camera.position.copy(camPos);
      camera.lookAt(target);

      const pn = !!printMesh && !!wander && printInReach(pos, wander);
      if (pn !== printNear) { printNear = pn; cb.current.onPrintNear(pn); }

      const hf = !!wander && canFind(hideS, pos, wander);
      if (hf !== hideFindable) { hideFindable = hf; cb.current.onFindable?.(hf); }
      const cs = canPlayerSplash(hourNow);
      if (cs !== canSplashShown) { canSplashShown = cs; cb.current.onCanSplash?.(cs); }

      if (!decor && room && zones.is("home") && live.current.decorPlaced) { decor = buildDecorScene(); room.group.add(decor.group); decorShown = live.current.decorPlaced; decor.snap(decorShown); } // the server answer can arrive after the room is built
      if (decor) { // the decorations: a change in the page's placements plays its motion on the frame clock
        const want = live.current.decorPlaced;
        if (want && want !== decorShown) { decorShown = want; decor.show(want, t / 1000); }
        decor.update(t / 1000, reducedMotion, nearby?.kind === "decor" ? nearby.id : null);
      }
      const n = travel ? null : zones.is("margins") ? mNear : zones.is("reading") ? rNear : zones.is("home") ? (inDoorZone({ x: pos.x - ROOM_OFF, z: pos.z }, "room") ? ROOM_DOOR : decor && !travel ? nearestPlot({ x: pos.x - ROOM_OFF, z: pos.z }) : null) : wNear ?? (inDoorZone(pos, "garden") ? GARDEN_DOOR : nearestPlace(pos));
      if (n?.id !== nearby?.id) { nearby = n; cb.current.onNearby(n); }
      if (skyScene) skyScene.update({ at: camera.position, hour: hourNow, t: t / 1000, reduced: reducedMotion, phase: skyPhase, weather: zones.is("garden") ? weatherNow(hourNow).tint : 0, cover: zones.is("garden") ? weatherNow(hourNow).intensity : 0 });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      endSkip();
      saveWalked();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("resize", onResize);
      dom.removeEventListener("pointercancel", pc);
      dom.removeEventListener("pointerdown", pd);
      dom.removeEventListener("pointerup", pu);
      dom.removeEventListener("pointermove", pm);
      ring.remove();
      wipe.remove();
      for (const c of [...dynamic.children]) disposeTree(c);
      dropSky();
      zones.dispose(); // frees the zone that is showing, through the same path as leaving
      if (mg) { scene.remove(mg.group); mg.dispose(); mg = null; }
      for (const m of [...ringPool, ...splashDrops]) { scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      for (const m of hideDrops) { scene.remove(m); (m.material as THREE.Material).dispose(); }
      scene.remove(flies);
      if (bugScene) { scene.remove(bugScene.group); bugScene.dispose(); }
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
