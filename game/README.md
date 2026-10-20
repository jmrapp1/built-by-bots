# Blotty game (solo slice)

One garden scene, one starter egg, one procedural creature, two foods. Supabase is the authority for the egg award, hatching and feeding; the browser only displays results.

## Local setup
1. `cd game && npm install`
2. Log in to the Supabase CLI with your own account: `supabase login`
3. Create `.env.local`: `scripts/setup-env.sh <project-ref>` (the ref is in the dashboard under Project Settings → General). It writes the project URL and the anon (public) key only, and refuses to overwrite an existing file unless you add `--force`.
4. `npm run dev`, then open http://localhost:3000 and sign up with email + password.

Manual fallback: copy `.env.example` to `.env.local` and paste the Project URL and the `anon` public key from the dashboard under Project Settings → API. Never use the `service_role` key here.

Supabase dashboard (Jon does this): Authentication → Sign In / Providers → keep Email enabled and Anonymous sign-ins OFF; set email confirmation as you prefer.

Checks: `npm test`, `npm run typecheck`, `npm run build`.

## Fonts
Fraunces (headings) and Nunito (UI) are self-hosted in `public/fonts/` as variable WOFF2 files, converted from the official Google Fonts repository files (`github.com/google/fonts`, `ofl/fraunces` and `ofl/nunito`). Both are under the SIL Open Font License 1.1; the licence texts are `public/fonts/OFL-Fraunces.txt` and `OFL-Nunito.txt`. Nothing loads from a CDN, and the CSS falls back to system fonts if a file is missing.

## Layout
- `data/` readable content (species, foods, rules). `supabase/migrations/` seeds the same values; a test checks they match.
- `supabase/migrations/` schema, RLS and the three server functions: `claim_starter_egg`, `hatch_egg`, `feed_creature`.
- `lib/rules.ts` pure rules mirroring the server, for display and tests.
