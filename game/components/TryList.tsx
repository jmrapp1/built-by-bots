"use client";
// "Things to try": an ink-blot tab that opens a small paper card. Local storage only, no server, never blocks input.
// It only watches signals the page already has (see lib/tryList.ts for the wording and the logic).
import { useEffect, useRef, useState } from "react";
import { TRY_KEY, TRY_TEXT, allDone, browserStore, lineText, lines, markDone, readTry, tabVisible, writeTry, type Item } from "@/lib/tryList";

export type TryProps = {
  loaded: boolean; // eggs and Prints have been read
  inGarden: boolean;
  guideDone: boolean; // every guide step is finished or skipped
  guideHint: boolean; // a guide hint is on screen: the guide wins
  dailyKnown: boolean;
  dailyUp: boolean; // today's egg can be collected
  forageTick: number; // goes up when a snack is picked up
  fedTick: number; // goes up on each successful feed
  dailyTick: number; // goes up when the daily egg is collected
  atPond: boolean;
  talking: boolean; // a neighbour's talk is open
  preview?: "on" | "reset" | null; // dev only
};

export default function TryList(p: TryProps) {
  const [st, setSt] = useState({ done: [] as Item[], retired: false });
  const [read, setRead] = useState(false);
  const [open, setOpen] = useState(false);
  const store = useRef<ReturnType<typeof browserStore>>(null);
  const seen = useRef({ forage: p.forageTick, fed: p.fedTick, daily: p.dailyTick, talking: p.talking });
  const keep = (n: { done: Item[]; retired: boolean }) => { if (p.preview !== "on") writeTry(store.current, n); return n; };
  const tick = (item: Item) => setSt((s) => (s.done.includes(item) ? s : keep({ ...s, done: markDone(s.done, item) })));

  useEffect(() => {
    store.current = browserStore();
    if (p.preview === "reset") { try { store.current?.setItem(TRY_KEY, ""); } catch { /* storage blocked: nothing to clear */ } }
    setSt(p.preview ? { done: [], retired: false } : readTry(store.current));
    setRead(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (p.forageTick > seen.current.forage) tick("forage"); seen.current.forage = p.forageTick; }, [p.forageTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.fedTick > seen.current.fed) tick("share"); seen.current.fed = p.fedTick; }, [p.fedTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.dailyTick > seen.current.daily) tick("egg"); seen.current.daily = p.dailyTick; }, [p.dailyTick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.atPond && p.inGarden) tick("pond"); }, [p.atPond, p.inGarden]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (p.talking && !seen.current.talking) tick("neighbour"); seen.current.talking = p.talking; }, [p.talking]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = { dailyUp: p.dailyUp };
  const finished = p.dailyKnown && allDone(st.done, c);
  // Once everything is ticked the closing line is shown this visit, and the card is retired for next time.
  useEffect(() => { if (read && finished && !st.retired && open) setSt((s) => keep({ ...s, retired: true })); }, [read, finished, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const retire = () => { setOpen(false); setSt((s) => keep({ ...s, retired: true })); };
  const visible = read && tabVisible({ retired: false, guideDone: p.guideDone || p.preview === "on", guideHint: p.guideHint, inGarden: p.inGarden, loaded: p.loaded, dailyKnown: p.dailyKnown });
  const [gone, setGone] = useState(false); // retired during this visit: stays up only until closed
  useEffect(() => { if (!open && st.retired && !finished) setGone(true); }, [open, st.retired, finished]);

  useEffect(() => { // Escape retires an open card
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.code === "Escape") { retire(); setGone(true); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible || gone || (st.retired && !open)) return null;
  return (
    <div className="try-wrap">
      {open ? (
        <section className="card try-card" aria-label={TRY_TEXT.title}>
          {finished ? <p className="try-closing" role="status">{TRY_TEXT.closing}</p> : (
            <>
              <h2>{TRY_TEXT.title}</h2>
              <ul>
                {lines(st.done, c).map((l) => (
                  <li key={l.item} className={l.state !== "open" ? "try-done" : undefined}>
                    <span aria-hidden="true" className="try-tick">{l.state === "open" ? "○" : "✓"}</span>
                    <span>{lineText(l)}</span>
                    <span className="sr-only">{l.state === "open" ? " (not yet)" : " (done)"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="try-actions">
            <button className="btn" onClick={() => setOpen(false)}>{TRY_TEXT.close}</button>
            <button className="btn" onClick={() => { retire(); setGone(true); }}>{TRY_TEXT.notNow}</button>
          </div>
        </section>
      ) : (
        <button className="try-tab" aria-expanded={false} aria-label={TRY_TEXT.tab} title={TRY_TEXT.tab} onClick={() => setOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M11 2c3 0 4 2 6 3s3 4 2 7-3 7-8 8-8-3-8-7 2-6 4-8 2-3 4-3z" fill="currentColor" /></svg>
        </button>
      )}
    </div>
  );
}
