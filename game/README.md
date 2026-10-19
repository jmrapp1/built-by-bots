# Blotty game (solo slice)

One garden scene, one starter egg, one procedural creature, two foods. Supabase is the authority for the egg award, hatching and feeding; the browser only displays results.

## Run locally
1. `cd game && npm install`
2. `cp .env.example .env.local` and fill in the project URL and anon (public) key from the Supabase dashboard. Never commit `.env.local`.
3. In the Supabase dashboard (Jon does this): Authentication → Sign In / Providers → keep Email enabled and Anonymous sign-ins OFF; set email confirmation as you prefer.
4. `npm run dev`, then open http://localhost:3000 and sign up with email + password.
5. Tests and checks: `npm test`, `npm run typecheck`, `npm run build`

## Layout
- `data/` readable content (species, foods, rules). `supabase/migrations/` seeds the same values; a test checks they match.
- `supabase/migrations/` schema, RLS and the three server functions: `claim_starter_egg`, `hatch_egg`, `feed_creature`.
- `lib/rules.ts` pure rules mirroring the server, for display and tests.
