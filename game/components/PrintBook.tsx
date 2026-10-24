"use client";
// S35: the Print book. A paper page that lists every Print; the arrows move the highlight, Enter (or a click) picks one.
// It only reports the choice; the page keeps the picked index. Nothing is sent or saved here.
import { useEffect, useRef, useState } from "react";
import { BOOK, moveHighlight, startIndex, trapTab, type BookEntry } from "@/lib/printBook";
import { KeyCap, MoodFace } from "@/components/ui";
import { keyLabel } from "@/lib/ui";

const Portrait = ({ hue }: { hue: number }) => (
  <svg width="56" height="56" viewBox="0 0 36 36" aria-hidden="true">
    <path d="M18 3c6 7 12 12 12 19a12 12 0 0 1-24 0C6 15 12 10 18 3z" fill={`hsl(${hue} 52% 66%)`} stroke="#2b2a33" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="13.5" cy="22" r="1.8" fill="#2b2a33" /><circle cx="22.5" cy="22" r="1.8" fill="#2b2a33" />
    <path d="M14 27q4 3 8 0" stroke="#2b2a33" strokeWidth="2" strokeLinecap="round" fill="none" />
  </svg>
);

export default function PrintBook({ entries, picked, onChoose, onClose }: { entries: BookEntry[]; picked: number | null; onChoose: (index: number) => void; onClose: () => void }) {
  const [at, setAt] = useState(() => startIndex(entries.length, picked));
  const root = useRef<HTMLDivElement>(null);
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const current = startIndex(entries.length, picked);
  const shown = entries[Math.min(at, entries.length - 1)];
  useEffect(() => { cells.current[at]?.focus(); }, []); // focus lands on the highlighted entry
  const go = (to: number) => { setAt(to); cells.current[to]?.focus(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.code === "Tab") { // focus stays inside the book
      const f = Array.from(root.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      if (!f.length) return;
      e.preventDefault();
      const i = f.indexOf(document.activeElement as HTMLElement);
      f[trapTab(f.length, i < 0 ? 0 : i, e.shiftKey)].focus();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.code)) {
      e.preventDefault();
      go(moveHighlight(entries.length, at, e.code));
    }
  };
  return (
    <div className="printbook" role="dialog" aria-modal="true" aria-label={BOOK.title} ref={root} onKeyDown={onKey}>
      <div className="pb-spine" aria-hidden="true" />
      <section className="pb-left">
        <h3>{BOOK.title}</h3>
        <div className="pb-grid" role="group" aria-label={BOOK.title} style={{ gridTemplateColumns: `repeat(${BOOK.columns}, 1fr)` }}>
          {entries.map((e, i) => (
            <button key={e.id} ref={(el) => { cells.current[i] = el; }} className={`pb-cell${i === at ? " on" : ""}${i === current ? " cur" : ""}`} aria-pressed={i === current} tabIndex={i === at ? 0 : -1}
              onMouseEnter={() => setAt(i)} onFocus={() => setAt(i)} onClick={() => { onChoose(i); onClose(); }}
              aria-label={`${e.species}, ${e.stage}, feeling ${e.face}${e.worn ? `, wearing ${e.worn}` : ""}${i === current ? `. ${BOOK.pickedLabel}` : ""}`}>
              <Portrait hue={e.hue} />
              <span className="pb-name">{e.species}</span>
              <span className="pb-sub">{e.stage}</span>
            </button>
          ))}
        </div>
        {!entries.length && <p className="note">{BOOK.empty}</p>}
      </section>
      <section className="pb-right" aria-live="polite">
        {shown && (
          <>
            <div className="pb-top"><Portrait hue={shown.hue} /><div><strong className="pb-big">{shown.species}</strong><span className="pb-sub">{shown.stage}</span></div><MoodFace face={shown.face} /></div>
            <span className="growth-bar" role="progressbar" aria-label="Growth" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown.progress * 100)}><span style={{ width: `${shown.progress * 100}%` }} /></span>
            <p className="card-note">{shown.caption}</p>
            {shown.worn && <p className="card-note">Wearing: {shown.worn}</p>}
            <p className="pb-pick">{at === current ? BOOK.pickedLabel : BOOK.pickLabel}</p>
          </>
        )}
        <button className="btn quiet" onClick={onClose}>Close <KeyCap>{keyLabel(BOOK.key)}</KeyCap></button>
      </section>
    </div>
  );
}
