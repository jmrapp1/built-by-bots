"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FOODS, secondsUntilHatch } from "@/lib/rules";
import type { Place } from "@/lib/world";
import { screenFor } from "@/lib/gate";
import { BOARD_PAGES, BOARD_TITLE, nextPage, pageAt, pageLabel, prevPage } from "@/lib/board";
import { clampHue, isFavourite, speciesById, speciesOverride } from "@/lib/species";
import { DAILY, dailyAvailable, friendlyDailyError, utcDay, activeIndex } from "@/lib/daily";
import { progressToNext, stageById, stageChanged } from "@/lib/growth";
import { PLAY, nextFood } from "@/lib/play";
import { FORAGE, carried, inHand, pouchAdd, pouchSpend } from "@/lib/forage";
import { FED_MESSAGE, POUCH_FULL, feedPrompt, isFeedMessage, friendlyAuthError, friendlyFeedError, moodFace, promptFor, FOUND_PROMPT } from "@/lib/ui";
import { Blot, EggIcon, EnvelopeIcon, EyeIcon, GlyphIcon, InkDrop, KeyCap, MenuIcon, MoodFace } from "@/components/ui";
import type { Genes } from "@/lib/creature";

const World = dynamic(() => import("@/components/World"), { ssr: false });

type Egg = { id: string; kind?: string; hatch_at: string; hatched_at: string | null };
type Creature = { id: string; species?: string; genes: Genes; fullness: number; mood: number; stage?: string; care?: number; age_seconds?: number };

