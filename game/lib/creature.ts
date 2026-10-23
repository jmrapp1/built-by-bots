import * as THREE from "three";
import { partsFor, speciesById } from "@/lib/species";
import { addOutline } from "@/lib/outline";
import { PALETTE } from "@/lib/palette";
import { seeded, seedFrom } from "@/lib/fidget";
import { curl, lathe, leaning, smoothProfile, softBox, wobble } from "@/lib/shapes";
import SIL from "@/data/silhouettes.json";

export type Genes = { hue: number; shape: "round" | "tall" | "wide"; parts: string[] };

// The body envelope per shape: one source (data/silhouettes.json) read here and by lib/cosmetics.ts.
export const SCALE = SIL.envelope as Record<Genes["shape"], [number, number, number]>;
type Pts = Array<[number, number]>;
const prof = (p: unknown): Pts => p as Pts;

// A creature is built only from its genes: a lathed body, two parts, a face.
export type Look = { partsShown: number; mark: string | null };

const shaded = (mesh: THREE.Mesh): THREE.Mesh => { mesh.castShadow = true; mesh.receiveShadow = true; addOutline(mesh); return mesh; };

// Fixed draws per Print so the same genes always give the same Print, whatever parts the stage shows.
const draws = (g: Genes, speciesId: string): number[] => {
  const rnd = seeded(seedFrom(`${speciesId}|${g.hue}|${g.shape}|${g.parts.join(",")}|s28`));
  return Array.from({ length: 12 }, () => rnd());
};
const pm = (r: number) => r * 2 - 1; // -1..1

// Radius of a profile at a height (linear between points).
function radiusAt(pts: Pts, y: number): number {
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][1] >= y) {
      const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
      return y1 === y0 ? r1 : r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
    }
  }
  return 0;
}

// A lathed part (ear, tail, fin, leaf), optionally flattened, curled and tilted.
function part(profile: Pts, o: { flatten?: number; curlBy?: number; lean?: number; hScale?: number; segments?: number }): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = lathe(smoothProfile(profile, 14), o.segments ?? 12);
  if (o.hScale && o.hScale !== 1) geo.scale(1, o.hScale, 1);
  if (o.flatten) geo.scale(1, 1, 1 - o.flatten);
  if (o.curlBy) geo = curl(geo, o.curlBy);
  if (o.lean) geo = leaning(geo, o.lean);
  geo.computeVertexNormals();
  return geo;
}

// `look` comes from the growth stage: young Prints show fewer parts and older ones get a small mark.
export function buildCreature(g: Genes, look: Look = { partsShown: 99, mark: null }, speciesId = "blotling"): THREE.Group {
  const sp = speciesById(speciesId);
  if (sp.body === "page") return buildLeaflet(g, look, sp.id);
  const group = new THREE.Group();
  const r = draws(g, sp.id);
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(g.hue / 360, 0.55, 0.62), roughness: 0.6 });
  const sc = SCALE[g.shape];
  const bodyPts = smoothProfile(prof(SIL.body[g.shape]), 30);
  // Centre the lathe on its middle (so wobble and the old sphere pivot agree), lean a little, then stretch.
  let bodyGeo: THREE.BufferGeometry = lathe(bodyPts, 28);
  bodyGeo.translate(0, -0.6, 0);
  bodyGeo = wobble(bodyGeo, SIL.wobble, Math.floor(r[0] * 1e6));
  bodyGeo = leaning(bodyGeo, pm(r[1]) * SIL.leanMax);
  const body = shaded(new THREE.Mesh(bodyGeo, mat));
  body.scale.set(...sc);
  body.position.y = 0.6 * sc[1];
  group.add(body);
  const top = 1.2 * sc[1];
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.ink });
  const eyeY = 0.6 + 0.1 / sc[1]; // body units: the old eye height
  const er = radiusAt(bodyPts, eyeY);
  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), dark);
    eye.position.set(x * sc[0], body.position.y + 0.1, (Math.sqrt(Math.max(er * er - x * x, 0)) - 0.03) * sc[2]);
    eye.userData.eye = true; // the idle blink (lib/fidget.ts) squashes these
    group.add(eye);
  }
  for (const p of g.parts.slice(0, look.partsShown)) {
    if (p === "ears") {
      [-1, 1].forEach((side, i) => {
        const ear = shaded(new THREE.Mesh(part(prof(SIL.ear.profile), { curlBy: SIL.ear.curl * side, hScale: 1 + SIL.ear.heightVar * pm(r[2 + i]), lean: -side * 6 }), mat));
        ear.position.set(side * 0.3 * (0.9 + 0.1 * sc[0]), top - 0.3, 0);
        group.add(ear);
      });
    } else if (p === "tail") {
      const tail = shaded(new THREE.Mesh(part(prof(SIL.tail.profile), { curlBy: SIL.tail.curl * (r[4] < 0.5 ? -1 : 1) }), mat));
      tail.rotation.x = -Math.PI / 2 - SIL.tail.tilt; // a comma pointing back and up
      tail.position.set(0, 0.3, -0.55 * sc[2]);
      group.add(tail);
    } else if (p === "fins") {
      [-1, 1].forEach((side, i) => {
        const fin = shaded(new THREE.Mesh(part(prof(SIL.fin.profile), { flatten: SIL.fin.flatten, curlBy: SIL.fin.curl * side, hScale: 1 + 0.1 * pm(r[5 + i]) }), mat));
        fin.rotation.z = (-side * Math.PI) / 2;
        fin.position.set(side * 0.6 * sc[0], body.position.y, 0);
        group.add(fin);
      });
    }
  }
  if (look.mark === "leaf") {
    const leaf = shaded(new THREE.Mesh(part(prof(SIL.leaf.profile), { flatten: SIL.leaf.flatten }), new THREE.MeshStandardMaterial({ color: PALETTE.moss, roughness: 0.6 })));
    leaf.position.set(0.05, top - 0.04, 0);
    leaf.rotation.z = -0.4;
    group.add(leaf);
  } else if (look.mark === "halo") {
    const halo = shaded(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 28), new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.4, emissive: 0x6b4a10 })));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = top + 0.35;
    group.add(halo);
  }
  return group;
}

