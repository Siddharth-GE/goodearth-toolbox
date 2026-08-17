/**
 * Rewrites every staff email address on the staging database to an
 * unroutable one, so staging can never email a real member of staff.
 *
 *   npx tsx scripts/scramble-staging-emails.ts --project <ref> --keep a@b,c@d
 *       # dry run — lists who would be rewritten and who would be kept
 *
 *   npx tsx scripts/scramble-staging-emails.ts --project <ref> --keep a@b --commit
 *
 *   npx tsx scripts/scramble-staging-emails.ts --project <ref> \
 *       --restore a@b,c@d --from <production-ref> [--commit]
 *       # puts real addresses BACK for named people, so they can sign in
 *       # to staging and test. Reads each real address from production by
 *       # account id rather than guessing at spellings.
 *
 * WHY THIS EXISTS. When the databases swapped roles on 17 Aug 2026, the
 * old one kept a full copy of everything, including 49 real accounts with
 * 49 real company email addresses — and a working Resend SMTP
 * configuration. Staging is where half-built features run. A half-built
 * feature that sends email, or a stray password reset while testing the
 * sign-in flow, would put a genuine-looking "Goodearth Toolbox" message in
 * a real colleague's inbox, from a system that is not the real one.
 *
 * WHAT IT COSTS. You can no longer sign in to staging as a specific
 * colleague to reproduce something they reported: their address cannot
 * receive the 6-digit code any more. That was the accepted trade.
 *
 * RUN IT AFTER THE CUTOVER IS CONFIRMED, NEVER BEFORE. Until production
 * is proven on the new database, the old one is still the thing you fall
 * back to — and an old database nobody can sign in to is not a fallback.
 * The guard below enforces the ordering: it refuses to touch a database
 * whose site_url does not say "staging", so the database has to have been
 * told what it is first.
 *
 * WHAT IT CHANGES. auth.users.email, the email inside raw_user_meta_data,
 * and the email inside auth.identities.identity_data — which is what
 * Google and password sign-in actually match on. auth.identities.email is
 * a generated column and follows by itself. Nothing in `public` changes:
 * profiles carries names, not addresses.
 *
 * SAFE TO RUN TWICE: an address already at @staging.invalid is skipped.
 */
import { isCommit, literal, requireProjectRef, sql } from "./supabase-management";

/** Unroutable by construction — .invalid can never be registered (RFC 2606). */
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

  // ---- the guard ------------------------------------------------------
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

  // ---- putting addresses back -----------------------------------------
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

    // The real addresses come from production, matched on account id —
    // the ids are identical on both databases because the copy preserved
    // them. Reconstructing an address from the scrambled local part would
    // be guessing at a domain.
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
    // The local part is kept and the id appended, so a row is still
    // recognisable as "Priya's account" while being undeliverable.
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
