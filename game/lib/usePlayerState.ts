"use client";
// S36: the React side of saving where the player stands: reads the starting record, runs the saver, and listens for the page closing.
// All the logic is in lib/playerState.ts and lib/playerStateClient.ts (tested without a browser); this only joins them to Supabase, storage and the window.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PS, PS_ENABLED, nosaveOverride, type Snap } from "@/lib/playerState";
import { createSaver, keepaliveRequest, loadStart, type Saver, type Start } from "@/lib/playerStateClient";

const store = { get: (k: string) => window.localStorage.getItem(k), set: (k: string, v: string) => window.localStorage.setItem(k, v) };

export function usePlayerState(session: boolean | null, userId: string | null, ownIds: string[]) {
  const saveOn = PS_ENABLED && !(typeof window !== "undefined" && nosaveOverride(window.location.search, process.env.NODE_ENV === "production"));
  const [start, setStart] = useState<{ who: string; s: Start } | null>(null); // the record the world starts from, for this account
  const saver = useRef<Saver | null>(null);
  const token = useRef<string | null>(null); // the signed-in user's own access token, kept for the closing-page request
  const ids = useRef<string[]>([]);
  ids.current = ownIds;
  useEffect(() => {
    if (!session || !userId) { setStart(null); return; }
    if (!saveOn) { setStart({ who: userId, s: null }); return; }
    let live = true;
    const sb = supabase(), me = userId;
    loadStart({
      enabled: true, userId: me, now: Date.now(), store,
      fetchServer: async () => { // two plain selects of the player's own rows (RLS gives nobody else's), side by side
        const [p, r] = await Promise.all([sb.from("player_state").select("zone,x,z,heading,yaw,updated_at").maybeSingle(), sb.from("print_state").select("creature_id,x,z,heading,mode")]);
        return p.error || r.error ? null : { player: p.data, prints: r.data };
      },
    }).then((s) => { if (live) setStart({ who: me, s }); });
    return () => { live = false; };
  }, [session, userId, saveOn]);
  useEffect(() => {
    if (!session || !userId || !saveOn) return;
    const me = userId, sb = supabase();
    sb.auth.getSession().then(({ data }) => { token.current = data.session?.access_token ?? null; });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => { token.current = s?.access_token ?? null; });
    const sv = createSaver({
      enabled: true, userId: me, now: () => Date.now(), store,
      ownIds: () => ids.current,
      send: async (a) => { const { data, error } = await sb.rpc("save_state", a); return error ? "failed" : data === "skipped" ? "skipped" : "saved"; },
      sendKeepalive: (a) => { // the same function on the same host, with the user's own token; skipped if there is none
        const r = keepaliveRequest(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, token.current, a);
        if (!r) return false;
        try { void fetch(r.url, r.init).catch(() => undefined); return true; } catch { return false; }
      },
    });
    saver.current = sv;
    const timer = setInterval(() => sv.tick(document.visibilityState === "hidden"), 3000);
    const hide = () => sv.leave();
    const vis = () => { if (document.visibilityState === "hidden") sv.leave(); };
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(timer); window.removeEventListener("pagehide", hide); document.removeEventListener("visibilitychange", vis); sub.subscription.unsubscribe(); sv.dispose(); if (saver.current === sv) saver.current = null; };
  }, [session, userId, saveOn]);
  const reportState = useCallback((s: Snap, travelling: boolean) => saver.current?.report(s, travelling), []);
  const flush = useCallback(async () => { try { await saver.current?.flush(PS.signOutCapMs); } catch { /* quiet */ } }, []);
  return { saveOn, start, reportState, flush };
}
