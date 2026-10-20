import * as THREE from "three";

export type Genes = { hue: number; shape: "round" | "tall" | "wide"; parts: string[] };

const SCALE: Record<Genes["shape"], [number, number, number]> = {
  round: [1, 1, 1],
  tall: [0.85, 1.3, 0.85],
  wide: [1.25, 0.85, 1.1],
};

// A creature is built only from its genes: rounded body, two parts, a face.
export type Look = { partsShown: number; mark: string | null };

// `look` comes from the growth stage: young Prints show fewer parts and older ones get a small mark.
export function buildCreature(g: Genes, look: Look = { partsShown: 99, mark: null }): THREE.Group {
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
