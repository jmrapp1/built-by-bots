"use client";
// The shared picker strip: a plain list in the style of the other prompts. It only reports a choice; the page does the rest.
// Keepsakes and decorations both use it.
import type { StripChoice } from "@/lib/picker";

export default function PickerStrip({ title, emptyText, choices, busy, note, onPick, onClose, currentSuffix }: {
  title: string; emptyText?: string | null; choices: StripChoice[]; busy: boolean; note: string | null;
  onPick: (id: string | null) => void; onClose: () => void; currentSuffix: string;
}) {
  return (
    <div className="card tray picker" role="dialog" aria-label={title}>
      <h3>{title}</h3>
      {emptyText && <p className="note">{emptyText}</p>}
      <div className="picker-list">
        {choices.map((c) => (
          <button key={c.id ?? "none"} className={`btn quiet${c.current ? " current" : ""}`} aria-pressed={c.current} disabled={busy || c.current || !!c.disabled} onClick={() => onPick(c.id)}>
            {c.label}{c.current ? ` (${currentSuffix})` : ""}
          </button>
        ))}
      </div>
      {note && <p className="note" role="status">{note}</p>}
      <button className="btn quiet" onClick={onClose}>Close</button>
    </div>
  );
}
