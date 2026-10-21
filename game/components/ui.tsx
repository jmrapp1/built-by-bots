// Shared UI pieces. All icons are inline SVG drawn in code: no icon packs, emoji or images.
import type { ReactNode } from "react";
import { ICON_PATHS } from "@/lib/npcs";
import { dropFill, type Face } from "@/lib/ui";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function Blot({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" aria-hidden="true">
      <path d="M18 3c6 7 12 12 12 19a12 12 0 0 1-24 0C6 15 12 10 18 3z" fill="#2b2a33" />
      <circle cx="13.5" cy="22" r="2" fill="#fbf6ea" /><circle cx="22.5" cy="22" r="2" fill="#fbf6ea" />
      <path d="M14 27q4 3 8 0" stroke="#fbf6ea" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}
export const EggIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...S} style={{ color: "#e3a83b" }}>
    <path d="M12 3c4 0 7 6 7 11a7 7 0 0 1-14 0c0-5 3-11 7-11z" fill="#fbf6ea" /><path d="M9 14q3 3 6 0" />
  </svg>
);
export const MenuIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" {...S}><path d="M4 7h16M4 12h16M4 17h16" /></svg>
);
export const EyeIcon = ({ off }: { off: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" {...S}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />{off && <path d="M4 4l16 16" />}
  </svg>
);
export const EnvelopeIcon = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" {...S}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 8l8 6 8-6" /></svg>
);
export const GlyphIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true" {...S} style={{ color: "#3b4a8c" }}><path d="M6 5h12M12 5v14M8 19h8" /><circle cx="12" cy="11" r="2" /></svg>
);

// One ink drop that fills from the bottom. Never red: empty is a soft outline.
export function InkDrop({ value, label }: { value: number; label: string }) {
  const f = dropFill(value);
  const full = f >= 0.95;
  const id = `clip-${label}`;
  return (
    <div className="drop">
      <svg width="40" height="48" viewBox="0 0 40 48" role="img" aria-label={`${label}: ${Math.round(f * 100)} percent`}>
        <defs><clipPath id={id}><path d="M20 3c8 10 15 17 15 27a15 15 0 0 1-30 0C5 20 12 13 20 3z" /></clipPath></defs>
        <path d="M20 3c8 10 15 17 15 27a15 15 0 0 1-30 0C5 20 12 13 20 3z" fill="#f1e8d2" />
        <g clipPath={`url(#${id})`}>
          <rect key={Math.round(f * 100)} className="fill" x="0" y={48 - 48 * f} width="40" height={48 * f} fill={full ? "#5e9c76" : "#3b4a8c"} />
        </g>
        <path d="M20 3c8 10 15 17 15 27a15 15 0 0 1-30 0C5 20 12 13 20 3z" fill="none" stroke={full ? "#5e9c76" : "#2b2a33"} strokeWidth="2" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

export function MoodFace({ face }: { face: Face }) {
  const mouth = face === "happy" ? "M10 22q6 6 12 0" : face === "content" ? "M11 23h10" : "M11 24q5-3 10 0";
  return (
    <svg width="44" height="44" viewBox="0 0 32 32" role="img" aria-label={`Feeling ${face}`} className={face === "happy" ? "bob" : undefined}>
      <circle cx="16" cy="16" r="14" fill="#fbf6ea" stroke="#2b2a33" strokeWidth="2" />
      {face === "sleepy" ? (<><path d="M9 14q2 2 4 0M19 14q2 2 4 0" {...S} /></>) : (<><circle cx="11.5" cy="13" r="1.8" fill="#2b2a33" /><circle cx="20.5" cy="13" r="1.8" fill="#2b2a33" /></>)}
      <path d={mouth} {...S} />
    </svg>
  );
}

export function KeyCap({ children }: { children: ReactNode }) {
  return <span className="keycap">{children}</span>;
}

// A small stroked icon from the shared paths (the same ones the Binder's bubble is drawn from).
export function NpcIcon({ name, size = 28 }: { name: string; size?: number }) {
  const d = (ICON_PATHS as Record<string, string>)[name];
  if (!d) return null;
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...S} style={{ color: name === "question" ? "#3b4a8c" : "#2b2a33" }}><path d={d} /></svg>;
}
