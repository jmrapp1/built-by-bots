import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = join(__dirname, '..', 'supabase', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

describe('migrations: column-list conflict targets', () => {
  // Inside a function that returns a table, an unqualified 'on conflict (col)' can clash with an output column (42702).
  it('no later migration reintroduces the ambiguous set_home_decoration conflict target', () => {
    const fix = files.find((f) => f.includes('fix_set_home_decoration'))!;
    const sql = readFileSync(join(dir, fix), 'utf8').replace(/--.*$/gm, '');
    expect(sql).toMatch(/create or replace function public\.set_home_decoration\(p_plot text, p_decoration text\)/);
    expect(sql).toMatch(/on conflict on constraint home_decorations_pkey/);
    expect(sql).not.toMatch(/on conflict\s*\(/i);
    expect(sql).toMatch(/grant execute on function public\.set_home_decoration\(text, text\) to authenticated/);
  });
  it('functions returning a table never use a column-list conflict target (code only)', () => {
    for (const f of files.filter((x) => x >= '20261021000005')) {
      const sql = readFileSync(join(dir, f), 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
      const fns = sql.split(/create (?:or replace )?function/i).slice(1).filter((b) => /returns table/i.test(b.slice(0, 300)));
      const bad = fns.filter((b) => /on conflict\s*\(/i.test(b.split(/\$\$;?\s*\n?\s*(?:revoke|grant|create)/i)[0]));
      // the original (already applied) 000005 is the known offender, fixed by 000006
      if (f !== '20261021000005_home_decorations.sql') expect(bad, f).toHaveLength(0);
    }
  });
});
