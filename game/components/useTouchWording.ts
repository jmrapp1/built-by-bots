"use client";
// S38a: true when the touch words should show: the wording switch is on AND the page is in touch mode (body.touch, set by the S37 shell).
// Follows the class live, so leaving touch mode mid-session brings the keyboard words back on the next render.
import { useEffect, useState } from "react";
import { wordingOn } from "@/lib/firstTen";

export function useTouchWording(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let enabled = false;
    try { enabled = wordingOn(window.location.search, process.env.NODE_ENV === "production"); } catch { enabled = false; }
    if (!enabled) { setOn(false); return; }
    const read = () => setOn(document.body.classList.contains("touch"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return on;
}
