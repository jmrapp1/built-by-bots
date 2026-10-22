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
import { SKIP } from "@/lib/skip";
import { PLAY, nextFood } from "@/lib/play";
import MapPage from "@/components/MapPage";
import { newWalked, type Walked } from "@/lib/map";
import FirstRunGuide from "@/components/FirstRunGuide";
import { guideOverride } from "@/lib/guide";
import { FOLLOW, FOLLOW_TEXT } from "@/lib/follow";
import KeepsakePicker from "@/components/KeepsakePicker";
import PickerStrip from "@/components/PickerStrip";
import { decorPreview, decorStrip, withChoice, type Placed } from "@/lib/decor";
import { loadHomeDecor, ownedFromDecorRows, runPlace, settlePlaced } from "@/lib/decor-server";
import { gift2Npc, gift2Strip, giftNpc, giftStrip, runClaimGift, runClaimGift2, withOwned } from "@/lib/gifts";
import { STUB_OWNED, ownedFromRows, pickerPreview, runPick, settlePick } from "@/lib/picker";
import { FOUND_EGG, MARGINS_ERRORS, openedFromClaims, runUnfold, type Outcome } from "@/lib/margins-server";
import { openedWorldFromClaims, runWorldUnfold } from "@/lib/spots-server";
import { FORAGE, carried, inHand, pouchAdd, pouchSpend } from "@/lib/forage";
import { FED_MESSAGE, POUCH_FULL, feedPrompt, isFeedMessage, friendlyAuthError, friendlyFeedError, moodFace, promptFor, FOUND_PROMPT, SKIP_PROMPT, keyLabel } from "@/lib/ui";
import { Blot, EggIcon, EnvelopeIcon, EyeIcon, GlyphIcon, InkDrop, KeyCap, NpcIcon, MenuIcon, MoodFace, PageIcon } from "@/components/ui";
import type { Genes } from "@/lib/creature";

const World = dynamic(() => import("@/components/World"), { ssr: false });

type Egg = { id: string; kind?: string; hatch_at: string; hatched_at: string | null };
function useMapState() {
  const [open, setOpen] = useState(false);
  const [walked, setWalked] = useState<Walked>(() => newWalked());
  const [pose, setPose] = useState<{ x: number; z: number; yaw: number } | null>(null);
  const [spotPts, setSpotPts] = useState<{ x: number; z: number }[]>([]);
  return { open, setOpen, walked, pose, spotPts, onSpots: setSpotPts, onPose: (w: Walked, p: { x: number; z: number; yaw: number } | null) => { setWalked(new Set(w)); setPose(p); } };
}

