"use client";
// S37 step 1: touch-mode detection, the portrait "turn your phone" cover and the full screen button.
// Mounted only when data/mobile.json says enabled (see MobileShell), so with the flag off nothing here runs: no listeners, no class, no markup.
import { useEffect, useRef, useState } from "react";
import TouchControls from "@/components/TouchControls";
import { useTouchWording } from "@/components/useTouchWording";
import { hudFitOn } from "@/lib/firstTen";
import type { Prompts } from "@/lib/touchControls";
import { MOBILE, MOBILE_ENABLED, canFullscreen, goFullscreen, isFullscreen, isPortrait, leaveFullscreen, showPortraitCover, touchMode, touchOverride, type LastInput } from "@/lib/touchInput";

const prod = process.env.NODE_ENV === "production";

function Inner({ signedIn, prompts, panelOpen, onClose }: { signedIn: boolean; prompts: Prompts; panelOpen: boolean; onClose: () => void }) {
  const [touch, setTouch] = useState(false);
  const [portrait, setPortrait] = useState(false);
  const [full, setFull] = useState(false);
  const [canFs, setCanFs] = useState(false);
  const [forcedPortrait, setForcedPortrait] = useState(false);
  const words = useTouchWording(); // S38a
  const last = useRef<LastInput>(null);
  const root = useRef<HTMLDivElement>(null);
  const over = useRef(touchOverride("", true));

  useEffect(() => {
    over.current = touchOverride(window.location.search, prod);
    setForcedPortrait(over.current.portrait);
    const q = MOBILE.hybridPrimaryOnly ? "(pointer: coarse)" : "(any-pointer: coarse)";
    const compute = () => {
      if (over.current.touch !== null) return over.current.touch;
      let coarse = false;
      try { coarse = window.matchMedia(q).matches; } catch { coarse = false; }
      return touchMode(coarse, navigator.maxTouchPoints ?? 0, MOBILE_ENABLED, last.current);
    };
    const size = () => setPortrait(isPortrait(window.innerWidth, window.innerHeight));
    const fs = () => setFull(isFullscreen(document));
    const refresh = () => setTouch(compute());
    const input = (kind: LastInput) => { if (last.current !== kind) { last.current = kind; refresh(); } };
    // Only real input counts: later steps send fake key events, which are not trusted and must not switch touch mode off.
    const pd = (e: PointerEvent) => { if (e.pointerType === "touch") input("touch"); };
    const pm = (e: PointerEvent) => { if (e.pointerType === "mouse") input("mouse"); };
    const kd = (e: KeyboardEvent) => { if (e.isTrusted) input("mouse"); };
    refresh(); size(); fs();
    setCanFs(canFullscreen(document.documentElement));
    window.addEventListener("resize", size);
    window.addEventListener("orientationchange", size);
    document.addEventListener("fullscreenchange", fs);
    window.addEventListener("pointerdown", pd, { passive: true });
    window.addEventListener("pointermove", pm, { passive: true });
    window.addEventListener("keydown", kd, { passive: true });
    return () => {
      window.removeEventListener("resize", size);
      window.removeEventListener("orientationchange", size);
      document.removeEventListener("fullscreenchange", fs);
      window.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("keydown", kd);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("touch", touch);
    // S38d: the phone HUD fit class, only with the firstTen.hudFit switch on AND touch mode; flag off adds nothing.
    let fit = false;
    try { fit = touch && hudFitOn(window.location.search, process.env.NODE_ENV === "production"); } catch { fit = false; }
    document.body.classList.toggle("hud-fit", fit);
    return () => { document.body.classList.remove("touch"); document.body.classList.remove("hud-fit"); };
  }, [touch]);

  const cover = showPortraitCover(touch, portrait, signedIn, forcedPortrait);
  const showFs = touch && signedIn && !cover && canFs;
  return (
    <div ref={root}>
      {showFs && (
        <button type="button" className="iconbtn fs-btn" aria-label={full ? "Leave full screen" : "Play full screen"}
          onClick={() => { if (full) void leaveFullscreen(document); else void goFullscreen(document.documentElement, screen); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {full ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
          </svg>
        </button>
      )}
      {touch && signedIn && !cover && <TouchControls prompts={prompts} hidden={panelOpen} onClose={onClose} labels={words} />}
      {cover && (
        <div className="turn-cover" role="status" aria-live="polite">
          <svg width="160" height="120" viewBox="0 0 160 120" aria-hidden="true" fill="none" stroke="#2b2a33" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <rect className="turn-phone" x="62" y="14" width="36" height="64" rx="7" fill="#fbf6ea" />
            <path d="M68 24h24M80 70h0" />
            <path d="M118 96q18-10 14-30M132 66l-7 7M132 66l8 6" stroke="#e3a83b" />
          </svg>
          <p>Turn your phone sideways to play</p>
        </div>
      )}
    </div>
  );
}

export default function MobileShell({ signedIn, prompts, panelOpen, onClose }: { signedIn: boolean; prompts: Prompts; panelOpen: boolean; onClose: () => void }) {
  if (!MOBILE_ENABLED) return null;
  return <Inner signedIn={signedIn} prompts={prompts} panelOpen={panelOpen} onClose={onClose} />;
}
