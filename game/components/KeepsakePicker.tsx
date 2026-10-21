"use client";
// The keepsake picker card: a plain list in the style of the other prompts. It only reports a choice; the page does the write.
import { PICKER_EMPTY, PICKER_TITLE, choicesFor } from "@/lib/picker";

export default function KeepsakePicker({ owned, worn, busy, note, onPick, onClose }: {
  owned: string[]; worn: string | null | undefined; busy: boolean; note: string | null;
  onPick: (id: string | null) => void; onClose: () => void;
}) {
  const choices = choicesFor(owned, worn);
  return (
    <div className="card tray picker" role="dialog" aria-label={PICKER_TITLE}>
      <h3>{PICKER_TITLE}</h3>
      {owned.length === 0 && <p className="note">{PICKER_EMPTY}</p>}
      <div className="picker-list">
        {choices.map((c) => (
          <button key={c.id ?? "none"} className={`btn quiet${c.current ? " current" : ""}`} aria-pressed={c.current} disabled={busy || c.current} onClick={() => onPick(c.id)}>
            {c.label}{c.current ? " (worn)" : ""}
          </button>
        ))}
      </div>
      {note && <p className="note" role="status">{note}</p>}
      <button className="btn quiet" onClick={onClose}>Close</button>
    </div>
  );
}
