#!/usr/bin/env bash
# Writes game/.env.local with the project URL and the anon (public) key.
# Uses the Supabase CLI under your own login (`supabase login`). Only the anon
# key is read; the service-role key is never used or written.
# Usage: scripts/setup-env.sh <project-ref> [--force]
#   (or set SUPABASE_PROJECT_REF instead of passing the ref)
set -euo pipefail

ref="${1:-${SUPABASE_PROJECT_REF:-}}"
force="${2:-}"
if [ -z "$ref" ] || [ "$ref" = "--force" ]; then
  echo "Usage: scripts/setup-env.sh <project-ref> [--force]" >&2
  echo "Find the ref in the Supabase dashboard: Project Settings → General." >&2
  exit 1
fi
if ! [[ "$ref" =~ ^[a-z0-9]{10,30}$ ]]; then echo "That doesn't look like a project ref." >&2; exit 1; fi

cd "$(dirname "$0")/.."
out=".env.local"
if [ -e "$out" ] && [ "$force" != "--force" ]; then
  echo "$out already exists. Re-run with --force to overwrite it." >&2
  exit 1
fi
command -v supabase >/dev/null || { echo "Install the Supabase CLI and run 'supabase login' first." >&2; exit 1; }
command -v node >/dev/null || { echo "Node is required." >&2; exit 1; }

# Parse the JSON in node; print only the anon key, nothing else.
anon="$(supabase projects api-keys --project-ref "$ref" -o json | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    const k = JSON.parse(s).find(x => x.name === "anon");
    if (!k || !k.api_key) { console.error("No anon key found."); process.exit(1); }
    process.stdout.write(k.api_key);
  });')"

umask 077
{
  echo "NEXT_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co"
  echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}"
} > "$out"
echo "Wrote game/$out (not committed; it is gitignored)."
