import * as THREE from "three";
import { partsFor, speciesById } from "@/lib/species";

export type Genes = { hue: number; shape: "round" | "tall" | "wide"; parts: string[] };

export const SCALE: Record<Genes["shape"], [number, number, number]> = {
  round: [1, 1, 1],
  tall: [0.85, 1.3, 0.85],
  wide: [1.25, 0.85, 1.1],
};

// A creature is built only from its genes: rounded body, two parts, a face.
export type Look = { partsShown: number; mark: string | null };

// `look` comes from the growth stage: young Prints show fewer parts and older ones get a small mark.
export function buildCreature(g: Genes, look: Look = { partsShown: 99, mark: null }, speciesId = "blotling"): THREE.Group {
  const sp = speciesById(speciesId);
  if (sp.body === "page") return buildLeaflet(g, look, sp.id);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(g.hue / 360, 0.55, 0.62), roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 24), mat);
  body.scale.set(...SCALE[g.shape]);
  body.position.y = 0.6 * SCALE[g.shape][1];
  group.add(body);
  const top = 1.2 * SCALE[g.shape][1];
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b2a });
  for (const x of [-0.2, 0.2]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 12), dark);
    eye.position.set(x * SCALE[g.shape][0], body.position.y + 0.1, 0.55 * SCALE[g.shape][2]);
    eye.userData.eye = true; // the idle blink (lib/fidget.ts) squashes these
    group.add(eye);
  }
  for (const p of g.parts.slice(0, look.partsShown)) {
    if (p === "ears") {
      for (const x of [-0.3, 0.3]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 16), mat);
        ear.position.set(x, top - 0.05, 0);
        group.add(ear);
      }
    } else if (p === "tail") {
      const tail = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), mat);
      tail.position.set(0, 0.4, -0.65 * SCALE[g.shape][2]);
      group.add(tail);
    } else if (p === "fins") {
      for (const x of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 3), mat);
        fin.rotation.z = (-x * Math.PI) / 2;
        fin.position.set(x * 0.7 * SCALE[g.shape][0], body.position.y, 0);
        group.add(fin);
      }
    }
  }
  if (look.mark === "leaf") {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x5e9c76, roughness: 0.6 }));
    leaf.position.set(0.05, top + 0.12, 0);
    leaf.rotation.z = -0.4;
    group.add(leaf);
  } else if (look.mark === "halo") {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 28), new THREE.MeshStandardMaterial({ color: 0xe3a83b, roughness: 0.4, emissive: 0x6b4a10 }));
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
  return egg;
}

// Leaflet: a folded page with a face. Two panels angled like an open book, so the silhouette is a
// flat "V" from above and a tall rectangle from the front, clearly unlike the round Blotling.
function buildLeaflet(g: Genes, look: Look, speciesId: string): THREE.Group {
  const sp = speciesById(speciesId);
  const group = new THREE.Group();
  const paper = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(g.hue / 360, 0.45, 0.7), roughness: 0.8 });
  const edge = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(g.hue / 360, 0.5, 0.5), roughness: 0.8 });
  const sc = SCALE[g.shape];
  const w = 0.55 * sc[0], h = 1.2 * sc[1];
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), paper);
    panel.position.set(side * w * 0.47, h / 2 + 0.05, 0);
    panel.rotation.y = side * -0.45;
    group.add(panel);
  }
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b2a });
  for (const x of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), dark);
    eye.position.set(x, h * 0.62, 0.17);
    eye.userData.eye = true;
    group.add(eye);
  }
  const top = h + 0.05;
  for (const part of partsFor(g.parts, sp).slice(0, look.partsShown)) {
    if (part === "tabs") {
      for (const x of [-0.22, 0.22]) {
        const tab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.05), edge);
        tab.position.set(x, top + 0.1, 0);
        group.add(tab);
      }
    } else if (part === "fold") {
      const flap = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.05, 3), edge);
      flap.rotation.set(Math.PI / 2, 0, Math.PI);
      flap.position.set(w * 0.8, 0.2, 0.22);
      group.add(flap);
    } else if (part === "spine") {
      const spine = new THREE.Mesh(new THREE.BoxGeometry(0.07, h * 0.9, 0.1), edge);
      spine.position.set(0, h / 2 + 0.05, -0.12);
      group.add(spine);
    }
  }
  if (look.mark === "leaf") {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 8), new THREE.MeshStandardMaterial({ color: 0x5e9c76, roughness: 0.6 }));
    leaf.position.set(0.05, top + 0.14, 0);
    leaf.rotation.z = -0.4;
    group.add(leaf);
  } else if (look.mark === "halo") {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 8, 28), new THREE.MeshStandardMaterial({ color: 0xe3a83b, roughness: 0.4, emissive: 0x6b4a10 }));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = top + 0.4;
    group.add(halo);
  }
  return group;
}
