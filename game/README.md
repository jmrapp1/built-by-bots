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

## Shape rule

Nothing new in the game is a raw primitive. The look is ink-and-paper, so shapes should feel drawn, not stock.

1. **No raw primitive as a final shape.** A sphere, box, cone or cylinder may be a starting point, but anything a player can see is shaped: a lathed profile, a softened box, a displaced sphere, or two or more shapes blended.
2. **Nothing perfectly symmetric.** Left/right or front/back differences are small but deliberate.
3. **Soft corners, hand feel.** Visible edges are rounded or slightly irregular, never a sharp right angle.
4. **One quirk per object.** Each prop and part has one memorable detail.
5. **Exempt:** invisible helpers, hit areas, particles, glow discs, ripples, rain drops, scraps and other flat or tiny effects. List them in `data/shapeRule.json` under `exempt`.
6. Procedural only. No imported models.

Use the helpers in `lib/shapes.ts` (`softBox`, `lathe`, `wobbleSphere`, `leaning`); they return geometry only, so keep using the usual materials and `addOutline`. `tests/shapeRule.test.ts` counts raw `new THREE.{Sphere,Box,Cone,Cylinder}Geometry` calls in `components/` and `lib/` against `data/shapeRule.json` and fails if a file goes above its baseline or a new file has any. Counts may go down; lower the number in the data file when they do.
