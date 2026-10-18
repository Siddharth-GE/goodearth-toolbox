/**
 * Compares the schema of two databases and reports every difference.
 *
 *   npx tsx scripts/compare-schema.ts --project <ref-a> --against <ref-b>
 *
 * Read-only: no --commit. A staging database quietly a migration behind passes tests
 * and screens, so this gives evidence rather than an argument.
 * Compares columns, rls, policies (qual and with_check text), privileges (anon,
 * authenticated, public, service_role by name), functions and views (definition hash;
 * views also reloptions), triggers, indexes, constraints, buckets and storage policies.
 * It does not compare data, sequence positions or auth.* rows.
 * Some old functions carry CRLF, meaningless to plpgsql: a difference that vanishes once
 * line endings are normalised is counted separately and does not fail the run.
 */
import { managementToken, requireProjectRef, sql } from "./supabase-management";

// Auth settings that are supposed to differ between projects. Keep it short:
// every name here can drift unnoticed.
const SETTINGS_EXPECTED_TO_DIFFER = new Set([
  "site_url", // each environment has its own address
  "uri_allow_list", // and its own redirect list
  "smtp_pass", // returned as a hash, not the value
  "external_google_secret", // same
  "smtp_sender_name", // staging says "(PRACTICE SITE)" on purpose
  "mailer_subjects_magic_link", // and so does its sign-in code subject
]);

type Aspect = { name: string; query: string };

// Each query returns two columns: a stable identity, and everything else about it.
const ASPECTS: Aspect[] = [
  {
    name: "columns",
    query: `select table_name || '.' || column_name as key,
                   data_type || ' null=' || is_nullable || ' default=' || coalesce(column_default, '-') as value
            from information_schema.columns
            where table_schema = 'public'`,
  },
  {
    name: "row level security",
    query: `select c.relname as key,
                   'enabled=' || c.relrowsecurity || ' forced=' || c.relforcerowsecurity as value
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r'`,
  },
  {
    name: "policies",
    query: `select tablename || ' :: ' || policyname as key,
                   cmd || ' | roles=' || coalesce(array_to_string(roles, ','), '-')
                       || ' | using=' || coalesce(qual, '-')
                       || ' | check=' || coalesce(with_check, '-') as value
            from pg_policies where schemaname = 'public'`,
  },
  {
    name: "table privileges",
    query: `select table_name || ' :: ' || grantee || ' :: ' || privilege_type as key, 'granted' as value
            from information_schema.role_table_grants
            where table_schema = 'public'
              and grantee in ('anon', 'authenticated', 'public', 'service_role')`,
  },
  {
    name: "functions",
    query: `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as key,
                   md5(replace(pg_get_functiondef(p.oid), chr(13), ''))
                     || ' raw=' || md5(pg_get_functiondef(p.oid)) as value
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prokind = 'f'`,
  },
  {
    name: "function privileges",
    query: `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') :: '
                     || coalesce(r.rolname, 'PUBLIC') || ' :: ' || a.privilege_type as key,
                   'granted' as value
            from pg_proc p
            join pg_namespace n on n.oid = p.pronamespace
            cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
            left join pg_roles r on r.oid = a.grantee
            where n.nspname = 'public'
              and coalesce(r.rolname, 'PUBLIC') in ('anon', 'authenticated', 'PUBLIC', 'service_role')`,
  },
  {
    name: "views",
    query: `select c.relname as key,
                   md5(replace(pg_get_viewdef(c.oid), chr(13), ''))
                     || ' options=' || coalesce(array_to_string(c.reloptions, ','), '-')
                     || ' raw=' || md5(pg_get_viewdef(c.oid)) as value
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm')`,
  },
  {
    name: "triggers",
    query: `select c.relname || ' :: ' || t.tgname as key,
                   md5(replace(pg_get_triggerdef(t.oid), chr(13), ''))
                     || ' raw=' || md5(pg_get_triggerdef(t.oid)) as value
            from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and not t.tgisinternal`,
  },
  {
    name: "indexes",
    query: `select indexname as key, indexdef as value from pg_indexes where schemaname = 'public'`,
  },
  {
    name: "constraints",
    query: `select conrelid::regclass::text || ' :: ' || conname as key,
                   pg_get_constraintdef(oid) as value
            from pg_constraint where connamespace = 'public'::regnamespace`,
  },
  {
    name: "storage buckets",
    query: `select id as key,
                   'public=' || public
                     || ' limit=' || coalesce(file_size_limit::text, '-')
                     || ' types=' || coalesce(array_to_string(allowed_mime_types, ','), '-') as value
            from storage.buckets`,
  },
  {
    name: "storage policies",
    query: `select tablename || ' :: ' || policyname as key,
                   cmd || ' | using=' || coalesce(qual, '-') || ' | check=' || coalesce(with_check, '-') as value
            from pg_policies where schemaname = 'storage'`,
  },
];

