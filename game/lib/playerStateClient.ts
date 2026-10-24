// S36: the moving parts around lib/playerState.ts: read the starting record, and a saver that decides when to call save_state.
// Everything outside (storage, clock, the server call, the timer) is passed in, so it is tested without a browser. No randomness here.
import { PS, PS_ENABLED, fromRows, mirrorKey, parseMirror, pickSource, savePayload, serializeMirror, shouldSave, type Saved, type Snap, type Trigger } from "@/lib/playerState";

export type Store = { get(key: string): string | null; set(key: string, value: string): void };
export type Start = { from: "mirror" | "server"; state: Saved } | null;

/** The record to start from. The browser copy is read at once (no network). With no usable copy, the server rows are asked for, and
 *  after `giveUpMs` the answer is "start as today"; a server answer that arrives after that changes nothing. Never throws. */
export async function loadStart(d: { enabled: boolean; userId: string | null; store: Store; now: number; fetchServer: () => Promise<{ player: unknown; prints: unknown } | null>; giveUpMs?: number }): Promise<Start> {
  if (!d.enabled || !d.userId) return null;
  let mirror: Saved | null = null;
  try { mirror = parseMirror(d.store.get(mirrorKey(d.userId))); } catch { mirror = null; }
  const m = pickSource(mirror, null, d.now);
  if (m) return m;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const giveUp = new Promise<null>((res) => { timer = setTimeout(() => res(null), d.giveUpMs ?? PS.fetchGiveUpMs); });
  const ask = (async () => { try { const r = await d.fetchServer(); return r ? fromRows(r.player, r.prints) : null; } catch { return null; } })();
  const server = await Promise.race([ask, giveUp]);
  clearTimeout(timer);
  return pickSource(null, server, d.now);
}

/** The closing-page request: the same save_state function on the same host. `apikey` is the public anon key; `authorization` is Bearer plus the user's own access token
 *  (never an admin key). Null when the URL, the key or the token is missing (then only the browser copy is written). */
export function keepaliveRequest(url: string | undefined, anonKey: string | undefined, token: string | null | undefined, args: unknown): { url: string; init: { method: "POST"; keepalive: true; headers: Record<string, string>; body: string } } | null {
  if (!url || !anonKey || !token) return null;
  return { url: `${url}/rest/v1/rpc/save_state`, init: { method: "POST", keepalive: true, headers: { "content-type": "application/json", apikey: anonKey, authorization: `Bearer ${token}` }, body: JSON.stringify(args) } };
}

export type SaveResult = "saved" | "skipped" | "failed";
export type SaverDeps = {
  enabled: boolean;
  userId: string;
  store: Store;
  now: () => number;
  ownIds: () => string[];
  /** The normal call: the supabase rpc save_state. */
  send: (args: ReturnType<typeof savePayload>) => Promise<SaveResult>;
  /** The page is closing or hidden: a keepalive request with the user's own session token. Return false if it cannot be made (the timer save is at most one interval old). */
  sendKeepalive: (args: ReturnType<typeof savePayload>) => boolean;
};
export type Saver = {
  /** The world reports where things are, a few times a second. Cheap: stores the latest, and notices a zone change. Reports made while travelling are ignored. */
  report(cur: Snap, travelling: boolean): void;
  /** Called on a timer. Makes a call only if something moved. */
  tick(hidden: boolean): void;
  /** Leaving (tab hidden or closing): write the browser copy and make a keepalive call. */
  leave(): void;
  /** Sign-out: one save, then done (or `capMs`, whichever first). */
  flush(capMs: number): Promise<void>;
  dispose(): void;
};

export function createSaver(d: SaverDeps): Saver {
  let last: Snap | null = null, lastAt = d.now(), cur: Snap | null = null, busy = false, dead = false, travelling = false;
  const writeMirror = (s: Snap, at: number) => { try { d.store.set(mirrorKey(d.userId), serializeMirror({ ...s, at })); } catch { /* storage full or blocked: quiet */ } };
  const save = async (trigger: Trigger, hidden = false): Promise<void> => {
    if (dead || busy || !cur) return;
    if (!shouldSave({ enabled: d.enabled, travelling, hidden, trigger, now: d.now(), lastAt, last, cur })) return;
    const sent = cur, now = d.now();
    busy = true; lastAt = now; // a failure waits a full interval: at most one try per tick, no pile-up
    writeMirror(sent, now);
    let out: SaveResult = "failed";
    try { out = await d.send(savePayload(sent, d.ownIds())); } catch { out = "failed"; }
    busy = false;
    if (out === "saved" && !dead) last = sent; // otherwise it stays dirty and the next tick tries again
  };
  return {
    report(c, t) {
      if (dead || !d.enabled) return;
      travelling = t;
      if (t) return; // a gate or door walk is ignored: the last good spot from before it is what exists
      cur = c;
      if (!last) { last = c; lastAt = d.now(); return; } // the first report is the baseline: standing still costs no call
      if (c.zone !== last.zone) void save("zone");
    },
    tick(hidden) { void save("timer", hidden); },
    leave() {
      if (dead || !d.enabled || !cur || travelling) return;
      const now = d.now();
      writeMirror(cur, now); // no network needed
      if (!shouldSave({ enabled: d.enabled, travelling, hidden: true, trigger: "hide", now, lastAt, last, cur })) return;
      const sent = cur;
      if (d.sendKeepalive(savePayload(sent, d.ownIds()))) { last = sent; lastAt = now; }
    },
    async flush(capMs) {
      if (dead || !d.enabled) return;
      const done = save("signout");
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([done, new Promise<void>((r) => { timer = setTimeout(r, capMs); })]);
      clearTimeout(timer);
    },
    dispose() { dead = true; },
  };
}

export const ENABLED = PS_ENABLED;
