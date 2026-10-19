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
  const [msg, setMsg] = useState("Signing in…");

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: s } = await sb.auth.getSession();
    if (!s.session) {
      const { error } = await sb.auth.signInAnonymously();
      if (error) return setMsg(`Sign-in failed: ${error.message}`);
    }
    const { data: e, error } = await sb.rpc("claim_starter_egg");
    if (error) return setMsg(error.message);
    setEgg(e as Egg);
    const { data: c } = await sb.from("creatures").select("*").eq("egg_id", (e as Egg).id).maybeSingle();
    if (c) setCreature(c as Creature);
    setMsg("");
  }, []);

  useEffect(() => { load().catch((x) => setMsg(String(x.message ?? x))); }, [load]);
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
