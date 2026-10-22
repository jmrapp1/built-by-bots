"use client";
// S17: a small dismissible card on the first return after a while away. Local storage only, no server, never blocks input.
// Logic and wording live in lib/welcome.ts.
import { useEffect, useRef, useState } from "react";
import { PREVIEW_AWAY_H, WELCOME_KEY, WELCOME_TEXT, WRITE_EVERY_MS, browserStore, readSeen, welcomeFor, writeSeen, type Seen, type Welcome, type WelcomePreview } from "@/lib/welcome";

export type WelcomeProps = {
  loaded: boolean; // eggs and Prints have been read
  guideDone: boolean;
  guideHint: boolean; // a guide hint is on screen: the guide wins
  clear: boolean; // no menu, map or talk is open
  creature: { id: string; stage: string; hungry: boolean } | null;
  preview?: WelcomePreview | null; // dev only
  onCard?: (showing: boolean) => void; // S20: tells the page when the card is up
};

export default function WelcomeBack(p: WelcomeProps) {
  const store = useRef<ReturnType<typeof browserStore>>(null);
  const prev = useRef<Seen | null>(null); // what was stored before this visit
  const decided = useRef(false);
  const latest = useRef(p.creature);
  latest.current = p.creature;
  const [card, setCard] = useState<Welcome | null>(null);
  const [read, setRead] = useState(false);

  useEffect(() => {
    store.current = browserStore();
    if (p.preview === "reset") { try { store.current?.setItem(WELCOME_KEY, ""); } catch { /* storage blocked: nothing to clear */ } }
    prev.current = readSeen(store.current);
    if (p.preview && p.preview !== "reset") prev.current = { t: Date.now() - PREVIEW_AWAY_H[p.preview] * 3_600_000 };
    setRead(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep "last seen" fresh: every minute while open and when the tab is hidden. Never in a preview.
  useEffect(() => {
    if (!read || p.preview) return;
    const save = () => {
      const c = latest.current;
      const old = readSeen(store.current);
      writeSeen(store.current, { t: Date.now(), ...(c ? { creatureId: c.id, stage: c.stage } : old?.creatureId ? { creatureId: old.creatureId, stage: old.stage } : {}), ...(old?.shownAt !== undefined ? { shownAt: old.shownAt } : {}) });
    };
    save();
    const iv = setInterval(save, WRITE_EVERY_MS);
    const vis = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [read]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decide once. A guide hint on screen means the player is still in the first run: no card this visit.
  useEffect(() => {
    if (!read || decided.current || !p.loaded) return;
    if (p.guideHint) { decided.current = true; return; }
    if (!p.guideDone || !p.creature) return;
    decided.current = true;
    const w = welcomeFor(prev.current, Date.now(), p.creature);
    if (!w) return;
    setCard(w);
    if (!p.preview) writeSeen(store.current, { ...(readSeen(store.current) ?? { t: Date.now() }), shownAt: Date.now() });
  }, [read, p.loaded, p.guideDone, p.guideHint, p.creature]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // Escape closes it
    if (!card) return;
    const k = (e: KeyboardEvent) => { if (e.code === "Escape") setCard(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [card]);

  useEffect(() => { p.onCard?.(!!card); }, [card]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!card || !p.clear) return null;
  return (
    <section className="card welcome" aria-label={WELCOME_TEXT.title} role="status" onClick={() => setCard(null)}>
      <h2>{WELCOME_TEXT.title}</h2>
      {card.lines.map((l) => <p key={l} className="note">{l}</p>)}
      <button className="btn" onClick={(e) => { e.stopPropagation(); setCard(null); }}>{WELCOME_TEXT.close}</button>
    </section>
  );
}
