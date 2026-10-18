# The Android app

Kaadal Toolbox on Google Play, `com.kaadalgroup.toolbox`, under the founder's Organization developer account. A public listing: anyone may install it; only people with a Toolbox account can sign in.

## How it works

It is a **Trusted Web Activity**: a thin Android shell that opens `https://toolbox.kaadalgroup.com` full-screen in the phone's Chrome. Every screen, sign-in and fix is the website's, so **a website deploy reaches the app at once, with no Play release**. A new Play version is needed only to change the name, icon, colours, domain or Android target.

- **The website's half** (on the branch that serves the domain): `app/manifest.ts`, the icons in `public/`, `public/.well-known/assetlinks.json` and the public `/privacy` page. Each is an exact `PUBLIC_PATHS` entry in `lib/supabase/proxy.ts`, because Chrome, Play and Google's link check fetch them with no session.
- **`assetlinks.json` is what hides the address bar.** It names the package and the SHA-256 of every key the installed app can be signed with: the upload key (side-loaded test builds) and **Google's app signing key** (every install from Play). A missing or wrong fingerprint does not break the app; it shows Chrome's address bar on top.
- **The Android half** is built by Bubblewrap from `android/twa-manifest.json`; everything else in `android/` is generated and ignored.
- **Sign-in inside the app** is the website's: password then the emailed code (switch to the mail app and back), or Google, which opens Google's page in a Chrome tab and returns.
- No notifications, no permissions beyond Chrome's own; a picture is attached through the phone's normal file picker.

## The keys

- **Upload key:** `C:\Users\goodearth\Documents\kaadal-android-signing\upload.keystore`, its password in the `README.txt` beside it. Never in the repo. Losing it is recoverable (Play Console → Test and release → App integrity → request an upload key reset), but slow. The founder keeps a backup.
- **App signing key:** held by Google (Play App Signing). Its SHA-256 is on Play Console → App integrity → App signing, and goes into `assetlinks.json` and `twa-manifest.json`'s `fingerprints`.

## Building a new version

On this PC, Bubblewrap 1.25.0 is installed pinned in `C:\Users\goodearth\.bubblewrap-tool` (with core and validator pinned by `overrides`), with Java 17 and the Android SDK under `C:\Users\goodearth\.bubblewrap` (`config.json` there names them).

1. Raise `appVersionCode` (+1, every upload) and `appVersionName` in `twa-manifest.json`; commit.
2. In `android/`: `bubblewrap update --skipVersionUpgrade`, then `bubblewrap build`, with `BUBBLEWRAP_KEYSTORE_PASSWORD` and `BUBBLEWRAP_KEY_PASSWORD` set from the README.
3. Two traps on this machine, both from the shell, not the project: `NoDefaultCurrentDirectoryInExePath` must be unset (or `gradlew.bat` is "not recognized"), and the JDK's `bin` must be on `PATH` (or `jarsigner` is). The `jarsigner` error line prints the password: never keep the log.
4. Upload `app-release-bundle.aab` in Play Console.

`update` fetches the icons and the web manifest from the live domain. Version 1 was generated from a local copy of the same files, before the domain served them.

## Play Console answers

Drafted for the founder; the founder submits them.

- **App access:** all functionality is behind sign-in. Reviewers get a dedicated Gmail account, added as staff in Settings with one grant that shows no personal or money data, signing in with **"Sign in with Google"**. Google stands in for the emailed code, so nothing is weakened. That Gmail account has 2-Step Verification off, and the Console notes say: "Tap Sign in with Google and use the account below."
- **Ads:** no. **Government app, financial features, health, news:** no. **Target audience:** 18 and over. **Category:** Business.
- **Content rating** (IARC, "All other app types"): no violence, sexuality, language, drugs or gambling. Users interact (staff share work records): yes. Shares location: no. Digital purchases: no.
- **Data safety:**
  - Collected: name, email address, user IDs, phone number, photos, files and docs, other user-generated content (work records), crash logs and diagnostics.
  - Every one is for app functionality and account management; none is shared with third parties (service providers are not sharing); none is optional except photos.
  - Encrypted in transit: yes.
  - Accounts: users cannot create one in the app; they sign in with accounts the company creates. Deletion requests go to admin@kaadal.co.in.
- **Privacy policy:** `https://toolbox.kaadalgroup.com/privacy`. **Website:** `https://toolbox.kaadalgroup.com`. **Contact email:** admin@kaadal.co.in.

### Store listing

- **Name:** Kaadal Toolbox
- **Short description:** The work app for Kaadal staff: purchasing, stores, sites, design and clients.
- **Full description:**

  > Kaadal Toolbox is the internal work app of Kaadal and Goodearth, the design-led real estate company in Kannur, Kerala.
  >
  > Our staff use it every day to raise indents and purchase orders, receive goods and keep stock, follow work on site, manage designs and drawings, keep track of clients, and see how every project is moving.
  >
  > You need a Toolbox account from the company to sign in. Each person sees only the tools they have been given.

- **Graphics:** the 512 px icon and the 1024×500 feature graphic were generated from the Kaadal K (`C:\Users\goodearth\Documents\kaadal-android-release`). At least two phone screenshots: taken on a phone, from screens with no client names, phone numbers or money.

## Launch steps

- [x] [Opus] The website's half on `feature/android-app`: manifest, icons, `/privacy`, `assetlinks.json` (upload key only), public paths.
- [x] [Opus] Java 17, Android SDK and Bubblewrap on this PC; the upload key; version 1 built and signed (`kaadal-toolbox-1.0.0.aab`).
- [ ] [Founder] Vet on staging: `/privacy` reads right, and Chrome on a phone offers "Install app" with the K icon.
- [ ] [Fable] Approval pass over the public-path change before the merge, or the founder waives it.
- [ ] [Founder] Play Console: create the app (Kaadal Toolbox, App, Free), fill in the answers above, make the reviewer account, upload the `.aab` to **Internal testing** first and install it on a phone.
- [ ] [Opus] Add Google's app-signing fingerprint (App integrity page) to `assetlinks.json` and `twa-manifest.json`; deploy. The address bar then disappears without a new upload.
- [ ] [Founder] Promote the release to **Production**; Google's review usually takes from a few days to a week.