export default function Page() {
  const [eggs, setEggs] = useState<Egg[]>([]);
  const [creatures, setCreatures] = useState<Creature[]>([]);
  const [picked, setPicked] = useState<number | null>(null);
  const [claimedOn, setClaimedOn] = useState<string | null | undefined>(undefined); // undefined = not known yet
  const creature = creatures.length ? creatures[activeIndex(creatures.length, picked)] : null;
  // The starter egg, and the one egg (if any) still waiting to hatch.
  const starter = eggs.find((e) => e.kind === "starter") ?? null;
  const egg = eggs.find((e) => !e.hatched_at) ?? null;
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
  const [feeding, setFeeding] = useState(false);
  const [fedTick, setFedTick] = useState(0); // each success starts the Print's reaction
  const [reacting, setReacting] = useState(false);
  const [wantedFood, setFood] = useState(FOODS[0].id); // the food you last chose
  // The pouch lives in a ref as well as state so a walk-over and a feed never read a stale copy.
  const [pouch, setPouch] = useState<string[]>([]);
  const pouchRef = useRef<string[]>([]);
  const setPouchBoth = (p: string[]) => { pouchRef.current = p; setPouch(p); };
  const foodIds = FOODS.map((x) => x.id);
  const food = inHand(pouch, wantedFood, foodIds); // null while the pouch is empty
  const gather = (kind: string): "ok" | "full" => {
    const next = pouchAdd(pouchRef.current, kind);
    if (!next) { setMsg(POUCH_FULL); return "full"; }
    setPouchBoth(next);
    return "ok";
  };

  const [nearby, setNearby] = useState<Place | null>(null);
  const [printNear, setPrintNear] = useState(false);
  const [findable, setFindable] = useState(false);
  const [canSplash, setCanSplash] = useState(true);
  // Dev-only look at another species (?species=leaflet). Display only; ignored in production builds.
  const previewSpecies = typeof window === "undefined" ? null : speciesOverride(window.location.search, process.env.NODE_ENV === "production");
  const shownSpecies = previewSpecies ?? creature?.species ?? "blotling";
  const shownGenes = creature ? (previewSpecies ? { ...creature.genes, hue: clampHue(creature.genes.hue, speciesById(previewSpecies)) } : creature.genes) : null;
  const [boardPage, setBoardPage] = useState(0);
  const [menu, setMenu] = useState<null | "board">(null);

  // Every creature update goes through here so a stage change is announced once.
  const lastStage = useRef<Record<string, string>>({}); // last stage seen per Print
  const applyCreature = (c: Creature) => {
    const st = c.stage ?? "blot";
    if (stageChanged(lastStage.current[c.id] ?? null, st)) setMsg(`Your Print grew into a ${stageById(st).name}!`);
    lastStage.current[c.id] = st;
    setCreatures((all) => (all.some((x) => x.id === c.id) ? all.map((x) => (x.id === c.id ? c : x)) : [...all, c]));
  };

  // Load whatever the player already owns. Claiming the egg is a world action.
  const load = useCallback(async () => {
    const sb = supabase();
    const { data: es, error } = await sb.from("eggs").select("*").order("awarded_at", { ascending: true });
    if (error) return setMsg(error.message);
    setEggs((es ?? []) as Egg[]);
    const { data: cs } = await sb.from("creatures").select("*").order("created_at", { ascending: true });
    const list = (cs ?? []) as Creature[];
    setCreatures(list);
    for (const c of list) lastStage.current[c.id] = c.stage ?? "blot";
    // When did this player last collect a daily egg? If the server can't say, we just don't offer one.
    const { data: dc, error: dErr } = await sb.from("daily_egg_claims").select("claimed_on").maybeSingle();
    setClaimedOn(dErr ? undefined : ((dc as { claimed_on: string } | null)?.claimed_on ?? null));
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
    else { setEggs([]); setCreatures([]); setPicked(null); setClaimedOn(undefined); lastStage.current = {}; setMsg(""); }
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
    setPicked(null); // show the new Print
    setEggs((all) => all.map((e) => (e.id === egg!.id ? { ...e, hatched_at: new Date().toISOString() } : e)));
    applyCreature(data as Creature);
    setMsg("");
  };
  // Hold E near your Print: the world calls this when the ring is full. The server still decides the outcome.
  const feed = async () => {
    const offered = inHand(pouchRef.current, wantedFood, foodIds);
    if (feeding || reacting || !creature || !offered) return; // nothing in the pouch: nothing is sent
    setFeeding(true);
    const { data, error } = await supabase().rpc("feed_creature", { p_creature_id: creature.id, p_food_id: offered });
    setFeeding(false);
    if (error) return setMsg(friendlyFeedError(error.message)); // the server said no: no reaction, and the snack stays in the pouch
    setPouchBoth(pouchSpend(pouchRef.current, offered));
    const grew = stageChanged(lastStage.current[(data as Creature).id] ?? null, (data as Creature).stage ?? "blot");
    applyCreature(data as Creature);
    setFedTick((n) => n + 1);
    setReacting(true);
    if (!grew) setMsg(FED_MESSAGE);
  };
  // The reaction is locked in for as long as the server cooldown, so the next hold cannot hit it.
  useEffect(() => {
    if (!reacting) return;
    const tm = setTimeout(() => setReacting(false), PLAY.reactionSeconds * 1000);
    return () => clearTimeout(tm);
  }, [reacting, fedTick]);
  // The confirmation fades after a moment.
  useEffect(() => {
    if (!isFeedMessage(msg) && msg !== POUCH_FULL) return;
    const t = setTimeout(() => setMsg((m) => (m === msg ? "" : m)), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "Escape") { setMenu(null); setMenuOpen(false); }
      // Q swaps the food in hand.
      if (e.code === PLAY.keys.swap && !e.repeat && (e.target as HTMLElement)?.tagName !== "INPUT") setFood((f) => { const have = carried(pouchRef.current, foodIds); return have.length ? nextFood(inHand(pouchRef.current, f, foodIds)!, have) : f; });
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const claim = async () => {
    const { data, error } = await supabase().rpc("claim_starter_egg");
    if (error) return setMsg(error.message);
    setEggs((all) => (all.some((e) => e.id === (data as Egg).id) ? all : [...all, data as Egg]));
    setMsg("Your egg is in the nest.");
  };
  // Daily egg: only asks the server. It decides the day, the species and whether the nest is free.
  const claimDaily = async () => {
    const { data, error } = await supabase().rpc("claim_daily_egg");
    if (error) {
      if (/already claimed/i.test(error.message)) setClaimedOn(utcDay(new Date()));
      return setMsg(friendlyDailyError(error.message));
    }
    setEggs((all) => [...all, data as Egg]);
    setClaimedOn(utcDay(new Date()));
    setMsg(DAILY.messages.collected);
  };


  const wait = egg ? secondsUntilHatch(new Date(egg.hatch_at), now) : 0;
  const dailyReady = claimedOn !== undefined && !!starter && dailyAvailable(claimedOn, utcDay(now), !!egg);

  // The server decides every outcome; these only ask and show the answer.
  const interact = (p: Place) => {
    if (!session) return;
    setMsg("");
    if (p.kind === "egg") {
      if (!starter) claim();
      else if (egg) setMsg("Your egg is in the nest.");
      else if (dailyReady) claimDaily();
      else setMsg(DAILY.messages.already);
    }
    else if (p.kind === "nest") {
      if (egg) { if (wait > 0) setMsg(`Your egg hatches in ${wait}s.`); else hatch(); }
      else if (creature) setMsg("Your Print has hatched.");
      else setMsg("Collect your egg at the egg spot first.");
    }
    else if (p.kind === "notice") { setBoardPage(0); setMenu("board"); }
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

  const state = { hasEgg: !!starter, hasCreature: !!creature, hatchWait: wait, hasWaiting: !!egg, dailyReady, dailyKnown: claimedOn !== undefined, canSplash };
  const feedTag = feedPrompt(!!creature, printNear, !!food);
  const tag = findable ? FOUND_PROMPT : feedTag ?? (nearby ? promptFor(nearby, state) : null);
  const bad = (isFeedMessage(msg) && msg !== FED_MESSAGE) || /too soon|enough for today|not ready|sign in|went wrong/i.test(msg);
  return (
    <main className="hud-root">
      <World genes={shownGenes} species={shownSpecies} stage={creature?.stage ?? "blot"} eggPhase={egg ? "in-nest" : !starter ? "unclaimed" : dailyReady ? "daily" : "none"} onNearby={setNearby} onInteract={interact} onPrintNear={setPrintNear} onFindable={setFindable} onCanSplash={setCanSplash} onFeedPrint={feed} fedTick={fedTick} locked={feeding || reacting || !!menu || menuOpen} onGather={gather} canOffer={!!food} />

      <button className="iconbtn" aria-label="Menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><MenuIcon /></button>
      {menuOpen && (
        <div className="card menu" role="dialog" aria-label="Menu">
          <h3>Menu</h3>
          <dl className="keys">
            <dt><KeyCap>W</KeyCap> <KeyCap>A</KeyCap> <KeyCap>S</KeyCap> <KeyCap>D</KeyCap></dt><dd style={{ margin: 0 }}>Walk</dd>
            <dt><KeyCap>Shift</KeyCap></dt><dd style={{ margin: 0 }}>Jog</dd>
            <dt>Drag</dt><dd style={{ margin: 0 }}>Look around</dd>
            <dt><KeyCap>E</KeyCap></dt><dd style={{ margin: 0 }}>Do the thing nearby. Hold it near your Print to share a snack</dd>
            <dt><KeyCap>Q</KeyCap></dt><dd style={{ margin: 0 }}>Change the snack in hand</dd>
            <dt><KeyCap>R</KeyCap></dt><dd style={{ margin: 0 }}>Hold to stroke your Print</dd>
            <dt><KeyCap>Esc</KeyCap></dt><dd style={{ margin: 0 }}>Close panels</dd>
          </dl>
          <button className="btn quiet" onClick={signOut}>Sign out</button>
        </div>
      )}

      {tag && !menu && (
        <div className="card tag" role="status">
          {!feedTag && nearby?.kind === "egg" && <EggIcon />}
          <strong>{feedTag && (feeding || reacting) ? "Munching…" : tag}</strong>
          {(feedTag || nearby?.kind !== "nest" || wait === 0) && <KeyCap>E</KeyCap>}
        </div>
      )}
      {creature && !menu && (
        <div className="card hand" aria-label="Your pouch">
          <div className="pouch">
            {Array.from({ length: FORAGE.pouchSize }, (_, i) => {
              const k = pouch[i];
              return <span key={i} className={`slot${k ? " full" : ""}${k && k === food ? " held" : ""}`}>{k === "glyph" ? <GlyphIcon /> : k ? <Blot size={24} /> : null}</span>;
            })}
          </div>
          <span>{food ? <>{FOODS.find((f) => f.id === food)!.name}{isFavourite(food, shownSpecies) && <em className="fav"> Favourite</em>}</> : "Pouch is empty"}</span>
          {carried(pouch, foodIds).length > 1 && <KeyCap>Q</KeyCap>}
        </div>
      )}
      {msg && <div className={`card toast${bad ? " bad" : ""}`} role="status">{msg}</div>}

      {creature && (
        <div className="card mood" aria-label="Your Print">
          <div className="mood-head"><h3>Your Print</h3><MoodFace face={moodFace(creature.mood)} /></div>
          {creatures.length > 1 && (
            <div className="board-nav">
              <button className="btn quiet" aria-label="Previous Print" onClick={() => setPicked(Math.max(0, activeIndex(creatures.length, picked) - 1))} disabled={activeIndex(creatures.length, picked) <= 0}>Back</button>
              <span className="note">Print {activeIndex(creatures.length, picked) + 1} of {creatures.length}</span>
              <button className="btn quiet" aria-label="Next Print" onClick={() => setPicked(Math.min(creatures.length - 1, activeIndex(creatures.length, picked) + 1))} disabled={activeIndex(creatures.length, picked) >= creatures.length - 1}>Next</button>
            </div>
          )}
          <div className="growth" aria-label={`Stage: ${stageById(creature.stage ?? "blot").name}`}>
            <span className="growth-name">{speciesById(shownSpecies).name} · {stageById(creature.stage ?? "blot").name}</span>
            <span className="growth-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressToNext(creature.stage ?? "blot", creature.care ?? 0, creature.age_seconds ?? 0) * 100)}>
              <span style={{ width: `${progressToNext(creature.stage ?? "blot", creature.care ?? 0, creature.age_seconds ?? 0) * 100}%` }} />
            </span>
          </div>
          <div className="drops">
            <InkDrop value={creature.fullness} label="Fed" />
            <InkDrop value={creature.mood} label="Happy" />
          </div>
        </div>
      )}

      {menu === "board" && (
        <div className="card tray" role="dialog" aria-label={BOARD_TITLE}>
          <h3>{pageAt(boardPage).title}</h3>
          {pageAt(boardPage).lines.map((l) => <p className="note" key={l}>{l}</p>)}
          <div className="board-nav">
            <button className="btn quiet" onClick={() => setBoardPage(prevPage(boardPage))} disabled={boardPage <= 0}>Back</button>
            <span className="note">{pageLabel(boardPage)}</span>
            <button className="btn quiet" onClick={() => setBoardPage(nextPage(boardPage))} disabled={boardPage >= BOARD_PAGES.length - 1}>Next</button>
          </div>
          <button className="btn quiet" onClick={() => setMenu(null)}>Close</button>
        </div>
      )}
    </main>
  );
}
