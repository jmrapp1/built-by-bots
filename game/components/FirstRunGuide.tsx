"use client";
// First-run guide: one quiet hint line and a soft egg pointer. Reads nothing from the server and sends nothing.
// Never takes focus or blocks input. Progress is kept in local storage only (see lib/guide.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import { GARDEN } from "@/lib/world";
import { PLAY } from "@/lib/play";
import { hourOfDay, hourOverride } from "@/lib/daynight";
import { GUIDE_TEXT, STEPS, PREVIEW_DONE, PREVIEW_DONE_HATCH, PREVIEW_DONE_MAP, PREVIEW_DONE_STROKE, afterEggClaimed, browserStore, currentHint, eggBearing, feedFinishes, guideDay, hasMoved, hintText, mapFinishes, markDone, nestPointerOn, pointerOn, readDone, strokeFinishes, writeDone, type GuidePreview, type Step } from "@/lib/guide";

export type GuideProps = {
  loaded: boolean; // the player's eggs and Prints have been read
  clear: boolean; // nothing is covering the world (no panel, menu or map)
  existing: boolean; // saved progress: a Print or a hatched egg
  eggClaimed: boolean; // the starter egg has been collected
  nearEgg: boolean;
  printNear: boolean;
  hasSnack: boolean;
  hasCreature: boolean;
  hasWaiting?: boolean; // an egg is in the nest
  nearNest?: boolean;
  hatchWait?: number; // seconds until the egg can hatch
  fedTick: number;
  mapOpen?: boolean; // the map panel is open
  strokeTick?: number; // goes up each time a stroke starts
  touch?: boolean; // S38a: touch words instead of key words (already includes the wording switch)
  raise?: number; // px to lift the hint when another prompt sits under it
  pose: { x: number; z: number; yaw: number } | null; // null away from the garden
  onGlow: (on: boolean) => void;
  onStatus?: (s: { finished: boolean; hint: boolean }) => void; // S12: every step done or skipped, and whether a hint is on screen
  preview?: GuidePreview | null; // dev-only ?guide=hatch|feed|stroke|map: fake state, nothing saved; the hold key stands in for a hatch (at the nest) or a feed, the stroke key for a stroke
};