type Creature = { id: string; species?: string; worn_cosmetic?: string | null; genes: Genes; fullness: number; mood: number; stage?: string; care?: number; age_seconds?: number };

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
  const [userId, setUserId] = useState<string | null>(null); // whose map this browser keeps (the world is the player's, not a Print's)
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
  const [followMode, setFollowMode] = useState<"off" | "can" | "on">("off"); // come along: the walk-together prompt
  const [canSplash, setCanSplash] = useState(true);
  const [npcLine, setNpcLine] = useState<{ id: string; name: string; text: string; icons: string[]; last: boolean; note?: string; g?: 1 | 2 } | null>(null); // N1: the neighbour's hint strip (N4: `last` = the final hint, where a gift is offered)
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftTaken, setGiftTaken] = useState<string[]>([]); // neighbours whose gift was answered this sign-in (the server still decides)
  const [npcClose, setNpcClose] = useState(0);
  const [guidePose, setGuidePose] = useState<{ x: number; z: number; yaw: number } | null>(null); // first-run guide
  const [guideGlow, setGuideGlow] = useState(false);
  const [margins, setMargins] = useState({ inside: false, left: 0, total: 0, scraps: 0 });
  // Dev-only look at another species (?species=leaflet). Display only; ignored in production builds.
  const previewSpecies = typeof window === "undefined" ? null : speciesOverride(window.location.search, process.env.NODE_ENV === "production");
  const shownSpecies = previewSpecies ?? creature?.species ?? "blotling";
  const shownGenes = creature ? (previewSpecies ? { ...creature.genes, hue: clampHue(creature.genes.hue, speciesById(previewSpecies)) } : creature.genes) : null;
  const [boardPage, setBoardPage] = useState(0);
  const [menu, setMenu] = useState<null | "board" | "keepsakes" | "decor">(null);
  // ?decor=stub (dev only): test decorations on the Home plots, in memory only. Nothing is saved or sent.
  const stubDecor = typeof window === "undefined" ? false : decorPreview(window.location.search, process.env.NODE_ENV === "production");
  const [placed, setPlaced] = useState<Placed>({});
  const [decorPlot, setDecorPlot] = useState<string | null>(null);
  // Server mode: null until the claim and reads on entering Home have worked. A failed read leaves it null (nothing shown, no prompt).
  const [homeDecor, setHomeDecor] = useState<{ owned: string[]; placed: Placed } | null>(null);
  const [decorNote, setDecorNote] = useState<string | null>(null);
  const [decorBusy, setDecorBusy] = useState(false);
  const decorTried = useRef<string | null>(null); // the account whose starters were claimed this page load
  const mp = useMapState();
  // The keepsake picker. Owned keepsakes are read only when it opens; a failed read just lists none. ?picker=stub (dev only) uses a stub and never calls the server.
  const stubPicker = typeof window === "undefined" ? false : pickerPreview(window.location.search, process.env.NODE_ENV === "production");
  const [owned, setOwned] = useState<string[]>([]);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [stubWorn, setStubWorn] = useState<string | null>(null);

  // Every creature update goes through here so a stage change is announced once.
  const lastStage = useRef<Record<string, string>>({}); // last stage seen per Print
  const applyCreature = (c: Creature) => {
    const st = c.stage ?? "blot";
    if (stageChanged(lastStage.current[c.id] ?? null, st)) setMsg(`Your Print grew into a ${stageById(st).name}!`);
    lastStage.current[c.id] = st;
    setCreatures((all) => (all.some((x) => x.id === c.id) ? all.map((x) => (x.id === c.id ? (c.worn_cosmetic === undefined ? { ...c, worn_cosmetic: x.worn_cosmetic } : c) : x)) : [...all, c]));
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
    sb.auth.getSession().then(({ data }) => { setSession(!!data.session); setUserId(data.session?.user?.id ?? null); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => { setSession(!!s); setUserId(s?.user?.id ?? null); });
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
  const openPicker = async () => {
    setPickNote(null); setMenu("keepsakes");
    if (stubPicker) return setOwned(STUB_OWNED);
    const { data, error } = await supabase().from("owned_cosmetics").select("cosmetic");
    setOwned(error ? [] : ownedFromRows(data));
  };
  // The only write the picker makes: set_worn_cosmetic. The Print changes only when the server confirms; on failure it stays as it was.
  const pick = async (choice: string | null) => {
    if (picking) return;
    setPickNote(null);
    if (stubPicker) return setStubWorn(choice); // preview: no server call
    if (!creature) return;
    setPicking(true);
    const out = await runPick((a) => supabase().rpc("set_worn_cosmetic", a), creature.id, choice);
    setPicking(false);
    const s = settlePick(out, creature.worn_cosmetic);
    setPickNote(s.note);
    if (out.ok) setCreatures((cs) => cs.map((c) => (c.id === creature.id ? { ...c, worn_cosmetic: s.worn } : c)));
  };
  // Entering Home: claim the starter pieces once (the server ignores repeats), then read what is owned and placed. ?decor=stub never calls the server.
  const enterHome = () => {
    if (stubDecor || !userId || decorTried.current === userId) return;
    decorTried.current = userId;
    const sb = supabase(), me = userId;
    loadHomeDecor(
      async () => sb.rpc("claim_starter_decorations"),
      async () => sb.from("owned_decorations").select("decoration"),
      async () => sb.from("home_decorations").select("plot,decoration"),
    ).then((r) => { if (r) setHomeDecor(r); else if (decorTried.current === me) decorTried.current = null; }); // a failed read is quiet; the next visit to Home tries again
  };
  useEffect(() => { setHomeDecor(null); decorTried.current = null; setGiftTaken([]); }, [userId]); // another account never sees this one's room
  // Place or clear one plot through set_home_decoration. The room changes only when the server confirms.
  const placeDecor = async (choice: string | null) => {
    if (!decorPlot || decorBusy) return;
    if (stubDecor) { setPlaced((o) => withChoice(decorPlot, o, choice)); setMenu(null); return; }
    if (!homeDecor) return;
    setDecorBusy(true); setDecorNote(null);
    const out = await runPlace(async (a) => supabase().rpc("set_home_decoration", a), decorPlot, choice);
    setDecorBusy(false);
    if (out.ok) { setHomeDecor((h) => (h ? { ...h, placed: settlePlaced(h.placed, out) } : h)); setMenu(null); } else setDecorNote(out.note);
  };
  // N4: take a neighbour's gift. Only the neighbour's id goes to the server; the strip changes only on its answer.
  const takeGift = async () => {
    const line = npcLine, n = line ? giftNpc(line.id) : null;
    if (!line || !n || !userId || stubDecor || giftBusy) return;
    setGiftBusy(true);
    const sb = supabase(), out = await runClaimGift(async (a) => sb.rpc("claim_npc_gift", a), n.id);
    if (out.ok) {
      const s = giftStrip(n, out);
      if (s) setNpcLine({ id: n.id, ...s, last: line.last, g: 1 });
      setGiftTaken((g) => (g.includes(n.id) ? g : [...g, n.id]));
      if (homeDecor) { // the Home picker lists what the server says we own: read it again, else add this one
        const r = await sb.from("owned_decorations").select("decoration");
        const owned = r.error ? withOwned(homeDecor.owned, out.decoration) : ownedFromDecorRows(r.data);
        setHomeDecor((h) => (h ? { ...h, owned } : h));
      }
    } else setNpcLine((l) => (l && l.id === n.id ? { ...l, note: out.note } : l));
    setGiftBusy(false);
  };
  // N5: on a neighbour's last hint, once the first gift is known to be claimed, ask for the second (once per neighbour per sign-in).
  // The server decides if it is time; a waiting answer shows the fixed line, nothing is granted here.
  const gift2Tried = useRef<Record<string, boolean>>({});
  useEffect(() => { gift2Tried.current = {}; }, [userId]);
  useEffect(() => {
    const line = npcLine, n = line ? gift2Npc(line.id) : null;
    if (!line || !n || !line.last || line.g || !userId || stubDecor || gift2Tried.current[n.id]) return;
    gift2Tried.current[n.id] = true;
    const sb = supabase(), me = userId, id = n.id;
    (async () => {
      let first = giftTaken.includes(id);
      if (!first) { const r = await sb.from("npc_gifts").select("npc").eq("npc", id); first = !r.error && Array.isArray(r.data) && r.data.length > 0; }
      if (!first) { gift2Tried.current[id] = false; return; } // no first gift yet: nothing to ask
      const out = await runClaimGift2(async (a) => sb.rpc("claim_npc_gift2", a), id);
      if (!out.ok) { gift2Tried.current[id] = false; setNpcLine((l) => (l && l.id === id ? { ...l, note: out.note } : l)); return; }
      const s = gift2Strip(n, out);
      setNpcLine((l) => (l && l.id === id && s ? { ...l, ...s, g: 2 } : l));
      if (out.state === "claimed") setHomeDecor((h) => (h ? { ...h, owned: withOwned(h.owned, out.decoration) } : h)); // optimistic add of what the server said
      if (out.state === "claimed") {
        const r = await sb.from("owned_decorations").select("decoration");
        if (!r.error) setHomeDecor((h) => (h && userId === me ? { ...h, owned: ownedFromDecorRows(r.data) } : h));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcLine]);
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
    if (!isFeedMessage(msg) && msg !== POUCH_FULL && msg !== MARGINS_ERRORS.network) return;
    const t = setTimeout(() => setMsg((m) => (m === msg ? "" : m)), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code === "Escape") { setMenu(null); setMenuOpen(false); mp.setOpen(false); }
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
  // The Margins: the server decides what is inside a page. The client sends the page number and shows the answer.
  const unfoldPage = (spot: number, layoutDay: string): Promise<Outcome> =>
    runUnfold(async (n) => supabase().rpc("margins_unfold", { p_spot: n }), spot, layoutDay, (n) => wasOpen(n, layoutDay)); // checked against the day the pages were laid out for
  // Does the server already hold a claim row for this page and day? Null when it can't say.
  const wasOpen = async (spot: number, day: string): Promise<boolean | null> => {
    try {
      const { data, error } = await supabase().from("margins_claims").select("spot").eq("region", "margins").eq("spot", spot).eq("day", day);
      return error || !Array.isArray(data) ? null : data.length > 0;
    } catch {
      return null;
    }
  };
  // W5: the spots across the World. The server decides what is inside (world_unfold); the client sends a region name and a spot number.
  const unfoldWorld = (region: string, spot: number, layoutDay: string): Promise<Outcome> =>
    runWorldUnfold(async (r, n) => supabase().rpc("world_unfold", { p_region: r, p_spot: n }), region, spot, layoutDay, (r, n) => wasWorldOpen(r, n, layoutDay));
  // Does the server already hold a claim row for this region, spot and day? Null when it can't say. A list read, never .single().
  const wasWorldOpen = async (region: string, spot: number, day: string): Promise<boolean | null> => {
    try {
      const { data, error } = await supabase().from("margins_claims").select("spot").eq("region", region).eq("spot", spot).eq("day", day);
      return error || !Array.isArray(data) ? null : data.length > 0;
    } catch {
      return null;
    }
  };
  // The World spots this player already opened on this day ("region:spot"), from their own rows. Null when the server can't say.
  const loadWorldOpened = async (day: string): Promise<string[] | null> => {
    try {
      const { data, error } = await supabase().from("margins_claims").select("region,spot,result,day").eq("day", day).neq("region", "margins");
      return error ? null : openedWorldFromClaims(data, day);
    } catch {
      return null;
    }
  };
  // The pages this player already opened on this day, from their own rows. Null when the server can't say.
  const loadOpened = async (day: string): Promise<number[] | null> => {
    try {
      const { data, error } = await supabase().from("margins_claims").select("spot,result,day").eq("region", "margins").eq("day", day);
      return error ? null : [...openedFromClaims(data, day)];
    } catch {
      return null;
    }
  };
  // The server gave a keepsake and wore it on the player's first Print (the one the app lists first). Mirror that here; a reload reads the same from the server.
  const keepsakeFound = (id: string) => setCreatures((cs) => cs.map((c, i) => (i === 0 ? { ...c, worn_cosmetic: id } : c)));
  const marginsNote = (text: string) => {
    if (text === FOUND_EGG) void load().then(() => setMsg(text)); // a found egg is in the nest now; load() clears the line, so say it after
    else setMsg(text);
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
    else if (p.kind === "decor") { if (stubDecor || homeDecor) { setDecorNote(null); setDecorPlot(p.id); setMenu("decor"); } }
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
      <World genes={shownGenes} species={shownSpecies} stage={creature?.stage ?? "blot"} eggPhase={egg ? "in-nest" : !starter ? "unclaimed" : dailyReady ? "daily" : "none"} onNearby={setNearby} onInteract={interact} onPrintNear={setPrintNear} onFindable={setFindable} onFollow={setFollowMode} onCanSplash={setCanSplash} onFeedPrint={feed} fedTick={fedTick} locked={feeding || reacting || !!menu || menuOpen || mp.open} mapOpen={mp.open} decorPlaced={stubDecor ? placed : homeDecor?.placed ?? null} onHome={enterHome} onGuidePose={setGuidePose} guideGlow={guideGlow} onMapPose={mp.onPose} walkKey={userId} onMapKey={() => { if (!menu && !menuOpen) mp.setOpen((v) => !v); }} onGather={gather} onMargins={setMargins} onUnfold={unfoldPage} onLoadOpened={loadOpened} onMarginsNote={marginsNote} onNpcTalk={setNpcLine} npcClose={npcClose} onWorldUnfold={unfoldWorld} onLoadWorldOpened={loadWorldOpened} onSpotsOpened={mp.onSpots} onKeepsake={keepsakeFound} worn={(stubPicker ? stubWorn : creature?.worn_cosmetic) ?? null} canGather={(k) => !!pouchAdd(pouchRef.current, k)} canOffer={!!food} />

      <FirstRunGuide loaded={claimedOn !== undefined} clear={!menu && !menuOpen && !mp.open && !npcLine} existing={creatures.length > 0 || eggs.some((e) => !!e.hatched_at)} eggClaimed={!!starter} nearEgg={nearby?.kind === "egg"} printNear={printNear} hasSnack={!!food} hasCreature={!!creature} fedTick={fedTick} pose={guidePose} onGlow={setGuideGlow} preview={typeof window !== "undefined" && guideOverride(window.location.search, process.env.NODE_ENV === "production") === "feed"} />

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
            <dt><KeyCap>C</KeyCap></dt><dd style={{ margin: 0 }}>By day, near your Print: walk together (press again to stop)</dd>
            <dt><KeyCap>M</KeyCap></dt><dd style={{ margin: 0 }}>Open the map</dd>
            <dt><KeyCap>Esc</KeyCap></dt><dd style={{ margin: 0 }}>Close panels</dd>
          </dl>
          <button className="btn quiet" onClick={signOut}>Sign out</button>
        </div>
      )}

      {npcLine && !menu && (
        <div className="card npc-strip" role="dialog" aria-label={npcLine.name}>
          <div className="npc-icons">{npcLine.icons.map((n, i) => <NpcIcon key={i} name={n} />)}</div>
          <p><strong>{npcLine.name}</strong><br />{npcLine.text}</p>
          {npcLine.note && <p className="note" role="status">{npcLine.note}</p>}
          {npcLine.last && userId && !stubDecor && giftNpc(npcLine.id) && !giftTaken.includes(npcLine.id) && <button className="btn" disabled={giftBusy} onClick={takeGift}>Take it</button>}
          <button className="btn" onClick={() => { setNpcLine(null); setNpcClose((n) => n + 1); }}>Thanks</button>
        </div>
      )}
      {tag && !menu && !npcLine && (
        <div className="card tag" role="status">
          {!feedTag && nearby?.kind === "egg" && <EggIcon />}
          <strong>{feedTag && (feeding || reacting) ? "Munching…" : tag}</strong>
          {(feedTag || nearby?.kind !== "nest" || wait === 0) && <KeyCap>E</KeyCap>}
        </div>
      )}
      {followMode !== "off" && !menu && !npcLine && !findable && (
        <div className="card tag" role="status" style={{ bottom: tag || (nearby?.kind === "pond" && canSplash) ? 144 : undefined }}>
          <strong>{followMode === "on" ? FOLLOW_TEXT.stop : FOLLOW_TEXT.start}</strong><KeyCap>{keyLabel(FOLLOW.key)}</KeyCap>
        </div>
      )}
      {nearby?.kind === "pond" && canSplash && !menu && !npcLine && !feedTag && !findable && (
        <div className="card tag" role="status" style={{ bottom: 92 }}>
          <PageIcon /><strong>{SKIP_PROMPT.line}</strong><KeyCap>{keyLabel(SKIP.key)}</KeyCap>
        </div>
      )}
      {margins.inside && (
        <div className="card finds" aria-label="Pages left to unfold today">
          {Array.from({ length: margins.total }, (_, i) => <span key={i} className={`page-pip${i < margins.total - margins.left ? " done" : ""}`} />)}
          <span className="scrap-count" aria-label="Glyph scraps"><span className="scrap-icon" />{margins.scraps}</span>
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
          <button className="btn quiet" onClick={openPicker}>Keepsakes</button>
        </div>
      )}

      {mp.open && <MapPage walked={mp.walked} pose={mp.pose} opened={mp.spotPts} onClose={() => mp.setOpen(false)} />}
      {menu === "keepsakes" && <KeepsakePicker owned={owned} worn={stubPicker ? stubWorn : creature?.worn_cosmetic} busy={picking} note={pickNote} onPick={pick} onClose={() => setMenu(null)} />}
      {menu === "decor" && (stubDecor || homeDecor) && decorPlot && (
        <PickerStrip {...(stubDecor ? decorStrip(decorPlot, placed) : decorStrip(decorPlot, homeDecor?.placed ?? {}, homeDecor?.owned ?? []))} busy={decorBusy} note={decorNote} onPick={placeDecor} onClose={() => setMenu(null)} />
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