export function buildEgg(): THREE.Mesh {
  const egg = new THREE.Mesh(
    new THREE.SphereGeometry(0.5, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xf3ecd8, roughness: 0.4 }),
  );
  egg.scale.set(0.85, 1.15, 0.85);
  egg.position.y = 0.57;
  egg.castShadow = true; egg.receiveShadow = true; addOutline(egg);
  return egg;
}

// Leaflet: a folded page with a face. Two panels angled like an open book (a flat "V" from above, a tall
// rectangle from the front). S28: soft panels with one curled corner, a bowed spine, tabs of unequal length.
function buildLeaflet(g: Genes, look: Look, speciesId: string): THREE.Group {
  const sp = speciesById(speciesId);
  const group = new THREE.Group();
  const r = draws(g, sp.id);
  const paper = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(g.hue / 360, 0.45, 0.7), roughness: 0.8 });
  const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(g.hue / 360, 0.5, 0.5), roughness: 0.8 });
  const sc = SCALE[g.shape];
  const w = 0.55 * sc[0], h = 1.2 * sc[1];
  const L = SIL.leaflet;
  [-1, 1].forEach((side, i) => {
    const geo = softBox(w, h, 0.06, 0.025);
    // Curl the top outer corner toward the front: only the vertices near that corner move.
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const cc = L.cornerCurl * (i === (r[0] < 0.5 ? 0 : 1) ? 1.4 : 0.5);
    for (let k = 0; k < pos.count; k++) {
      const tx = Math.max(0, (side * pos.getX(k)) / (w / 2) - 0.4) / 0.6;
      const ty = Math.max(0, pos.getY(k) / (h / 2) - 0.4) / 0.6;
      pos.setZ(k, pos.getZ(k) + cc * tx * tx * ty * ty * Math.min(1, h));
    }
    geo.computeVertexNormals();
    const panel = shaded(new THREE.Mesh(geo, paper));
    panel.position.set(side * w * 0.47, h / 2 + 0.05, 0);
    panel.rotation.y = side * -0.45;
    group.add(panel);
  });
  const dark = new THREE.MeshStandardMaterial({ color: PALETTE.ink });
  for (const x of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), dark);
    eye.position.set(x, h * 0.62, 0.17);
    eye.userData.eye = true;
    group.add(eye);
  }
  const top = h + 0.05;
  for (const part of partsFor(g.parts, sp).slice(0, look.partsShown)) {
    if (part === "tabs") {
      [-1, 1].forEach((side, i) => {
        const th = L.tabs[i] * (1 + 0.15 * pm(r[1 + i]));
        const tab = shaded(new THREE.Mesh(softBox(0.16, th, 0.05, 0.03), edge));
        tab.position.set(side * 0.22, top + th / 2 - 0.04, 0);
        tab.rotation.z = -side * 0.08 * (1 + r[3]);
        group.add(tab);
      });
    } else if (part === "fold") {
      const flap = shaded(new THREE.Mesh(softBox(0.28, 0.04, 0.2, 0.018), edge));
      flap.rotation.y = 0.3 + 0.2 * pm(r[4]);
      flap.position.set(w * 0.8, 0.2, 0.22);
      group.add(flap);
    } else if (part === "spine") {
      const spine = shaded(new THREE.Mesh(curl(softBox(0.07, h * 0.9, 0.1, 0.03), L.spineBow * (r[5] < 0.5 ? -1 : 1)), edge));
      spine.position.set(0, h / 2 + 0.05, -0.12);
      group.add(spine);
    }
  }
  if (look.mark === "leaf") {
    const leaf = shaded(new THREE.Mesh(part2(), new THREE.MeshStandardMaterial({ color: PALETTE.moss, roughness: 0.6 })));
    leaf.position.set(0.05, top + 0.02, 0);
    leaf.rotation.z = -0.4;
    group.add(leaf);
  } else if (look.mark === "halo") {
    const halo = shaded(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 28), new THREE.MeshStandardMaterial({ color: PALETTE.gold, roughness: 0.4, emissive: 0x6b4a10 })));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = top + 0.4;
    group.add(halo);
  }
  return group;
}
const part2 = () => part(prof(SIL.leaf.profile), { flatten: SIL.leaf.flatten });
