"use client";
// S37 step 3: the picture legend of the touch buttons, opened from the Menu. Renders nothing unless the page is in touch mode (body.touch), so a desktop Menu is unchanged.
import { useEffect, useState } from "react";
import { GLYPH, LABEL } from "@/components/TouchControls";

const ORDER = ["do", "stroke", "snack", "follow", "skip", "map", "book"] as const;

// S38a: with the wording switch on, the first Menu opening of a visit shows the legend already open. (Not stored; a reload counts as a new visit.)
let shownOpen = false;

export default function TouchLegend({ openFirst = false }: { openFirst?: boolean }) {
  const [touch, setTouch] = useState(false);
  const [open, setOpen] = useState(() => { if (!openFirst || shownOpen) return false; shownOpen = true; return true; });
  useEffect(() => { setTouch(document.body.classList.contains("touch")); }, []);
  if (!touch) return null;
  return (
    <div className="legend">
      <button type="button" className="btn quiet" aria-expanded={open} onClick={() => setOpen((v) => !v)}>What the buttons do</button>
      {open && (
        <ul className="legend-list">
          <li><span className="legend-ico legend-stick" aria-hidden="true" /><span>Move (push far to jog)</span></li>
          <li><span className="legend-ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v18M3 12h18" /></svg></span><span>Drag anywhere to look</span></li>
          {ORDER.map((id) => <li key={id}><span className="legend-ico" aria-hidden="true">{GLYPH[id]}</span><span>{LABEL[id]}</span></li>)}
        </ul>
      )}
    </div>
  );
}
