"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildCreature, buildEgg, type Genes } from "@/lib/creature";
import {
  GARDEN, cameraDistance, colliders, hoverY, movePlayer, nearestPlace, newWander, printInReach, stepWander, type Place, type Wander,
} from "@/lib/world";
import { ripple } from "@/lib/ripple";
import { growthPulse, stageById } from "@/lib/growth";
import { hourOfDay, hourOverride, lightingAt } from "@/lib/daynight";

export type EggPhase = "unclaimed" | "in-nest";
type Props = {
  genes: Genes | null;
  stage?: string;
  eggPhase: EggPhase;
  onNearby: (place: Place | null) => void;
  onInteract: (place: Place) => void;
  onPrintNear: (near: boolean) => void;
  onFeedPrint: () => void;
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
        new THREE.MeshStandardMaterial({ color: 0x2a3a66, roughness: 0.15, metalness: 0.4 }),
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

export default function World({ genes, stage = "blot", eggPhase, onNearby, onInteract, onPrintNear, onFeedPrint }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const cb = useRef({ onNearby, onInteract, onPrintNear, onFeedPrint });
  cb.current = { onNearby, onInteract, onPrintNear, onFeedPrint };
  // Latest props for the render loop, which is created once.
  const live = useRef({ genes, eggPhase, stage });
  live.current = { genes, eggPhase, stage };
  const rebuild = useRef<() => void>(() => {});
  useEffect(() => { rebuild.current(); }, [genes, eggPhase, stage]);

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
    const renderer = new THREE.WebGLRenderer({ antialias: true });
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
      const { genes: g, eggPhase: phase, stage: st } = live.current;
      printMesh = null;
      if (g) {
        const sd = stageById(st);
        printMesh = buildCreature(g, { partsShown: sd.partsShown, mark: sd.mark });
        baseScale = GARDEN.print.scale * sd.scale;
        printMesh.scale.setScalar(baseScale);
        if (shownStage !== null && shownStage !== st) pulseStart = performance.now();
        shownStage = st;
        dynamic.add(printMesh);
        wander = wander ?? newWander({ x: nest.x, z: nest.z + 2 });
      } else {
        const egg = buildEgg();
        const at = phase === "in-nest" ? nest : eggSpot;
        egg.position.set(at.x, (phase === "in-nest" ? 0.2 : 0.55) + 0.57 * 0.6, at.z);
        egg.scale.multiplyScalar(0.6);
        dynamic.add(egg);
      }
    };
    rebuild.current();

    const keys = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.add(e.code);
      if (e.code === "KeyE" && !e.repeat) {
        if (printNear) cb.current.onFeedPrint();
        else if (nearby) cb.current.onInteract(nearby);
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
      const L = lightingAt(override ?? hourOfDay(new Date()));
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
      const res = movePlayer(
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
      player.position.set(pos.x, hoverY(t), pos.z);

      if (printMesh && wander) {
        wander = stepWander(wander, dt, rng, GARDEN.print.radius, GARDEN.print.speed, cols);
        printMesh.position.set(wander.x, Math.abs(Math.sin(t / 300)) * 0.03, wander.z);
        printMesh.rotation.y = wander.heading;
        const prog = pulseStart < 0 ? 0 : (performance.now() - pulseStart) / 1200;
        if (prog >= 1) pulseStart = -1;
        printMesh.scale.setScalar(baseScale * growthPulse(prog, reduced));
      }

      // Third-person follow camera, pulled in near scenery and smoothed.
      const dir = { x: Math.sin(yaw) * Math.cos(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      const flat = Math.hypot(dir.x, dir.z) || 1;
      const dist = cameraDistance(pos, { x: dir.x / flat, z: dir.z / flat }, GARDEN.camera.distance, GARDEN.camera.minDistance, cols);
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
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={mount} style={{ width: "100%", height: "100%" }} />;
}
