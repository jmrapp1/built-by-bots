// Which screen to show. The 3D world mounts only when a session exists.
// `null` means we haven't heard from Supabase Auth yet, so show nothing playable.
export type Screen = "loading" | "sign-in" | "world";

export function screenFor(session: boolean | null): Screen {
  if (session === null) return "loading";
  return session ? "world" : "sign-in";
}
