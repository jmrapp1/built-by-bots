"use client";
// S21: a small paper card that names the place you just entered. Shows ~2.5 s, then leaves by itself. Never takes focus or blocks input.
import { useEffect, useRef, useState } from "react";
import { CHAPTERS, CHAPTER_MS, canShow, type ChapterPlace } from "@/lib/chapters";
import { NpcIcon } from "@/components/ui";

export type ChapterProps = {
  entered: { place: ChapterPlace; n: number } | null; // n changes on every completed zone change
  busy: boolean; // Welcome back, Time is gentle, Things to try, a hint, the map or a menu is open
  preview?: ChapterPlace | null; // dev only
};

export default function ChapterCard(p: ChapterProps) {
  const shown = useRef(new Set<ChapterPlace>());
  const [card, setCard] = useState<ChapterPlace | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busy = useRef(p.busy);
  busy.current = p.busy;

  const show = (place: ChapterPlace, remember: boolean) => {
    if (remember) shown.current.add(place);
    if (timer.current) clearTimeout(timer.current);
    setCard(place);
    timer.current = setTimeout(() => setCard(null), CHAPTER_MS);
  };

  useEffect(() => { if (p.preview) show(p.preview, false); }, [p.preview]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!p.entered) return;
    if (canShow(shown.current, p.entered.place, busy.current)) show(p.entered.place, true);
  }, [p.entered?.n]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const c = card ? CHAPTERS[card] : null;
  return (
    <div className="chapter-live" aria-live="polite">
      {c && (
        <div className="card chapter" key={card}>
          <NpcIcon name={c.icon} size={26} />
          <h2>{c.name}</h2>
        </div>
      )}
    </div>
  );
}
