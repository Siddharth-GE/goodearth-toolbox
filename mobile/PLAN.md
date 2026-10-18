# The phone app

Kaadal Toolbox for Android (and later iPhone), `com.kaadalgroup.toolbox`: a **Capacitor 8** shell that opens `https://toolbox.kaadalgroup.com` in the app's own web view. Every screen is the website's, so **a website deploy reaches the app at once**; a new store version is needed only for the shell itself (name, icon, native features, Android target). It replaces the Play wrapper (`android/PLAN.md`) as an ordinary update: same package, same upload key, version code 2 on.

## How it works

- **`mobile/` is its own project** with its own `package.json`; the website's dependencies are untouched, and lint, typecheck and Prettier skip it. `mobile/android/` is committed; Gradle output and what `cap sync` copies in are ignored.
- **`capacitor.config.json`** names the site. `www/index.html` is the **"No connection" screen**, shown in place of a blank page whenever the site can't be reached (`server.errorPath`).
- **The site is never told it is in an app**, except through the user agent's `KaadalToolboxApp` suffix, kept for the Google sign-in step (A4 in `plan.md`).
- **Spacing:** the web view sits between the status bar and the navigation bar (`SystemBars.insetsHandling: "native"`), on burgundy with light icons, so the site needs no safe-area CSS.
- **Back button:** `@capacitor/app` steps back through the site's history, and leaves the app from the first page.
- **Prints and exports** (`lib/pdf/`, `lib/csv.ts`): a web view can't show a PDF, so `MainActivity` hands every download to Android's DownloadManager with the session's cookies, then opens it in the phone's PDF viewer or spreadsheet app. Files live in the app's own storage (no permission asked); the same print downloaded again replaces the old copy.
- **Links to other sites** (Zoho WorkDrive, product pages) open in the phone's browser.
- **Pictures** go through the phone's normal picker, as on the website.

## What doesn't work yet

- **Sign in with Google.** Google refuses sign-in inside an app's web view: the button opens Chrome, and the sign-in finishes there, not in the app. Password and the emailed code work. Fixing it is A4 in `plan.md` (a `[Fable]` step), and Play's reviewer signs in with Google, so A4 lands before this version goes to Play's Production track.

## Building a new version

On this PC: **Java 21** in `C:\Users\goodearth\.bubblewrap\jdk\jdk-21.0.12.1+1` (Capacitor 8 needs 21; the wrapper's Java 17 sits beside it), and the Android SDK in `C:\Users\goodearth\.bubblewrap\android_sdk`, named in the ignored `mobile/android/local.properties` (`sdk.dir=C\:/Users/goodearth/.bubblewrap/android_sdk`).

1. Raise `versionCode` (+1, every upload) and `versionName` in `mobile/android/app/build.gradle`; commit.
2. In `mobile/`: `npm install`, then `npm run sync`.
3. In PowerShell: unset `NoDefaultCurrentDirectoryInExePath`, set `JAVA_HOME` to the Java 21 folder and put its `bin` first on `PATH`, and set `KAADAL_UPLOAD_KEYSTORE` (the upload key's path), `KAADAL_UPLOAD_STORE_PASSWORD` and `KAADAL_UPLOAD_KEY_PASSWORD` (both from the `README.txt` beside the key, `android/PLAN.md`). Without them the build is unsigned.
4. In `mobile/android/`: `.\gradlew.bat bundleRelease assembleRelease`.
5. Upload `app/build/outputs/bundle/release/app-release.aab` in Play Console; `app/build/outputs/apk/release/app-release.apk` installs directly on a test phone.

Every package is a release at least two weeks old.
