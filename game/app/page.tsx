"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FOODS, secondsUntilHatch } from "@/lib/rules";
import type { Place } from "@/lib/world";
import { screenFor } from "@/lib/gate";
import { progressToNext, stageById, stageChanged } from "@/lib/growth";
import { FED_MESSAGE, feedPrompt, friendlyAuthError, friendlyFeedError, moodFace, promptFor } from "@/lib/ui";
import { Blot, EggIcon, EnvelopeIcon, EyeIcon, GlyphIcon, InkDrop, KeyCap, MenuIcon, MoodFace } from "@/components/ui";
import type { Genes } from "@/lib/creature";

const World = dynamic(() => import("@/components/World"), { ssr: false });

type Egg = { id: string; hatch_at: string; hatched_at: string | null };
type Creature = { id: string; genes: Genes; fullness: number; mood: number; stage?: string; care?: number; age_seconds?: number };

export default function Page() {
  const [egg, setEgg] = useState<Egg | null>(null);
  const [creature, setCreature] = useState<Creature | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [msg, setMsg] = useState("");

  const [session, setSession] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [confirmSent, setConfirmSent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedError, setFeedError] = useState("");
  const [feeding, setFeeding] = useState(false);

  const [nearby, setNearby] = useState<Place | null>(null);
  const [printNear, setPrintNear] = useState(false);
  const [menu, setMenu] = useState<null | "feed" | "board">(null);

  // Every creature update goes through here so a stage change is announced once.
  const lastStage = useRef<string | null>(null);
  const applyCreature = (c: Creature) => {
    const st = c.stage ?? "blot";
    if (stageChanged(lastStage.current, st)) setMsg(`Your Print grew into a ${stageById(st).name}!`);
    lastStage.current = st;
    setCreature(c);
  };

  // Load whatever the player already owns. Claiming the egg is a world action.
  const load = useCallback(async () => {
    const sb = supabase();
    const { data: e, error } = await sb.from("eggs").select("*").eq("kind", "starter").maybeSingle();
    if (error) return setMsg(error.message);
    if (!e) return setMsg("");
    setEgg(e as Egg);
    const { data: c } = await sb.from("creatures").select("*").eq("egg_id", (e as Egg).id).maybeSingle();
    if (c) applyCreature(c as Creature);
    setMsg("");
  }, []);

  // Growth is decided by the server. Ask it to check when the player returns and now and then
  // while they play. If the server has no growth yet, this is ignored.
  const creatureId = creature?.id;
  useEffect(() => {
    if (!session || !creatureId) return;
    let live = true;
    const grow = async () => {
      const { data, error } = await supabase().rpc("grow_creature", { p_creature_id: creatureId });
      if (live && !error && data) applyCreature(data as Creature);
    };
    grow();
    const t = setInterval(grow, 120000);
    return () => { live = false; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, creatureId]);

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
    else { setEgg(null); setCreature(null); lastStage.current = null; setMsg(""); }
  }, [session, load]);

  const auth = async () => {
    const sb = supabase();
    const creds = { email, password };
    setBusy(true); setAuthError("");
    const { data, error } = mode === "in" ? await sb.auth.signInWithPassword(creds) : await sb.auth.signUp(creds);
    setBusy(false);
    setPassword("");
    if (error) return setAuthError(friendlyAuthError(error.message));
    if (mode === "up" && !data.session) setConfirmSent(true);
  };
  const signOut = () => supabase().auth.signOut();

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);

  const hatch = async () => {
    const { data, error } = await supabase().rpc("hatch_egg", { p_egg_id: egg!.id });
    if (error) return setMsg(error.message);
    applyCreature(data as Creature);
    setMsg("");
  };
  // On success the tray closes and a short confirmation shows; on error the tray stays open.
  const feed = async (foodId: string) => {
    if (feeding) return;
    setFeeding(true); setFeedError("");
    const { data, error } = await supabase().rpc("feed_creature", { p_creature_id: creature!.id, p_food_id: foodId });
    setFeeding(false);
    if (error) return setFeedError(friendlyFeedError(error.message));
    const grew = stageChanged(lastStage.current, (data as Creature).stage ?? "blot");
    applyCreature(data as Creature);
    setMenu(null);
    if (!grew) setMsg(FED_MESSAGE);
  };
  // The confirmation fades after a moment.
  useEffect(() => {
    if (msg !== FED_MESSAGE) return;
    const t = setTimeout(() => setMsg((m) => (m === FED_MESSAGE ? "" : m)), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === "Escape") { setMenu(null); setMenuOpen(false); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const claim = async () => {
    const { data, error } = await supabase().rpc("claim_starter_egg");
    if (error) return setMsg(error.message);
    setEgg(data as Egg);
    setMsg("Your egg is in the nest.");
  };

  // Feeding: walk up to your hatched Print and press E. The server still decides the outcome.
  const feedAtPrint = () => { if (session && creature) { setMsg(""); setFeedError(""); setMenu("feed"); } };

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
    }
    else if (p.kind === "notice") setMenu("board");
    else setMsg(p.label);
  };

  const hud: React.CSSProperties = { position: "absolute", left: 12, right: 12, padding: 8, background: "rgba(251,248,239,0.9)", borderRadius: 8 };
  const screen = screenFor(session);
  if (screen === "loading") {
    return (
      <main className="stage">
        <div className="card loading" role="status">
          <svg width="48" height="56" viewBox="0 0 40 48" aria-hidden="true"><path d="M20 3c8 10 15 17 15 27a15 15 0 0 1-30 0C5 20 12 13 20 3z" fill="#f1e8d2" stroke="#2b2a33" strokeWidth="2" /><rect className="fill" x="5" y="30" width="30" height="18" fill="#3b4a8c" clipPath="inset(0 0 0 0)" opacity="0.85" /></svg>
          <h2>Opening the garden…</h2>
        </div>
      </main>
    );
  }
  if (screen === "sign-in") {
    return (
      <main className="stage">
        {confirmSent ? (
          <div className="card signin" role="status">
            <EnvelopeIcon />
            <h2>Check your email to finish</h2>
            <p className="note">We sent a link. Open it, then come back and sign in.</p>
            <button className="btn quiet" onClick={() => { setConfirmSent(false); setMode("in"); }}>Back to sign in</button>
          </div>
        ) : (
          <form className="card signin" onSubmit={(e) => { e.preventDefault(); auth(); }} noValidate={false}>
            <div className="brand"><Blot /><h1>Blotty</h1></div>
            <p className="tagline">Raise little creatures made of ink.</p>
            <div className="tabs" data-mode={mode} role="tablist">
              <button type="button" role="tab" aria-selected={mode === "in"} className="tab" onClick={() => { setMode("in"); setAuthError(""); }}>Sign in</button>
              <button type="button" role="tab" aria-selected={mode === "up"} className="tab" onClick={() => { setMode("up"); setAuthError(""); }}>Create account</button>
            </div>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="input-wrap">
                <input id="password" className="input" type={showPw ? "text" : "password"} required minLength={8} autoComplete={mode === "in" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={authError ? true : undefined} aria-describedby={authError ? "auth-error" : undefined} />
                <button type="button" className="eye" aria-label={showPw ? "Hide password" : "Show password"} onClick={() => setShowPw((v) => !v)}><EyeIcon off={showPw} /></button>
              </div>
              {authError && <p id="auth-error" className="error" role="alert">{authError}</p>}
            </div>
            <button type="submit" className="btn primary" disabled={busy}>{busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}</button>
          </form>
        )}
      </main>
    );
  }

  const state = { hasEgg: !!egg, hasCreature: !!creature, hatchWait: wait };
  const feedTag = feedPrompt(!!creature, printNear);
  const tag = feedTag ?? (nearby ? promptFor(nearby, state) : null);
  const bad = msg !== FED_MESSAGE && /too soon|enough for today|not ready|sign in|went wrong/i.test(msg);
  return (
    <main className="hud-root">
      <World genes={creature?.genes ?? null} stage={creature?.stage ?? "blot"} eggPhase={egg ? "in-nest" : "unclaimed"} onNearby={setNearby} onInteract={interact} onPrintNear={setPrintNear} onFeedPrint={feedAtPrint} />

      <button className="iconbtn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><MenuIcon /></button>
      {menuOpen && (
        <div className="card menu" role="dialog" aria-label="Menu">
          <h3>Menu</h3>
          <dl className="keys">
            <dt><KeyCap>W</KeyCap> <KeyCap>A</KeyCap> <KeyCap>S</KeyCap> <KeyCap>D</KeyCap></dt><dd style={{ margin: 0 }}>Walk</dd>
            <dt><KeyCap>Shift</KeyCap></dt><dd style={{ margin: 0 }}>Jog</dd>
            <dt>Drag</dt><dd style={{ margin: 0 }}>Look around</dd>
            <dt><KeyCap>E</KeyCap></dt><dd style={{ margin: 0 }}>Do the thing nearby</dd>
            <dt><KeyCap>Esc</KeyCap></dt><dd style={{ margin: 0 }}>Close panels</dd>
          </dl>
          <button className="btn quiet" onClick={signOut}>Sign out</button>
        </div>
      )}

      {tag && !menu && (
        <div className="card tag" role="status">
          {!feedTag && nearby?.kind === "egg" && <EggIcon />}
          <strong>{tag}</strong>
          {(feedTag || nearby?.kind !== "nest" || wait === 0) && <KeyCap>E</KeyCap>}
        </div>
      )}
      {msg && <div className={`card toast${bad ? " bad" : ""}`} role="status">{msg}</div>}

      {creature && (
        <div className="card mood" aria-label="Your Print">
          <div className="mood-head"><h3>Your Print</h3><MoodFace face={moodFace(creature.mood)} /></div>
          <div className="stage" aria-label={`Stage: ${stageById(creature.stage ?? "blot").name}`}>
            <span className="stage-name">{stageById(creature.stage ?? "blot").name}</span>
            <span className="stage-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressToNext(creature.stage ?? "blot", creature.care ?? 0, creature.age_seconds ?? 0) * 100)}>
              <span style={{ width: `${progressToNext(creature.stage ?? "blot", creature.care ?? 0, creature.age_seconds ?? 0) * 100}%` }} />
            </span>
          </div>
          <div className="drops">
            <InkDrop value={creature.fullness} label="Fed" />
            <InkDrop value={creature.mood} label="Happy" />
          </div>
        </div>
      )}

      {menu === "feed" && creature && (
        <div className="card tray" role="dialog" aria-label="Feed your Print">
          <h3>What shall we feed?</h3>
          <div className="foods">
            {FOODS.map((f) => (
              <button key={f.id} className="food" disabled={feeding} onClick={() => feed(f.id)}>
                {f.id === "glyph" ? <GlyphIcon /> : <Blot size={32} />}
                {f.name}
              </button>
            ))}
          </div>
          {feedError && <p className="error" role="alert">{feedError}</p>}
          <button className="btn quiet" onClick={() => { setMenu(null); setFeedError(""); }}>Close</button>
        </div>
      )}
      {menu === "board" && (
        <div className="card tray" role="dialog" aria-label="Notice board">
          <h3>Notice board</h3>
          {creature ? (
            <div className="drops" style={{ justifyContent: "center" }}>
              <InkDrop value={creature.fullness} label="Fed" />
              <InkDrop value={creature.mood} label="Happy" />
            </div>
          ) : <p className="note">Nothing here yet. Take your egg and hatch it.</p>}
          <button className="btn quiet" onClick={() => setMenu(null)}>Close</button>
        </div>
      )}
    </main>
  );
}
