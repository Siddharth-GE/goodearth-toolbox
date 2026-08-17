# Switching the toolbox onto the new database

## What this is, in plain words

The toolbox has been running on one database — the same one it was built
and practised in. It has your real Saarang plots and clients in it, and
also 21 practice designs, 12 pretend purchase orders and a few hundred
rows of me testing things.

I have built a **second, clean database** and put only the real things
into it. Nothing was deleted from the old one.

This page switches the website over to the new database. After it, the
old database becomes the practice one ("staging"), and nobody's real work
ever touches it again.

**Right now the website is still on the old database.** It stays that way
until you finish step 12.

**Do this before you tell any staff to start using the toolbox.** One
step signs everybody out. If you do it now, the only person who notices
is you.

**Time: about 40 minutes.** Most of it is waiting for the website to
rebuild.

---

## Two names you will keep seeing

Supabase gives every database a 20-letter code. You will be copying these
around, so here they are once:

| Which one                                | Its code               | Where you'll find it in Supabase               |
| ---------------------------------------- | ---------------------- | ---------------------------------------------- |
| **The new one** (real work, from now on) | `pajfrgnkapicdgangjey` | the project called `goodearth-toolbox`         |
| **The old one** (becomes practice)       | `ipstebqawrvhkyntctrv` | the project called `goodearth-toolbox-staging` |

I renamed them so the names tell you which is which. If you open the
wrong one you will see the wrong data, so check the name at the top of
the page each time.

---

## Before you start — three things to have ready

You will need to paste these in. Get them out now so you are not hunting
mid-way.

1. **Your Resend API key.** Resend is what sends the sign-in code emails.
   Log in at resend.com → API Keys. It starts with `re_`.
   _If you cannot find it, create a new one — old ones keep working._

2. **Your Google sign-in client ID and secret.** These are in the **old**
   Supabase project: open it → Authentication → Sign In / Providers →
   Google. Copy both values somewhere.

3. **Access to Google Cloud Console** (console.cloud.google.com), signed
   in as whoever set up Google sign-in.

---

# Part 1 — Set up email on the new database

Without this, the new database cannot send sign-in codes, and nobody can
log in.

**Step 1.** Open Supabase and go into the project named
**`goodearth-toolbox`** (the new one — check the name).

**Step 2.** In the left menu: **Authentication** → **Emails** → the
**SMTP Settings** tab.

**Step 3.** Turn on **Enable Custom SMTP**, and fill in exactly this:

| Box          | What to type                  |
| ------------ | ----------------------------- |
| Sender email | `toolbox@goodearthkannur.org` |
| Sender name  | `Goodearth Toolbox`           |
| Host         | `smtp.resend.com`             |
| Port number  | `465`                         |
| Username     | `resend`                      |
| Password     | your Resend API key           |

**Step 4.** Save.

> **Why I couldn't do this for you:** Supabase would only show me a
> scrambled version of the password, not the real one. If I had copied
> what it gave me, email would have looked configured and quietly failed
> — and the first you'd know is nobody being able to log in.

**Step 5.** Still in Authentication, find **Rate Limits** → set **Emails
per hour** to **200**, and save.