export default function FirstRunGuide(raw: GuideProps) {
  const pv = !!raw.preview;
  const [pvTick, setPvTick] = useState(0), [pvStroke, setPvStroke] = useState(0);
  const [pvHatched, setPvHatched] = useState(false), [pvWait, setPvWait] = useState(5);
  const hp = raw.preview === "hatch";
  const p: GuideProps = pv ? { ...raw, loaded: true, existing: false, eggClaimed: true, nearEgg: false, printNear: !hp || pvHatched, hasSnack: true, hasCreature: !hp || pvHatched, hasWaiting: hp && !pvHatched, hatchWait: hp ? pvWait : 0, fedTick: pvTick, strokeTick: pvStroke } : raw;
  const [fedNow, setFedNow] = useState(raw.preview === "stroke" || raw.preview === "map"); // the feed step finished in this visit
  const [done, setDone] = useState<Step[]>([]);
  const [read, setRead] = useState(false);
  const [dismissed, setDismissed] = useState<Step[]>([]);
  const store = useRef<ReturnType<typeof browserStore>>(null);
  const start = useRef<{ x: number; z: number } | null>(null);
  const fed0 = useRef(p.fedTick);
  const stroke0 = useRef(p.strokeTick ?? 0);
  const mapWas = useRef(!!p.mapOpen);
  const shown = useRef<Step | null>(null); // the hint on screen in the previous render
  const egg = useMemo(() => GARDEN.places.find((x) => x.kind === "egg")!, []);
  const nest = useMemo(() => GARDEN.places.find((x) => x.kind === "nest")!, []);

  const finish = (steps: Step[]) => setDone((d) => { const n = steps.reduce(markDone, d); if (n.length !== d.length) writeDone(store.current, n); return n; });

  useEffect(() => { store.current = pv ? null : browserStore(); setDone(pv ? [...(raw.preview === "hatch" ? PREVIEW_DONE_HATCH : raw.preview === "map" ? PREVIEW_DONE_MAP : raw.preview === "stroke" ? PREVIEW_DONE_STROKE : PREVIEW_DONE)] : readDone(store.current)); setRead(true); }, []);
  useEffect(() => { if (read && p.loaded && p.existing) finish([...STEPS]); }, [read, p.loaded, p.existing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (read && p.loaded && p.eggClaimed) setDone((d) => { const n = afterEggClaimed(d); if (n.length !== d.length) writeDone(store.current, n); return n; }); }, [read, p.loaded, p.eggClaimed]);
  useEffect(() => { if (feedFinishes(shown.current, fed0.current, p.fedTick)) { finish(["feed"]); setFedNow(true); } fed0.current = p.fedTick; }, [p.fedTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (strokeFinishes(shown.current, stroke0.current, p.strokeTick ?? 0)) finish(["stroke"]); stroke0.current = p.strokeTick ?? 0; }, [p.strokeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (read && mapFinishes(mapWas.current, !!p.mapOpen)) finish(["map"]); mapWas.current = !!p.mapOpen; }, [read, p.mapOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (read && p.loaded && p.hasCreature) finish(["hatch"]); }, [read, p.loaded, p.hasCreature]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // preview only: a short fake wait for the hatch
    if (!hp) return;
    const t = setInterval(() => setPvWait((w) => Math.max(0, w - 1)), 1000);
    return () => clearInterval(t);
  }, [hp]);

  useEffect(() => { // preview only: the hold key counts as one feed, the stroke key as one stroke
    if (!pv) return;
    const k = (e: KeyboardEvent) => { if (e.repeat) return; if (e.code === PLAY.keys.hold) { if (hp && !pvHatched) { if (raw.nearNest && pvWait === 0) setPvHatched(true); } else setPvTick((t) => t + 1); } else if (e.code === PLAY.keys.stroke) setPvStroke((t) => t + 1); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [pv, hp, pvHatched, pvWait, raw.nearNest]);

  const ready = read && p.loaded && !p.existing && p.clear && !!p.pose;
  useEffect(() => { // walking finishes the first step
    if (!ready || !p.pose) return;
    if (!start.current) start.current = { x: p.pose.x, z: p.pose.z };
    else if (hasMoved(start.current, p.pose)) finish(["move"]);
  }, [ready, p.pose]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = { ready, inGarden: !!p.pose, nearEgg: p.nearEgg, eggPending: !p.eggClaimed, printNear: p.printNear, hasSnack: p.hasSnack, hasCreature: p.hasCreature, hasWaiting: p.hasWaiting, nearNest: p.nearNest, hatchWait: p.hatchWait, fedThisSession: fedNow, day: guideDay(hourOverride(typeof window === "undefined" ? "" : window.location.search) ?? hourOfDay(new Date())), dismissed };
  const hint = currentHint(done, ctx);
  useEffect(() => { shown.current = hint; }); // after the feed effect, so that one sees the hint from before the feed
  const pointer = pointerOn(done, ctx), nestPointer = nestPointerOn(done, ctx);
  const glow = read && p.loaded && !p.existing && !p.eggClaimed && !done.includes("egg");
  const finished = read && p.loaded && (p.existing || STEPS.every((x) => done.includes(x)));
  useEffect(() => { p.onStatus?.({ finished, hint: !!hint }); }, [finished, hint]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { p.onGlow(glow); }, [glow]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // Escape hides the hint on show and keeps it hidden
    if (!hint) return;
    const k = (e: KeyboardEvent) => { if (e.code === "Escape") { setDismissed((d) => markDone(d, hint)); finish([hint]); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [hint]); // eslint-disable-line react-hooks/exhaustive-deps

  const b = p.pose ? (pointer ? eggBearing(p.pose, egg) : nestPointer ? eggBearing(p.pose, nest) : null) : null;
  return (
    <>
      {b && !b.inView && (
        <div className="guide-arrow" aria-hidden="true" style={{ left: `${50 + Math.sin(b.angle) * 42}%`, top: `${50 - Math.cos(b.angle) * 36}%` }}>
          <svg width="34" height="34" viewBox="0 0 34 34" style={{ transform: `rotate(${b.angle}rad)` }}><path d="M17 4 L27 26 L17 20 L7 26 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" /></svg>
          <span className="sr-only">{pointer ? GUIDE_TEXT.arrow : GUIDE_TEXT.nestArrow}</span>
        </div>
      )}
      {hint && <p className="guide-hint" role="status" style={p.raise ? { bottom: 168 + p.raise } : undefined}>{hintText(hint, !!p.nearNest, p.hatchWait ?? 0, !!p.touch)}</p>}
    </>
  );
}
