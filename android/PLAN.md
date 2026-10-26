# The Android app on Google Play

Kaadal Toolbox on Google Play, `com.kaadalgroup.toolbox`, under the founder's Organization developer account. A public listing: anyone may install it; only people with a Toolbox account can sign in. This file is the Play side — the keys, the Console answers, the launch. The app itself, and how to build it, is `mobile/PLAN.md`.

**Live on Google Play since 2026-10-26**, approved on the first submission. The app on Play is the Capacitor app from version 2.3.0 (code 5), the first upload. The Trusted Web Activity wrapper planned before it was never uploaded; its leftovers (`android/twa-manifest.json`, `public/.well-known/assetlinks.json`) do nothing for the Capacitor app.

## The keys

Everything for the phone apps that must stay off GitHub sits beside the main folder, never inside it, in `C:\Users\goodearth\Documents\Code\kaadal-toolbox\`: `android-signing` holds the keys, `android-release` the built apps and store graphics.

- **Upload key:** `android-signing\upload.keystore`, its password in the `README.txt` beside it. Never in the repo. Losing it is recoverable (Play Console → Test and release → App integrity → request an upload key reset), but slow. The founder keeps a backup.
- **Firebase** (push, project `kaadal-toolbox` under `admin@kaadal.co.in`): `android-signing\google-services.json`, and the service-account key `kaadal-toolbox-firebase-adminsdk-*.json`, which is a password and lives only there and in Vercel's settings.
- **App signing key:** held by Google (Play App Signing), created with the first upload (2026-10-20). SHA-1 `38:F6:C0:DE:1A:4F:07:02:C5:40:CF:CE:A8:AF:49:BA:1C:50:24:F1`, SHA-256 `AE:84:3D:DF:0B:2A:BF:11:E9:CA:48:64:49:4A:B1:C4:CB:F6:5C:26:D4:A1:A1:A8:6A:48:13:26:8B:0D:B5:36`. Play Console hides its page; App bundle explorer → Downloads → the signed universal APK, read with `apksigner verify --print-certs`, gives them. The upload key's SHA-1 is `6E:CA:0C:A9:A4:1F:12:E8:60:5A:CE:D6:CA:0D:45:69:A5:E0:1E:A5`. Both SHA-1s are on the Firebase Android API key's restriction in Google Cloud (key ending `f5ik`), or a Play install gets no notifications.

## Play Console answers

Drafted for the founder; the founder submits them. If the app starts collecting something new, this list and the public `/privacy` page change together, or Play's review rejects the mismatch.

- **App access:** all functionality is behind sign-in. The reviewer account is `tester@kaadal.co.in` (Google Workspace, 2-Step Verification off), in Toolbox as "Play Store reviewer", staff (never admin), with **every tool**: Play will not save the declaration without "full access" ticked, so the founder made it true. The account is **switched off** in Settings except while a version is in review, so no live login sits idle; after each review, check what it created or changed. It signs in with **Continue with Google**, which stands in for the emailed code. Console notes: "Tap 'Continue with Google' and sign in with this Google account; Google sign-in needs no code. Accounts are created by the company; there is no sign-up. Fingerprint sign-in is optional and can be skipped. Each staff member sees only the tools the company has given them; this account has a representative set. There is no paid or premium content."
- **Ads:** no. **Advertising ID:** no. **Government app, financial features, health, news:** no. **Target audience:** 18 and over. **Category:** Business.
- **Content rating** (IARC, "All other app types"): no violence, sexuality, language, drugs or gambling. Users interact (staff share work records): yes. Shares location: no. Digital purchases: no.
- **Data safety:**
  - Collected: name, email address, user IDs, address (vendors', guests'), phone number, other info (dates of birth, emergency contacts, guests' ID documents), health info (the directory's blood group), photos, files and docs, other user-generated content (work records), crash logs and diagnostics, and device or other IDs (the phone's notification address).
  - Every one is collected, not shared, not processed ephemerally; for app functionality, the account items (name, email, user IDs, phone) for account management too; none is shared with third parties (service providers are not sharing); none is optional except photos.
  - Not declared, because not collected: messages (add it, and a line on `/privacy`, the day in-app chat ships), fingerprint and face (they never leave the phone).
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

- **Graphics:** the 512 px icon and the 1024×500 feature graphic, from the Kaadal K (`android-release`). At least two phone screenshots: taken on a phone, from screens with no client names, phone numbers or money.

## Launch steps

- [x] [Founder] Play Console: the app created, 2.3.0 on **Internal testing**, installed from Play and vetted (2026-10-20).
- [x] [Founder] The reviewer Google account; [Opus, at the founder's word] its Toolbox account (2026-10-21).
- [x] [Founder] App content, Store settings and the main store listing, from the answers above.
- [x] [Founder] Production: India, 2.3.0 from the library, sent for review 2026-10-21, approved and published 2026-10-26.
- [x] [Opus] What `tester@kaadal.co.in` created or changed (2026-10-26): nothing left behind. Google's reviewer never signed in; the account's one write, a draft selection from the founder's own test, was already deleted.
- [ ] [Founder] Switch the reviewer account off (Settings → People → Deactivate).
- [ ] [Founder] Share `https://play.google.com/store/apps/details?id=com.kaadalgroup.toolbox` with staff. Internal testers get it as an update.

## Updates

- **Managed publishing is on:** an approved update waits under Publishing overview → Changes ready to publish until the founder presses Publish.
- **Internal testers see the listing marked as a test version.** Leaving through the internal testing opt-in link shows them the public one.
