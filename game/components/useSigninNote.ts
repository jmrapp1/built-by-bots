"use client";
// S42: true when the sideways note should show on the sign-in card: the signinNote switch is on AND the page is in touch mode (body.touch).
import { useEffect, useState } from "react";
import { signinNoteOn } from "@/lib/firstTen";

export function useSigninNote(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let enabled = false;
    try { enabled = signinNoteOn(window.location.search, process.env.NODE_ENV === "production"); } catch { enabled = false; }
    if (!enabled) { setOn(false); return; }
    const read = () => setOn(document.body.classList.contains("touch"));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return on;
}
