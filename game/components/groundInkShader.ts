// Ink on the land: the shader patch for the ground's toon material. The same sums as lib/groundInk.ts (which the tests pin), written for the GPU.
// Adds no draw call and no texture. Needs three per-vertex floats on the ground mesh: inkRegion (the region strength) and inkHome (the grain ease).
import * as THREE from "three";
import type { InkData } from "@/lib/groundInk";

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export function inkGlsl(d: InkData): { header: string; body: string } {
  const ink = new THREE.Color(d.mix.inkColor);
  const header = `
varying vec3 vInkW; varying vec3 vInkN; varying float vInkRegion; varying float vInkHome;
attribute float inkRegion; attribute float inkHome;`;
  const common = `
float inkSoft(float a, float b, float x) { float t = clamp((x - a) / max(b - a, 1e-6), 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
float inkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float inkNoise(vec2 p) { vec2 i = floor(p), u = fract(p); u = u * u * (3.0 - 2.0 * u);
  return mix(mix(inkHash(i), inkHash(i + vec2(1.0, 0.0)), u.x), mix(inkHash(i + vec2(0.0, 1.0)), inkHash(i + vec2(1.0, 1.0)), u.x), u.y); }`;
  const vert = `
vInkW = (modelMatrix * vec4(position, 1.0)).xyz; vInkN = normalize(mat3(modelMatrix) * normal); vInkRegion = inkRegion; vInkHome = inkHome;`;
  const a = (d.hatch.angleDeg * Math.PI) / 180;
  const frag = `
{
  float h = vInkW.y + 0.03; // the mesh sits 0.03 below y 0
  float dist = length(vViewPosition);
  float up = clamp(vInkN.y, 0.0, 1.0);
  float slope = sqrt(max(0.0, 1.0 - up * up)) / max(up, 1e-3);
  float steep = inkSoft(${f(d.hatch.minSteep)}, ${f(d.hatch.fullSteep)}, slope);
  vec2 nh = vInkN.xz; float nl = length(nh);
  float side = nl > 1e-5 ? clamp(-dot(nh / nl, normalize(vec2(${f(d.light[0])}, ${f(d.light[1])}))), 0.0, 1.0) : 0.0;
  float fade = 1.0 - inkSoft(${f(d.fade.near)}, ${f(d.fade.far)}, dist);
  // contour lines: a thin line every step metres of height, about width pixels wide
  float ph = h / ${f(d.contour.step)}; float pxh = max(fwidth(ph), 1e-6);
  float cd = abs(fract(ph) - 0.5);
  float line = inkSoft(0.5 - pxh * ${f(d.contour.width)}, 0.5, cd) * (1.0 - inkSoft(0.25, 0.5, pxh)) * step(${f(d.contour.minHeight)}, h);
  // hatching: diagonal strokes on the shaded side of slopes
  float hp = dot(vInkW.xz, vec2(${f(Math.cos(a))}, ${f(Math.sin(a))})) / ${f(d.hatch.spacing)}; float pxx = max(fwidth(hp), 1e-6);
  float hd = abs(fract(hp) - 0.5) * 2.0;
  float stroke = inkSoft(${f(1 - d.hatch.width)} - pxx, ${f(1 - d.hatch.width + 0.05)}, hd) * (1.0 - inkSoft(0.25, 0.5, pxx)) * steep * side;
  float amount = clamp(max(line * ${f(d.contour.strength)}, stroke * ${f(d.hatch.strength)}) * fade * vInkRegion, 0.0, 1.0);
  // broad shade, paper grain and wash
  float hr = clamp(h / ${f(d.shade.heightRef)}, 0.0, 1.0);
  float sh = -${f(d.shade.downhill)} * steep * side + ${f(d.shade.crest)} * hr - ${f(d.shade.hollow)} * (1.0 - hr) * clamp(h / 0.5, 0.0, 1.0);
  float gr = (inkHash(floor(vInkW.xz / ${f(d.grain.cell)})) - 0.5) * 2.0 * ${f(d.grain.amount)} * (1.0 - inkSoft(${f(d.grain.far * 0.6)}, ${f(d.grain.far)}, dist));
  float ws = (inkNoise(vInkW.xz / ${f(d.wash.cell)}) - 0.5) * 2.0 * ${f(d.wash.amount)};
  float pap = (gr + ws) * vInkHome;
  diffuseColor.rgb *= 1.0 + vec3(sh + pap, (sh + pap) * 0.9, (sh + pap) * 0.7); // cooler where it is shaded
  vec3 inkC = mix(diffuseColor.rgb * ${f(d.mix.darken)}, vec3(${f(ink.r)}, ${f(ink.g)}, ${f(ink.b)}), ${f(d.mix.ink)});
  diffuseColor.rgb = mix(diffuseColor.rgb, inkC, amount);
}`;
  return { header: header + common, body: vert + "\u0000" + frag };
}

/** Patch a toon material with the ink. Call once per material; the material keeps its lights, fog and shadows. */
export function applyInk(mat: THREE.MeshToonMaterial, d: InkData): void {
  const { header, body } = inkGlsl(d); const [vert, frag] = body.split("\u0000");
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\n" + header).replace("#include <begin_vertex>", "#include <begin_vertex>\n" + vert);
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\n" + header.replace(/attribute float \w+; attribute float \w+;/, "")).replace("#include <color_fragment>", "#include <color_fragment>\n" + frag);
  };
  mat.customProgramCacheKey = () => "groundInk:" + JSON.stringify(d);
}
