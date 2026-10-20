"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCreature, buildEgg, type Genes } from "@/lib/creature";
import {
  GARDEN, cameraDistance, colliders, hoverY, movePlayer, nearestPlace, newWander, printInReach, stepWander, type Place, type Vec, type Wander,
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
  hideStart, nextGameDelay, pickSpot, retryDelay as hideRetry, spotBehind, withSpot, type HideState,
} from "@/lib/hide";
import { hourOfDay, hourOverride, lightingAt } from "@/lib/daynight";

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
  t.repeat.set(GARDEN.size / 8, GARDEN.size / 8);
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

export default function World({ genes, species = "blotling", stage = "blot", eggPhase, onNearby, onInteract, onPrintNear, onFeedPrint, onFindable, onCanSplash, fedTick = 0, locked = false, onGather, canOffer = true }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const cb = useRef({ onNearby, onInteract, onPrintNear, onFeedPrint, onGather, onFindable, onCanSplash });
  cb.current = { onNearby, onInteract, onPrintNear, onFeedPrint, onGather, onFindable, onCanSplash };
  // Latest props for the render loop, which is created once.
  const live = useRef({ genes, eggPhase, stage, species, locked, canOffer });
  live.current = { genes, eggPhase, stage, species, locked, canOffer };
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
    const scene = new THREE.Scene();
    // Light follows the player's local clock (data/daynight.json); ?hour=21 previews a time of day.
    const override = hourOverride(window.location.search);
    const L0 = lightingAt(override ?? hourOfDay(new Date()));
    scene.background = new THREE.Color(L0.sky);
    scene.fog = new THREE.Fog(L0.fog, 30, 70);
    const camera = new THREE.PerspectiveCamera(55, el.clientWidth / el.clientHeight, 0.1, 100);
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
      new THREE.PlaneGeometry(GARDEN.size, GARDEN.size),
      new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    // soft page edge
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(GARDEN.size * 0.5, GARDEN.size * 2, 4, 1, Math.PI / 4, Math.PI * 2),
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
        if (hideFindable) {
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
      const L = lightingAt(hourNow);
      (scene.background as THREE.Color).set(L.sky);
      (scene.fog as THREE.Fog).color.set(L.fog);
      (edge.material as THREE.MeshBasicMaterial).color.set(L.sky);
      hemi.color.set(L.hemisphereSky);
      hemi.groundColor.set(L.hemisphereGround);
      hemi.intensity = L.hemisphereIntensity;
      sun.color.set(L.sun);
      sun.intensity = L.sunIntensity;
      sun.position.set(...L.sunPosition);
    };
    let last = performance.now();
    let raf = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      const res = !canWalk(sit) ? { pos, heading: Math.atan2(NIGHT.bed.x - pos.x, NIGHT.bed.z - pos.z) } : pgStart >= 0 ? { pos, heading: towardPond(pos) } : movePlayer(
        pos,
        { forward: k("KeyW", "ArrowUp") - k("KeyS", "ArrowDown"), right: k("KeyD", "ArrowRight") - k("KeyA", "ArrowLeft") },
        yaw,
        keys.has("ShiftLeft") || keys.has("ShiftRight") ? GARDEN.player.jogSpeed : GARDEN.player.speed,
        dt, GARDEN.player.radius, cols,
      );
      pos = res.pos;
      if (res.heading !== null) {
        let d = res.heading - player.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        player.rotation.y += d * Math.min(1, dt * 12);
      }
      // The hover bob fades out as the body lowers onto the seat; the pose is a fold, a tilt and a slow sway.
      player.rotation.order = "YXZ";
      player.position.set(pos.x, hoverY(t) + (SIT.y - hoverY(t)) * sf.lower, pos.z);
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
          const pick = hidePreview === "found" ? pickSpot(pos, wander, hideLast, cols, 0, 0.5, 0) ?? spotBehind(0, pos) : null;
          if (hidePreview === "found" && pick) {
            wander = { ...wander, x: pick.spot.x, z: pick.spot.z, tx: pick.spot.x, tz: pick.spot.z, wait: 1 };
            hideS = { ...withSpot(hideStart(), pick), phase: "found", t: 0 };
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

      // Third-person follow camera, pulled in near scenery and smoothed.
      const dir = { x: Math.sin(yaw) * Math.cos(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      const flat = Math.hypot(dir.x, dir.z) || 1;
      // While sitting the bench would pull the camera in on top of the player, so it keeps a fixed, slightly closer distance.
      const walkDist = cameraDistance(pos, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, cols);
      // Blend with how far seated you are, so the camera eases in and out instead of jumping.
      const dist = walkDist + (GARDEN.camera.distance * (1 - SIT.cameraIn) - walkDist) * sf.lower;
      target.set(pos.x, GARDEN.camera.height * 0.7, pos.z);
      const want = new THREE.Vector3(
        pos.x + (dir.x / flat) * dist * Math.cos(pitch),
        GARDEN.camera.height + Math.sin(pitch) * dist,
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

      const n = nearestPlace(pos);
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
