"use client";
// S13: one quiet line that points a first-timer at Home. Reads nothing from the server and sends nothing.
// Never takes focus or blocks input. Which lines were shown is kept in local storage only (see lib/homeHint.ts).
import { useEffect, useRef, useState } from "react";
import { HOME_HINT_KEY, HOME_HINT_TEXT, browserStore, markShown, nextHint, readShown, writeShown, type HomeHint, type HomeHintPreview } from "@/lib/homeHint";

export type HomeHintProps = {
  loaded: boolean;
  clear: boolean; // nothing is covering the world
  guideDone: boolean;
  guideHint: boolean;
  hasCreature: boolean;
  nearDoor: boolean;
  nearPlot: boolean;
  decorTick: number; // goes up each time a Decorate succeeds
  raise?: number; // px to lift the line when another prompt sits under it
  preview?: HomeHintPreview | null; // dev-only: show a line without the guide or a Print; nothing is saved
};

export default function HomeHintLine(p: HomeHintProps) {
  const pv = p.preview === "door" || p.preview === "inside";
  const [shown, setShown] = useState<HomeHint[]>([]);
  const [read, setRead] = useState(false);
  const [dismissed, setDismissed] = useState<HomeHint[]>([]);
  const [decorated, setDecorated] = useState(false);
  const store = useRef<ReturnType<typeof browserStore>>(null);
  const active = useRef<HomeHint | null>(null);
  const tick0 = useRef(p.decorTick);

  useEffect(() => {
    store.current = browserStore();
    if (p.preview === "reset") { try { store.current?.setItem(HOME_HINT_KEY, ""); } catch { /* quiet */ } }
    if (pv) store.current = null;
    setShown(pv || p.preview === "reset" ? [] : readShown(store.current));
    setRead(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A successful Decorate retires the inside line for good.
  useEffect(() => {
    if (p.decorTick > tick0.current) { setDecorated(true); setShown((s) => { const n = markShown(s, "inside"); writeShown(store.current, n); return n; }); }
    tick0.current = p.decorTick;
  }, [p.decorTick]);

  const ctx = {
    ready: read && p.loaded && p.clear,
    guideDone: pv || p.guideDone, guideHint: !pv && p.guideHint, hasCreature: pv || p.hasCreature,
    nearDoor: p.nearDoor, nearPlot: p.nearPlot, decorated, leftHome: false,
  };
  const hint = nextHint(shown, ctx, active.current, dismissed);
  useEffect(() => { // count a line as shown the moment it appears; it stays up while the place is still true
    active.current = hint;
    if (hint && !shown.includes(hint)) setShown((s) => { const n = markShown(s, hint); writeShown(store.current, n); return n; });
  }, [hint]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // Escape hides the line on show and keeps it hidden
    if (!hint) return;
    const k = (e: KeyboardEvent) => { if (e.code === "Escape") setDismissed((d) => markShown(d as HomeHint[], hint)); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [hint]);

  if (!hint) return null;
  return <p className="guide-hint" role="status" style={{ bottom: 168 + (p.raise ?? 0) }}>{HOME_HINT_TEXT[hint]}</p>;
}
