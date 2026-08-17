# Cutover — switching production onto the fresh database

**Status: the new database is built, filled and verified. It is not live.**
`toolbox.goodearthkannur.org` still reads the old one until step 3 below.

Everything here needs a browser and a person. Do it in order, in one
sitting, **before onboarding anybody** — step 3 signs everyone out once,
and the only person who should notice is you.

|                             | Supabase ref           |
| --------------------------- | ---------------------- |
| `goodearth-toolbox`         | `pajfrgnkapicdgangjey` |
| `goodearth-toolbox-staging` | `ipstebqawrvhkyntctrv` |

Roughly 40 minutes, most of it waiting for deployments.

---

## Already done, for reference

- New project created, all 70 migrations applied, schema proved identical to the old one across 4,304 objects.
- 3,628 rows copied: 49 people **with their existing passwords**, 3 projects, 43 plots and units, 35 clients and their 387 payment milestones, the 2,634-item catalogue, Relay's templates.
- 898 storage files copied and verified byte-identical; every `thumb_url` rewritten.
- Sign-ups disabled, `site_url` and the redirect allow-list set, OTP expiry 10 minutes.
- No counters, so numbering starts at 1. No Marathon, no test trails, no practice transactions.

---

## 1. Two secrets I could not copy (10 min)

The management API returns the SMTP password and Google secret as 64-character hashes, not the real values — a Resend key starts `re_`, a Google secret `GOCSPX-`. Copying what it gave me would have configured production with garbage that fails silently at the worst moment: **no sign-in codes**.

In the **new** project (`pajfrgnkapicdgangjey`):

**a. Email —** Authentication → Emails → SMTP Settings → enable, and enter:

|              |                               |
| ------------ | ----------------------------- |
| Host         | `smtp.resend.com`             |
| Port         | `465`                         |
| Username     | `resend`                      |
| Password     | your Resend API key           |
| Sender email | `toolbox@goodearthkannur.org` |
| Sender name  | `Goodearth Toolbox`           |

Then Authentication → Rate Limits → **emails per hour: 200**. (It refuses this setting until SMTP exists, which is why it is not already done.)

**Until this is set, the project uses Supabase's default sender, which allows a handful of emails per hour.** Enough for you to test with, nowhere near enough for 49 people.

**b. Google sign-in —** Authentication → Providers → Google → enable, and paste the same client ID and secret the old project uses. Then, in **Google Cloud Console**, add this to the OAuth client's Authorised redirect URIs:

```
https://pajfrgnkapicdgangjey.supabase.co/auth/v1/callback
```

**This is the one step that fails invisibly.** Nothing warns you; the first sign of trouble is a colleague clicking "Sign in with Google" and getting an error page.

---

## 2. Check it before pointing anything at it (5 min)

Still in the new project: Authentication → Users → find yourself → **Send magic link** (or just wait for step 4). The point is only to confirm an email actually leaves and arrives from the new sender.

---

## 3. Point production at it (10 min)

Vercel → the project → Settings → Environment Variables → **Production** scope only:

| Variable                        | New value                                  |
| ------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://pajfrgnkapicdgangjey.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the new project's anon key                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | the new project's service_role key         |

Both keys: Supabase → Project Settings → API Keys.

Leave `SITE_URL`, `AUTH_COOKIE_SECRET` and `MARATHON_SESSION_SECRET` alone — unchanged means nobody is signed out of the Marathon kiosk.

Then **Deployments → the latest production deployment → Redeploy.** Environment variables only apply to a new build.

**Everyone gets signed out once.** Sessions are signed by the old project's key and stop being valid the moment this takes effect. Staff sign in again with the same password plus one emailed code, because the trusted-device record did not come across. This is why you do it before onboarding anyone.

---

## 4. Prove it, in a private window (10 min)

In order, because each one tests something the previous did not:

1. **Sign in as yourself** at `toolbox.goodearthkannur.org` — your **existing** password, then the emailed code. The email must arrive.
2. **Open Purchase Orders.** It should be **empty**, and starting a new one should offer **0001**. If it offers 0013, the variables did not take — the site is still on the old database.
3. **Open Saarang.** 43 plots, its clients, its payment schedule. Open the item catalogue and confirm **thumbnails load** (this is what step 5 of the build was for).
4. **Press one real write button** — the rule after any change to actions or policies.
5. **Sign in as one ordinary member of staff**, private window, their existing password. This is the check that proves nothing needs redistributing. Do not skip it: you are an admin and admins never see grant bugs.
6. **Try Google sign-in** once. It is the only proof the callback URL is right.

If any of this fails, **the rollback is to put the three old values back and redeploy.** The old database has not been touched and is still complete. Nothing has been deleted anywhere.

---

## 5. Only once step 4 passed (10 min)

Not before — until production is proven, the old database is still what you fall back to, and a database nobody can sign in to is not a fallback.

**a. Give staging its own address.** Vercel → Settings → Domains → add `staging.goodearthkannur.org`, bound to a `staging` branch environment. One DNS record. Set its variables to the **old** project's URL and keys, `SITE_URL=https://staging.goodearthkannur.org`, and **fresh** values for `AUTH_COOKIE_SECRET` and `MARATHON_SESSION_SECRET` — different from production's, so rotating one never touches the other.

**b. Point every preview at staging.** Same page, **Preview** scope: set the three Supabase variables to the **old** project. This is the step that closes the original hole — after it, building a feature can no longer write to real work.

**c. In the staging Supabase project**, set `site_url` to `https://staging.goodearthkannur.org` and add to the allow-list:

```
https://staging.goodearthkannur.org/**
https://*-goodearth-toolbox*.vercel.app/**
```

That second line has never been right: the current list only covers the bare `goodearth-toolbox.vercel.app`, which never matched a branch preview's hostname.

**d. Then, and only then, scramble staging's emails:**

```
npx tsx scripts/scramble-staging-emails.ts --project ipstebqawrvhkyntctrv \
  --keep siddharth.cyriac.99@gmail.com,siddharth.cyriac.99+probe@gmail.com --commit
```

It refuses to run until step (c) is done — it checks that the database has been told it is staging. Afterwards, staging can never email a real colleague. The cost: you can no longer sign in as a specific colleague there to reproduce their problem.

**e. Turn Deployment Protection back on** (Settings → Deployment Protection → Vercel Authentication). Open since the auth tests. Staging holds every real client name and amount.

---

## 6. Housekeeping the cutover earns

- **Delete `data/staff-passwords-2026-08-14.csv`** — 45 plaintext starting passwords on your machine, the oldest open item on `TODO.md`. Once step 4.5 has passed, the file has no remaining purpose.
- **Delete `vercel-env-values.txt`** if it still exists.
- **Set the document counters**, but only where a real series already runs on paper. `po_counters`, `bill_counters`, `indent_counters`, `grn_counters`, `iss_counters` are `(project_id, scope, last_no)` rows; setting `last_no` to the last number used makes the app continue that series instead of colliding with it. Tell me the numbers and I will apply them. **Before the first real document, not after.**
- **Reset Ravi's and yema's Marathon PINs** on staging — confirmed on 1234 (`TODO.md` §4). Not urgent any more: no Marathon agent exists on production.
- **Enter one real vendor and one real store** in Masters. Neither came across, and Purchase Orders and Inventory need one each before first use.

---

## What is still not handled

**Backups. Production has none at all** — free tier, by your decision on 17 Aug. From today a bad delete or a bad migration has no undo. `TODO.md` §0 has the two ways out. This is the largest remaining risk in the setup and it is the thing I will keep raising.
