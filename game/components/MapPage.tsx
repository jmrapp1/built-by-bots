"use client";
// W4: the hand-inked map page, opened with M. Drawn on a canvas from the walked cells; unwalked parts stay blank paper. No text on it.
import { useEffect, useRef } from "react";
import { MAP, cellCentre, isWalked, pageScale, pathRuns, pin, seenLandmarks, seenSignposts, toPage, type Walked } from "@/lib/map";
import { CELLS_PX } from "@/lib/mapView";
import { regionAt } from "@/lib/worldMap";

export default function MapPage({ walked, pose, opened = [], onClose }: { walked: Walked; opened?: { x: number; z: number }[]; pose: { x: number; z: number; yaw: number } | null; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext("2d"); if (!g) return;
    const px = CELLS_PX, k = pageScale(px), cell = MAP.cell * k, L = MAP.look;
    g.clearRect(0, 0, px, px);
    g.fillStyle = L.paper; g.fillRect(0, 0, px, px);
    g.strokeStyle = "rgba(120,140,170,0.25)"; g.lineWidth = 1; // the ruled lines of the page
    for (let y = 24; y < px; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(px, y); g.stroke(); }
    for (const i of walked) { // a walked cell is washed in the colour of its region, a little bigger so neighbours join up
      const p = cellCentre(i), q = toPage(p.x, p.z, px);
      const rg = regionAt(p.z, p.x); g.fillStyle = rg === "inkwood" ? L.inkwood : rg === "paper_downs" ? L.paper_downs : L.meadow; g.globalAlpha = 0.85;
      g.fillRect(q.x - cell / 2 - 0.5, q.z - cell / 2 - 0.5, cell + 1, cell + 1);
    }
    g.globalAlpha = 1;
    g.strokeStyle = L.path; g.lineWidth = 3; g.lineCap = "round"; g.lineJoin = "round";
    for (const run of pathRuns(walked)) { g.beginPath(); run.forEach((p, n) => { const q = toPage(p.x, p.z, px); if (n) g.lineTo(q.x, q.z); else g.moveTo(q.x, q.z); }); g.stroke(); }
    g.strokeStyle = L.ink; g.fillStyle = L.ink; g.lineWidth = 2;
    for (const l of seenLandmarks(walked)) { // one small ink mark per landmark you have walked up to
      const q = toPage(l.x, l.z, px);
      g.beginPath();
      if (l.kind === "tower") g.rect(q.x - 4, q.z - 9, 8, 14);
      else if (l.kind === "spire") { g.moveTo(q.x, q.z - 11); g.lineTo(q.x - 4, q.z + 4); g.lineTo(q.x + 4, q.z + 4); g.closePath(); }
      else if (l.kind === "bigtree") { g.moveTo(q.x, q.z - 10); g.lineTo(q.x - 8, q.z + 2); g.lineTo(q.x + 8, q.z + 2); g.closePath(); }
      else if (l.kind === "hill") { g.moveTo(q.x - 10, q.z + 4); g.quadraticCurveTo(q.x, q.z - 12, q.x + 10, q.z + 4); g.closePath(); }
      else g.arc(q.x, q.z - 4, 5, 0, Math.PI * 2);
      g.stroke();
    }
    for (const s of seenSignposts(walked)) { const q = toPage(s.x, s.z, px); g.beginPath(); g.arc(q.x, q.z, 3.5, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = L.ink; g.fillStyle = L.pin; g.lineWidth = 1.5; // W5: a small folded-page mark where a spot was opened today (only where you have been)
    for (const o of opened) { if (!isWalked(walked, o.x, o.z)) continue; const q = toPage(o.x, o.z, px); g.beginPath(); g.moveTo(q.x - 4, q.z - 3); g.lineTo(q.x + 4, q.z - 3); g.lineTo(q.x + 4, q.z + 3); g.lineTo(q.x - 4, q.z + 3); g.closePath(); g.moveTo(q.x - 4, q.z - 3); g.lineTo(q.x, q.z + 1); g.lineTo(q.x + 4, q.z - 3); g.stroke(); }
    g.strokeStyle = L.ink; g.lineWidth = 3; g.strokeRect(1.5, 1.5, px - 3, px - 3);
    if (pose) { // the pin: a red arrow where you stand, pointing the way you face
      const p = pin(pose.x, pose.z, pose.yaw, px);
      g.save(); g.translate(p.x, p.z); g.rotate(p.angle); g.fillStyle = L.pin; g.strokeStyle = L.ink; g.lineWidth = 2;
      g.beginPath(); g.moveTo(11, 0); g.lineTo(-7, 7); g.lineTo(-3, 0); g.lineTo(-7, -7); g.closePath(); g.fill(); g.stroke(); g.restore();
    }
  }, [walked, pose, opened]);
  return (
    <div className="card tray mappage" role="dialog" aria-label="Map">
      <canvas ref={ref} width={CELLS_PX} height={CELLS_PX} aria-hidden="true" />
      <button className="btn quiet" onClick={onClose}>Close</button>
    </div>
  );
}
