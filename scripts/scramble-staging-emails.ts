/**
 * Rewrites every staff email address on the staging database to an unroutable one, so
 * staging can never email a real member of staff.
 *
 *   npx tsx scripts/scramble-staging-emails.ts --project <ref> --keep a@b,c@d     # dry run
 *   npx tsx scripts/scramble-staging-emails.ts --project <ref> --keep a@b --commit
 *   npx tsx scripts/scramble-staging-emails.ts --project <ref> --restore a@b,c@d --from <production-ref> [--commit]
 *       # puts real addresses BACK for named people, read from production by account id
 *
 * Run it after the cutover is confirmed, never before, so the old database stays a usable
 * fallback. The guard refuses any database whose site_url does not say "staging".
 * It changes auth.users.email, raw_user_meta_data and auth.identities.identity_data (what
 * Google and password sign-in match on). Nothing in `public` changes.
 * Safe to run twice: an address already at @staging.invalid is skipped.
 */
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

// Unroutable by construction: .invalid can never be registered (RFC 2606).
const DOMAIN = "staging.invalid";

type Account = { id: string; email: string | null };

async function main() {
  const argv = process.argv.slice(2);
  const ref = requireProjectRef(argv);
  const commit = isCommit(argv);

  const keepAt = argv.indexOf("--keep");
  const keep = new Set(
    (keepAt === -1 ? "" : (argv[keepAt + 1] ?? ""))
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean),
  );

  if (keep.size === 0 && !argv.includes("--restore")) {
    console.log(
      "--keep is required, and needs at least one address.\n" +
        "A staging database nobody at all can sign in to is not useful — keep your own\n" +
        "address and the probe account.",
    );
    return;
  }

  const config = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  });
  const siteUrl = String(((await config.json()) as { site_url?: string }).site_url ?? "");
  if (!siteUrl.includes("staging")) {
    console.error(`Refusing to run: ${ref} has site_url "${siteUrl}", which does not say staging.`);
    console.error(
      "Point the staging project at its own URL first. This check is what stops this\n" +
        "script ever being aimed at production.",
    );
    process.exitCode = 1;
    return;
  }

  const restoreAt = argv.indexOf("--restore");
  if (restoreAt !== -1) {
    const wanted = (argv[restoreAt + 1] ?? "")
      .split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    const source = requireProjectRef(argv, "--from");
    const everyone = wanted.length === 1 && wanted[0] === "all";

    if (wanted.length === 0) {
      console.log("--restore needs at least one address, or the word 'all'. Nothing done.");
      return;
    }

    // Real addresses come from production, matched on account id (identical on both,
    // because the copy preserved them), not rebuilt from the scrambled local part.
    const real = await sql<{ id: string; email: string }>(
      source,
      everyone
        ? `select id, email from auth.users where email is not null`
        : `select id, email from auth.users
           where lower(email) in (${wanted.map(literal).join(", ")})`,
    );

    const missing = everyone
      ? []
      : wanted.filter((address) => !real.some((row) => row.email.toLowerCase() === address));
    for (const address of missing) console.log(`  ! no account on ${source} for ${address}`);

    console.log(`\n  restoring ${real.length} address(es) on ${ref}:`);
    for (const row of real.slice(0, 8)) console.log(`    ${row.email}`);
    if (real.length > 8) console.log(`    … and ${real.length - 8} more`);

    if (!commit) {
      console.log("\nDry run. Nothing was written. Re-run with --commit to restore.");
      return;
    }

    for (const row of real) {
      await sql(
        ref,
        `update auth.users
           set email = ${literal(row.email)},
               raw_user_meta_data = case
                 when raw_user_meta_data ? 'email'
                 then jsonb_set(raw_user_meta_data, '{email}', ${literal(`"${row.email}"`)}::jsonb)
                 else raw_user_meta_data end
         where id = ${literal(row.id)};

         update auth.identities
           set identity_data = case
                 when identity_data ? 'email'
                 then jsonb_set(identity_data, '{email}', ${literal(`"${row.email}"`)}::jsonb)
                 else identity_data end
         where user_id = ${literal(row.id)};`,
      );
    }

    const live = await sql<{ n: string }>(
      ref,
      `select count(*)::text as n from auth.users
       where email is not null and email not like ${literal(`%@${DOMAIN}`)}`,
    );
    console.log(`\nDone. ${live[0]?.n ?? 0} addresses on ${ref} can now receive email.`);
    return;
  }

  const accounts = await sql<Account>(ref, "select id, email from auth.users order by email");
  const rewrite = accounts.filter(
    (account) =>
      account.email &&
      !keep.has(account.email.toLowerCase()) &&
      !account.email.toLowerCase().endsWith(`@${DOMAIN}`),
  );
  const kept = accounts.filter((account) => account.email && keep.has(account.email.toLowerCase()));

  console.log(`Database : ${ref} (${siteUrl})`);
  console.log(`Mode     : ${commit ? "COMMIT" : "dry run"}\n`);
  console.log(`  keeping ${kept.length}:`);
  for (const account of kept) console.log(`    ${account.email}`);
  console.log(`\n  rewriting ${rewrite.length} to @${DOMAIN}`);
  const missing = [...keep].filter(
    (address) => !accounts.some((account) => account.email?.toLowerCase() === address),
  );
  for (const address of missing) console.log(`  ! --keep ${address} matches no account here`);

  if (!commit) {
    console.log("\nDry run. Nothing was written. Re-run with --commit to rewrite.");
    return;
  }

  for (const account of rewrite) {
    // Local part kept and id appended, so a row stays recognisable but undeliverable.
    const local = account.email!.split("@")[0].replace(/[^a-zA-Z0-9._-]/g, "");
    const replacement = `${local}+${account.id.slice(0, 8)}@${DOMAIN}`;
    await sql(
      ref,
      `update auth.users
         set email = ${literal(replacement)},
             email_change = '',
             raw_user_meta_data = case
               when raw_user_meta_data ? 'email'
               then jsonb_set(raw_user_meta_data, '{email}', ${literal(`"${replacement}"`)}::jsonb)
               else raw_user_meta_data end
       where id = ${literal(account.id)};

       update auth.identities
         set identity_data = case
               when identity_data ? 'email'
               then jsonb_set(identity_data, '{email}', ${literal(`"${replacement}"`)}::jsonb)
               else identity_data end
       where user_id = ${literal(account.id)};`,
    );
  }

  const left = await sql<{ n: string }>(
    ref,
    `select count(*)::text as n from auth.users
     where email is not null and email not like ${literal(`%@${DOMAIN}`)}`,
  );
  console.log(`\nDone. ${rewrite.length} rewritten; ${left[0]?.n ?? 0} real addresses remain.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