_(This setting refuses to be changed until step 3 is done, which is why
it's separate.)_

---

# Part 2 — Set up Google sign-in on the new database

**Step 6.** Same project → **Authentication** → **Sign In / Providers** →
**Google**. Turn it on, paste in the client ID and secret you copied
earlier, and save.

**Step 7.** Now go to **console.cloud.google.com** → **APIs & Services**
→ **Credentials** → click your OAuth client.

**Step 8.** Under **Authorised redirect URIs**, click **Add URI** and
paste exactly this:

```
https://pajfrgnkapicdgangjey.supabase.co/auth/v1/callback
```

Save. It can take a few minutes for Google to apply it.

> **Do not skip this one.** Nothing warns you if it's missing. Everything
> looks fine until a colleague clicks "Sign in with Google" and gets an
> error page.

---

# Part 3 — Switch the website over

This is the actual switch.

**Step 9.** Go to **vercel.com** → your `goodearth-toolbox` project →
**Settings** → **Environment Variables**.

You will see a list of names and hidden values. These tell the website
which database to talk to. You are changing three of them, and **only
the ones marked Production**.

**Step 10.** First, collect the two new keys: back in Supabase, in the
**new** project → **Project Settings** → **API Keys**. You want the one
called **anon** / **publishable**, and the one called **service_role** /
**secret**.

**Step 11.** In Vercel, edit these three (click each one, change the
value, save). Make sure the **Production** tick is on and Preview /
Development are **not**:

| Name                            | Change it to                               |
| ------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://pajfrgnkapicdgangjey.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **anon** key you just copied           |
| `SUPABASE_SERVICE_ROLE_KEY`     | the **service_role** key you just copied   |

**Leave everything else alone.** In particular don't touch `SITE_URL`,
`AUTH_COOKIE_SECRET` or `MARATHON_SESSION_SECRET` — leaving those as they
are means the marathon kiosk keeps working.

**Step 12.** Go to the **Deployments** tab → the top one (the live one) →
the **…** menu → **Redeploy**.

Changing a setting does nothing until the site is rebuilt. Wait for it to
finish — a couple of minutes.

> **Everyone gets signed out once, here.** Their old login belongs to the
> old database. They sign in again with **the same password as before**,
> plus one emailed code. Nobody needs a new password — I copied those
> across.

---

# Part 4 — Check it actually worked

Do these in order. Each one checks something the one before it didn't.
**Use a private/incognito window** so you're not relying on an old login.

**Step 13.** Go to `toolbox.goodearthkannur.org` and sign in as yourself,
with **your existing password**. You should get an emailed code. _(If no
email arrives, Part 1 didn't take.)_

**Step 14.** Open **Purchase Orders**. It should be **empty**, and
starting a new one should offer number **0001**.

> This is the clearest single test. **If it offers 0013, the switch
> didn't take** — the site is still reading the old database. Go back to
> step 11 and check the Production tick.

**Step 15.** Open **Saarang**. You should see 43 plots, your clients, and
the payment schedule.

**Step 16.** Open the **item catalogue** and check the little product
pictures appear. _(I moved 897 of them; this proves they arrived.)_

**Step 17.** Press one real save/submit button somewhere. Any one. It
just has to actually write something.

**Step 18.** Sign in as **one ordinary member of staff** — private
window, their existing password.

> Please don't skip this. You are an admin, so you can see everything and
> would never notice a permissions problem. This is the only test that
> would catch one.

**Step 19.** Try **Sign in with Google** once. It's the only way to know
step 8 worked.

---

## If something goes wrong

**Undo is easy and safe.** Go back to step 11, put the three old values
back (Vercel keeps a history of previous values), and redeploy.

The old database has not been touched. Nothing anywhere has been deleted.

---

# Part 5 — Set up the practice site

**Only do this once Part 4 has fully passed.** Until the new database is
proven, the old one is your safety net — and a safety net nobody can log
into is not a safety net.

> **You do not need a Custom Environment.** Leave that section empty.
> Vercel's built-in **Preview** environment already has everything the
> practice site needs, and the practice site is just a fixed web address
> pointing at one branch's preview. Fewer moving parts, same result.

**Step 20 — check the Preview settings point at the old database.**

Vercel → **Settings** → **Environment Variables**. Find each of these and
look at the value marked **Preview** (not Production):

| Name                            | Should be                                  |
| ------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | `https://ipstebqawrvhkyntctrv.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the **old** project's anon key             |
| `SUPABASE_SERVICE_ROLE_KEY`     | the **old** project's service_role key     |

**These are probably already right and need no change.** They pointed at
the old project before any of this started, and the old project is now
the practice one — the swap did this step for free. You are confirming,
not editing.

> **This is what fixes the original problem.** Every test link I send you
> reads the practice database, so building something new can never write
> into real work.

If any of them still shows `pajfrgnkapicdgangjey` (the new one) under
Preview, change it to the old one.

**Step 21 — give the practice site its address.**

Vercel → **Settings** → **Domains** → **Add Domain** →
`staging.goodearthkannur.org`.

After adding it, Vercel shows options for that domain. Choose to attach
it to a **git branch**, and type `staging` in the branch box. It is a
free-text field — Vercel does not offer a dropdown of branches, which is
why you couldn't find one. The branch exists; I pushed it earlier.

Vercel will then show you a **DNS record** to add (a CNAME) wherever
goodearthkannur.org is managed. Add it, and wait a few minutes for the
tick.

_There is nothing else to configure. The `staging` branch deploys as a
preview, so it already uses the Preview variables you just checked._

**Step 22 — give the practice site its own cookie key.**

Environment Variables again. Look at **`AUTH_COOKIE_SECRET`**: if the
**Preview** value is the same as the **Production** value, replace the
Preview one with any long random string.

> **Why it matters:** that key signs the "trust this browser for 30 days"
> cookie. If both sites sign with the same key, a browser trusted on the
> practice site is also trusted on the real one — meaning the emailed
> code could be skipped on production. Only you and the test account can
> sign in to the practice site, so the exposure is small, but the fix
> costs nothing.

Do the same for `MARATHON_SESSION_SECRET` if Preview shares Production's.

**Step 23 — tell the old database its new address.**

In the **old** Supabase project (`goodearth-toolbox-staging`) →
Authentication → URL Configuration: set the Site URL to
`https://staging.goodearthkannur.org`, and add these two to the redirect
list:

```
https://staging.goodearthkannur.org/**
https://*-goodearth-toolbox*.vercel.app/**
```

_(That second line has never been right — it's why test links sometimes
misbehaved on sign-in.)_

**Step 24.** Tell me when steps 20–23 are done, and I'll run one command
that scrambles the staff email addresses on the practice database.

> **Why:** the practice database still has all 49 real email addresses
> and a working email setup. A half-finished feature could email a real
> colleague something that looks official. Afterwards only your address
> and the test account work there.
>
> **The cost:** you won't be able to log in as a specific colleague on
> the practice site to reproduce a problem they report.

**Step 25.** In Vercel → **Settings** → **Deployment Protection**, turn
**Vercel Authentication** back on. It's been off since the sign-in
testing. The practice site has every real client name in it.

---

# Part 6 — Tidy up afterwards

- **Delete the file `data/staff-passwords-2026-08-14.csv`** from your
  computer. It has 45 starting passwords in plain text and it's the
  oldest thing on my list. Once step 18 works, it has no purpose.
- **Delete `vercel-env-values.txt`** if it's still lying around.
- **Reset Ravi's and yema's marathon PINs** — both are still on `1234`.
  `/marathon/admin` → Members → Reset PIN. Not urgent: they only exist on
  the practice database now.
- **Add one real supplier and one real store** in Masters. I didn't carry
  the test ones over, and Purchase Orders and Inventory each need one
  before first use.
- **Document numbers:** if you already number purchase orders or bills on
  paper, tell me what the last number was and I'll set the app to carry
  on from there. **This has to happen before the first real one, not
  after.** If you don't number them anywhere today, ignore this — the app
  starts at 1.

---

## The one thing still not solved

**There are no backups.** The free Supabase plan doesn't include them —
no nightly copy, no way to rewind. From the day staff start entering real
work, a bad deletion cannot be undone.

You said decide later, which is fair, so I haven't built anything. Two
ways out when you want it: pay for the Supabase Pro plan (about $25 a
month, backups included and nothing to remember), or I write a script
that exports everything nightly.

I'll keep bringing this up.

---

<details>
<summary>For reference — what I already did, so you don't have to</summary>

- Created the new database and applied all 70 migrations to it.
- Compared both databases across 4,304 things (tables, columns, security
  rules, permissions, functions) — identical.
- Copied 3,628 rows: 49 people with their existing passwords, 3 projects,
  43 plots and units, 35 clients and 387 payment milestones, the
  2,634-item catalogue, Relay's departments and templates.
- Copied 898 images and checked each arrived undamaged.
- Left behind: every practice design, budget, indent, purchase order,
  bill and receipt; the marathon data; the audit log; and all the
  document counters — which is why numbering restarts at 1.
- Turned off public sign-ups on the new database and set its web address
  and login rules.
- Found and fixed three things that existed on the old database but in no
  migration, so the new one was missing them: an automatic security rule,
  the image storage area, and a test marathon login whose PIN is
  published in the code repository.

</details>