// Auth settings live on the platform, not in the database.
async function authConfig(ref: string): Promise<Record<string, unknown>> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${managementToken()}` },
  });
  if (!response.ok) throw new Error(`${ref}: could not read auth config (HTTP ${response.status})`);
  return (await response.json()) as Record<string, unknown>;
}

async function readAspect(ref: string, aspect: Aspect): Promise<Map<string, string>> {
  const rows = await sql<{ key: string; value: string }>(ref, aspect.query);
  return new Map(rows.map((row) => [row.key, row.value]));
}

// Long quals and index definitions are unreadable in full; show enough to identify.
function short(value: string): string {
  const collapsed = value.replace(/\s+/g, " ").trim();
  return collapsed.length > 160 ? `${collapsed.slice(0, 160)}…` : collapsed;
}

async function main() {
  const argv = process.argv.slice(2);
  const a = requireProjectRef(argv, "--project");
  const b = requireProjectRef(argv, "--against");

  if (a === b) {
    console.log("Both refs are the same database. Nothing to compare.");
    return;
  }

  console.log(`A: ${a}`);
  console.log(`B: ${b}\n`);

  let differences = 0;
  let whitespaceOnly = 0;

  for (const aspect of ASPECTS) {
    const [inA, inB] = await Promise.all([readAspect(a, aspect), readAspect(b, aspect)]);

    const onlyA: string[] = [];
    const onlyB: string[] = [];
    const changed: string[] = [];

    for (const [key, value] of inA) {
      if (!inB.has(key)) {
        onlyA.push(key);
        continue;
      }
      const other = inB.get(key)!;
      if (other === value) continue;
      // Hashed aspects carry two hashes: CR-stripped, then ` raw=` untouched.
      // A difference that vanishes once CR is stripped is counted, not shown.
      const sameNormalised =
        value.split(" raw=")[0] === other.split(" raw=")[0] ||
        value.replace(/\r/g, "") === other.replace(/\r/g, "");
      if (sameNormalised) {
        whitespaceOnly += 1;
        continue;
      }
      changed.push(key);
    }
    for (const key of inB.keys()) {
      if (!inA.has(key)) onlyB.push(key);
    }

    const total = onlyA.length + onlyB.length + changed.length;
    if (total === 0) {
      console.log(`  ${aspect.name}: ${inA.size} checked, identical`);
      continue;
    }

    differences += total;
    console.log(`\n  ${aspect.name.toUpperCase()} — ${total} difference${total === 1 ? "" : "s"}`);
    for (const key of onlyA.sort()) console.log(`    only in A   ${key}`);
    for (const key of onlyB.sort()) console.log(`    only in B   ${key}`);
    for (const key of changed.sort()) {
      console.log(`    differs     ${key}`);
      console.log(`                A: ${short(inA.get(key)!)}`);
      console.log(`                B: ${short(inB.get(key)!)}`);
    }
    console.log("");
  }

  // Platform-held settings: BUGCATCHER #10 (a magic-link email template can swap two-factor).
  const [settingsA, settingsB] = await Promise.all([authConfig(a), authConfig(b)]);
  const settingKeys = [...new Set([...Object.keys(settingsA), ...Object.keys(settingsB)])]
    .filter((key) => !SETTINGS_EXPECTED_TO_DIFFER.has(key))
    .sort();

  const settingDiffs = settingKeys.filter(
    (key) => JSON.stringify(settingsA[key]) !== JSON.stringify(settingsB[key]),
  );

  if (settingDiffs.length === 0) {
    console.log(`  auth settings: ${settingKeys.length} checked, identical`);
  } else {
    differences += settingDiffs.length;
    console.log(`\n  AUTH SETTINGS — ${settingDiffs.length} difference(s)`);
    for (const key of settingDiffs) {
      console.log(`    differs     ${key}`);
      console.log(`                A: ${short(JSON.stringify(settingsA[key]) ?? "absent")}`);
      console.log(`                B: ${short(JSON.stringify(settingsB[key]) ?? "absent")}`);
    }
    console.log("");
  }

  if (whitespaceOnly > 0) {
    console.log(
      `\n  (${whitespaceOnly} definition${whitespaceOnly === 1 ? "" : "s"} differ by line endings alone — whitespace to plpgsql, not counted)`,
    );
  }

  if (differences === 0) {
    console.log("\nNo differences. The two databases have the same shape.");
  } else {
    console.log(`\n${differences} difference${differences === 1 ? "" : "s"} in total.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
