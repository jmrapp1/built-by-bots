"use client";
// The keepsake picker card: the shared strip with the keepsake choices. It only reports a choice; the page does the write.
import PickerStrip from "@/components/PickerStrip";
import { keepsakeStrip } from "@/lib/picker";

export default function KeepsakePicker({ owned, worn, busy, note, onPick, onClose }: {
  owned: string[]; worn: string | null | undefined; busy: boolean; note: string | null;
  onPick: (id: string | null) => void; onClose: () => void;
}) {
  return <PickerStrip {...keepsakeStrip(owned, worn)} busy={busy} note={note} onPick={onPick} onClose={onClose} />;
}
