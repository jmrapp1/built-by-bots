"use client";
// S20: a one-time calm card. Local storage only, no server, never blocks input. Logic and wording live in lib/gentle.ts.
import { useEffect, useRef, useState } from "react";
import { GENTLE_TEXT, browserStore, clearGentle, readGentle, shouldShow, writeGentle, type GentlePreview } from "@/lib/gentle";

export type GentleProps = {
  hasPrint: boolean;
  otherOpen: boolean; // any other card, hint, picker, map, menu or talk is open
  welcomeShown: boolean; // Welcome back showed this session
  preview?: GentlePreview | null; // dev only
};

export default function Gentle(p: GentleProps) {
  const store = useRef<ReturnType<typeof browserStore>>(null);
  const done = useRef(false); // closed or retired this session
  const [saved, setSaved] = useState(true); // assume saved until storage is read
  const [ready, setReady] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [open, setOpen] = useState(false);
  const start = useRef(0);

  useEffect(() => {
    store.current = browserStore();
    if (p.preview === "reset") clearGentle(store.current);
    setSaved(p.preview ? false : readGentle(store.current));
    start.current = Date.now();
    setReady(true);
    const iv = setInterval(() => setElapsed(Date.now() - start.current), 5_000);
    return () => clearInterval(iv);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If Welcome back showed this session, that card already says it: mark done silently.
  useEffect(() => {
    if (!ready || !p.welcomeShown || p.preview || done.current) return;
    done.current = true;
    writeGentle(store.current);
  }, [ready, p.welcomeShown]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready || open || p.preview === "reset") return;
    if (p.preview === "on") { if (!done.current) setOpen(true); return; }
    if (shouldShow({ hasPrint: p.hasPrint, inWorldMs: elapsed, otherOpen: p.otherOpen, saved, doneThisSession: done.current, welcomeShown: p.welcomeShown })) setOpen(true);
  }, [ready, elapsed, p.hasPrint, p.otherOpen, p.welcomeShown, saved, open, p.preview]);

  const close = () => {
    setOpen(false);
    done.current = true;
    if (!p.preview) writeGentle(store.current);
  };

  useEffect(() => { // Escape closes it
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.code === "Escape") close(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  return (
    <section className="card welcome gentle" aria-label={GENTLE_TEXT.title} role="status" onClick={close}>
      <h2>{GENTLE_TEXT.title}</h2>
      <p className="note">{GENTLE_TEXT.body}</p>
      <button className="btn" onClick={(e) => { e.stopPropagation(); close(); }}>{GENTLE_TEXT.close}</button>
    </section>
  );
}
