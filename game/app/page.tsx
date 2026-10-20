"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FOODS, secondsUntilHatch } from "@/lib/rules";
import type { Genes } from "@/lib/creature";

const Garden = dynamic(() => import("@/components/Garden"), { ssr: false });

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

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: e, error } = await sb.rpc("claim_starter_egg");
    if (error) return setMsg(error.message);
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

  const wait = egg ? secondsUntilHatch(new Date(egg.hatch_at), now) : 0;
  return (
    <main>
      <h1>Blotty</h1>
      {session === false && (
        <form onSubmit={(e) => { e.preventDefault(); auth("in"); }} style={{ marginBottom: 16 }}>
          <input type="email" required autoComplete="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />{" "}
          <input type="password" required minLength={8} autoComplete="current-password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />{" "}
          <button type="submit">Sign in</button>{" "}
          <button type="button" onClick={() => auth("up")}>Sign up</button>
        </form>
      )}
      {session && <p><button onClick={signOut}>Sign out</button></p>}
      <Garden genes={creature?.genes ?? null} />
      {msg && <p>{msg}</p>}
      {egg && !creature && (
        <p>
          {wait > 0 ? `Your egg hatches in ${wait}s.` : "Your egg is ready."}{" "}
          <button disabled={wait > 0} onClick={hatch}>Hatch</button>
        </p>
      )}
      {creature && (
        <div>
          <p>Fullness {creature.fullness}/100 · Mood {creature.mood}/100</p>
          {FOODS.map((f) => (
            <button key={f.id} onClick={() => feed(f.id)} style={{ marginRight: 8 }}>{f.name}</button>
          ))}
        </div>
      )}
    </main>
  );
}
