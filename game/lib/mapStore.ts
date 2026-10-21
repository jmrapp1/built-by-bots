// W4: the only place the walked cells touch browser storage. Local to this browser; nothing is sent anywhere.
import { parseWalked, serialize, type Walked } from "./map";

export function loadWalked(key: string): Walked {
  try { return parseWalked(window.localStorage.getItem(key)); } catch { return parseWalked(null); }
}
export function saveWalkedCells(key: string, w: Walked): void {
  try { window.localStorage.setItem(key, serialize(w)); } catch { /* storage full or blocked: the map just isn't kept */ }
}
