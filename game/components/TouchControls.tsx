"use client";
// S37 step 2: the thumb stick and the buttons. They send the same KeyboardEvents the keyboard does (code only, on window), so the game has one input path.
// Plain DOM; the stick writes to refs and sends key events only when the held set changes. Every cancel path releases every key.
import { useEffect, useRef, useState } from "react";
import { MOBILE } from "@/lib/touchInput";
import { BUTTON_KEY, keyDiff, knobOffset, stickKeys, touchButtons, type ButtonId, type Prompts } from "@/lib/touchControls";
import { Blot, PageIcon } from "@/components/ui";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const send = (type: "keydown" | "keyup", code: string) => { try { window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true })); } catch { /* never throw into the game */ } };

const GLYPH: Record<ButtonId | "map" | "book", React.ReactNode> = {
  do: <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M8 11V5a2 2 0 0 1 4 0v5M12 9a2 2 0 0 1 4 0v3M16 11a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-3-5a2 2 0 0 1 3-2l1 1" /></svg>,
  stroke: <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M3 15q4-8 9-3t9-5M3 20q4-6 9-2t9-4" /></svg>,
  snack: <Blot size={28} />,
  follow: <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" {...S}><circle cx="8" cy="6" r="2" /><circle cx="16" cy="9" r="2" /><path d="M8 9v4l-2 6M8 13l3 6M16 12v3l-2 5M16 15l3 5" /></svg>,
  skip: <PageIcon />,
  map: <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" /></svg>,
  book: <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M9 7h6" /></svg>,
};
const LABEL: Record<ButtonId | "map" | "book", string> = { do: "Do", stroke: "Stroke", snack: "Change snack", follow: "Come along", skip: "Skip a stone", map: "Map", book: "Prints book" };

export default function TouchControls({ prompts, hidden }: { prompts: Prompts; hidden: boolean }) {
  const held = useRef<Set<string>>(new Set());
  const set = (next: Set<string>) => { const d = keyDiff(held.current, next); for (const k of d.up) send("keyup", k); for (const k of d.down) send("keydown", k); held.current = new Set(next); };
  const releaseAll = () => { set(new Set()); };

  // Anything that takes the page away from the thumb lets go of every key.
  useEffect(() => {
    const vis = () => { if (document.hidden) { releaseAll(); setHeldBtn(null); setKnob({ x: 0, y: 0 }); } };
    window.addEventListener("blur", vis);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("pagehide", vis);
    return () => { window.removeEventListener("blur", vis); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", vis); releaseAll(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (hidden) { releaseAll(); setHeldBtn(null); setKnob({ x: 0, y: 0 }); } }, [hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- stick: one finger (its pointer id), the base is fixed ---
  const base = useRef<HTMLDivElement>(null);
  const stickId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = MOBILE.stickSize / 2;
  const stickAt = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    set(stickKeys(dx, dy, R));
    setKnob(knobOffset(dx, dy, R));
  };
  const stickEnd = (e: React.PointerEvent) => { if (stickId.current !== e.pointerId) return; stickId.current = null; releaseAll(); setKnob({ x: 0, y: 0 }); };

  // --- buttons: hold buttons press on down and release on up; tap buttons press and release at once ---
  const [heldBtn, setHeldBtn] = useState<string | null>(null);
  const btnId = useRef<Map<number, string>>(new Map());
  const press = (id: ButtonId | "map" | "book", e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* fine */ }
    const b = BUTTON_KEY[id];
    if (b.hold) { btnId.current.set(e.pointerId, id); setHeldBtn(id); send("keydown", b.key); }
    else { send("keydown", b.key); send("keyup", b.key); }
  };
  const lift = (e: React.PointerEvent) => {
    const id = btnId.current.get(e.pointerId) as ButtonId | undefined;
    if (!id) return;
    btnId.current.delete(e.pointerId); setHeldBtn(null); send("keyup", BUTTON_KEY[id].key);
  };
  const btn = (id: ButtonId | "map" | "book", cls: string) => (
    <button key={id} type="button" className={`tc-btn ${cls}${heldBtn === id ? " held" : ""}`} aria-label={LABEL[id]}
      onPointerDown={(e) => press(id, e)} onPointerUp={lift} onPointerCancel={lift} onLostPointerCapture={lift} onContextMenu={(e) => e.preventDefault()}>
      {GLYPH[id]}
    </button>
  );

  // While a panel is open the stick and action buttons go away; Map and Book stay, since they open and close those panels (Close buttons come in step 3).
  const ids = touchButtons(prompts);
  return (
    <div className="tc-root" style={{ ["--tc-min" as string]: `${MOBILE.minTarget}px`, ["--tc-do" as string]: `${MOBILE.doTarget}px`, ["--tc-stick" as string]: `${MOBILE.stickSize}px` }}>
      {!hidden && <div ref={base} className="tc-stick" aria-label="Move" role="group"
        onPointerDown={(e) => { if (stickId.current !== null) return; e.preventDefault(); e.stopPropagation(); stickId.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* fine */ } stickAt(e); }}
        onPointerMove={(e) => { if (stickId.current === e.pointerId) stickAt(e); }}
        onPointerUp={stickEnd} onPointerCancel={stickEnd} onLostPointerCapture={stickEnd} onContextMenu={(e) => e.preventDefault()}>
        <span className="tc-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>}
      {!hidden && <div className="tc-actions">
        {ids.filter((i) => i !== "do").map((i) => btn(i, "tc-small"))}
        {btn("do", "tc-do")}
      </div>}
      <div className="tc-top">{btn("map", "tc-top-btn")}{btn("book", "tc-top-btn")}</div>
    </div>
  );
}
