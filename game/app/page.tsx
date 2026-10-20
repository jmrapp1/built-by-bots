"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FOODS, secondsUntilHatch } from "@/lib/rules";
import type { Place } from "@/lib/world";
import { screenFor } from "@/lib/gate";
import type { Genes } from "@/lib/creature";

const World = dynamic(() => import("@/components/World"), { ssr: false });

type Egg = { id: string; hatch_at: string; hatched_at: string | null };
type Creature = { id: string; genes: Genes; fullness: number; mood: number };

export default function Page() {
  const [egg, setEgg] = useState<Egg | null>(null);
  const [creature, setCreature] = useState<Creature | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [msg, setMsg] = useState("");

  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [nearby, setNearby] = useState<Place | null>(null);
  const [menu, setMenu] = useState<null | "feed" | "board">(null);

  // Load whatever the player already owns. Claiming the egg is a world action.
  const load = useCallback(async () => {
    const sb = supabase();
    const { data: e, error } = await sb.from("eggs").select("*").eq("kind", "starter").maybeSingle();
    if (error) return setMsg(error.message);
    if (!e) return setMsg("");
    setEgg(e as Egg);
    const { data: c } = await sb.from("creatures").select("*").eq("egg_id", (e as Egg).id).maybeSingle();
    if (c) setCreature(c as Creature);
    setMsg("");
  }, []);

  // Auth state comes from Supabase Auth only. The password is handed straight to
  // Supabase and is never stored or logged here.
  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(!!data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (session) load().catch((x) => setMsg(String(x.message ?? x)));
    else { setEgg(null); setCreature(null); setMsg(""); }
  }, [session, load]);

  const auth = async (mode: "in" | "up") => {
    const sb = supabase();
    const creds = { email, password };
    const { data, error } = mode === "in" ? await sb.auth.signInWithPassword(creds) : await sb.auth.signUp(creds);
    setPassword("");
    if (error) return setMsg(error.message);
    if (mode === "up" && !data.session) setMsg("Check your email to confirm your account, then sign in.");
  };
  const signOut = () => supabase().auth.signOut();

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const hatch = async () => {
    const { data, error } = await supabase().rpc("hatch_egg", { p_egg_id: egg!.id });
    if (error) return setMsg(error.message);
    setCreature(data as Creature);
    setMsg("");
  };
  const feed = async (foodId: string) => {
    const { data, error } = await supabase().rpc("feed_creature", { p_creature_id: creature!.id, p_food_id: foodId });
    if (error) return setMsg(error.message);
    setCreature(data as Creature);
    setMsg("");
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === "Escape") setMenu(null); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const claim = async () => {
    const { data, error } = await supabase().rpc("claim_starter_egg");
    if (error) return setMsg(error.message);
    setEgg(data as Egg);
    setMsg("Your egg is in the nest.");
  };

  const wait = egg ? secondsUntilHatch(new Date(egg.hatch_at), now) : 0;

  // The server decides every outcome; these only ask and show the answer.
  const interact = (p: Place) => {
    if (!session) return;
    setMsg("");
    if (p.kind === "egg") { if (!egg) claim(); else setMsg(creature ? "You already have your Print." : "Your egg is in the nest."); }
    else if (p.kind === "nest") {
      if (!egg) setMsg("Collect your egg at the egg spot first.");
      else if (creature) setMsg("Your Print has hatched.");
      else if (wait > 0) setMsg(`Your egg hatches in ${wait}s.`);
      else hatch();
    } else if (p.kind === "feeding") { if (creature) setMenu("feed"); else setMsg("Hatch an egg first."); }
    else if (p.kind === "notice") setMenu("board");
    else setMsg(p.label);
  };

  const hud: React.CSSProperties = { position: "absolute", left: 12, right: 12, padding: 8, background: "rgba(251,248,239,0.9)", borderRadius: 8 };
  const screen = screenFor(session);
  if (screen !== "world") {
    return (
      <main style={{ display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div>
          <h1>Blotty</h1>
          {screen === "loading" && <p>Loading…</p>}
          {screen === "sign-in" && (
            <form onSubmit={(e) => { e.preventDefault(); auth("in"); }}>
              <p>Sign in to enter the garden.</p>
              <input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />{" "}
              <input type="password" required minLength={8} autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />{" "}
              <button type="submit">Sign in</button>{" "}
              <button type="button" onClick={() => auth("up")}>Sign up</button>
              {msg && <p>{msg}</p>}
            </form>
          )}
        </div>
      </main>
    );
  }

  return (
    <main style={{ position: "fixed", inset: 0, margin: 0 }}>
      <World genes={creature?.genes ?? null} eggPhase={egg ? "in-nest" : "unclaimed"} onNearby={setNearby} onInteract={interact} />
      <div style={{ ...hud, top: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <strong>Blotty</strong>
        <button onClick={signOut}>Sign out</button>
        <span style={{ opacity: 0.7 }}>WASD move · Shift jog · drag to look · E interact</span>
      </div>
      {(msg || nearby) && (
        <div style={{ ...hud, bottom: 12, textAlign: "center" }}>
          {msg && <div>{msg}</div>}
          {nearby && <div>{nearby.label}: press E to {nearby.prompt.toLowerCase()}</div>}
        </div>
      )}
      {menu === "feed" && creature && (
        <div style={{ ...hud, top: "40%", left: "35%", right: "35%", textAlign: "center" }}>
          <p>Fullness {creature.fullness}/100 · Mood {creature.mood}/100</p>
          {FOODS.map((f) => (
            <button key={f.id} onClick={() => feed(f.id)} style={{ marginRight: 8 }}>{f.name}</button>
          ))}
          <button onClick={() => setMenu(null)}>Close</button>
        </div>
      )}
      {menu === "board" && (
        <div style={{ ...hud, top: "40%", left: "35%", right: "35%", textAlign: "center" }}>
          {creature ? <p>Fullness {creature.fullness}/100 · Mood {creature.mood}/100</p> : <p>No Print yet.</p>}
          <button onClick={() => setMenu(null)}>Close</button>
        </div>
      )}
    </main>
  );
}
