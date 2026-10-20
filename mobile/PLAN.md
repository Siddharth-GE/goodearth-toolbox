# The phone app

Kaadal Toolbox for Android (and later iPhone), `com.kaadalgroup.toolbox`: a **Capacitor 8** shell that opens `https://toolbox.kaadalgroup.com` in the app's own web view. Every screen is the website's, so **a website deploy reaches the app at once**; a new store version is needed only for the shell itself (name, icon, native features, Android target). It replaces the Play wrapper (`android/PLAN.md`) as an ordinary update: same package, same upload key, version code 2 on.

## How it works

- **`mobile/` is its own project** with its own `package.json`; the website's dependencies are untouched, and lint, typecheck and Prettier skip it. `mobile/android/` is committed; Gradle output and what `cap sync` copies in are ignored.
- **`capacitor.config.json`** names the site. `www/index.html` is the **"No connection" screen**, shown in place of a blank page whenever the site can't be reached (`server.errorPath`).
- **The server learns it is in the app only from the user agent's `KaadalToolboxApp` mark**, asked through `lib/native/app.ts`, and today only Google sign-in asks. Page script finds the app's bridge instead (`window.Capacitor`), and only fingerprint sign-in uses it.
- **Google sign-in** runs in a Chrome tab, because Google refuses a web view. When the site sees the mark, it asks Google to return to `com.kaadalgroup.toolbox://auth/callback` instead of its own callback; Android hands that to the app, and `MainActivity.onNewIntent` loads the site's `/auth/callback` with the same query in the web view, where the PKCE cookie lives. Another app claiming the address would catch only a code that is useless without that cookie. The address must be on each Supabase project's redirect allow-list. The site hands over to Google by leaving the page, which never happens in the app, so a sign-in page that opened a tab reloads when the person comes back without signing in; left alone, its next sign-in was sent to Google's address and hung at "Signing in…".
- **Fingerprint or face sign-in** (`BiometricSignInPlugin`, `lib/native/biometric-sign-in.ts`). Ticking "Use fingerprint or face next time" on the sign-in page encrypts the password with a Keystore key that works only after a strong fingerprint or face, kept in the app's own storage with the email beside it. The next sign-in page asks for the finger by itself (once per launch) and signs in through the ordinary password path, so the trusted device still decides whether the code is asked. A fingerprint added to the phone retires the key, a saved password that fails is cleared, and "Turn off fingerprint sign-in" in the profile menu clears it. Only `/login` on the app's own host may save or read it. It is our own plugin over Google's `androidx.biometric`, so the key itself holds the password, not a check beside it. The iPhone needs the same four calls in Swift, over the Keychain.
- **Spacing:** the web view sits between the status bar and the navigation bar (`SystemBars.insetsHandling: "native"`), on burgundy with light icons, so the site needs no safe-area CSS.
- **Back button:** `@capacitor/app` steps back through the site's history, and leaves the app from the first page.
- **Prints and exports** (`lib/pdf/`, `lib/csv.ts`): a web view can't show a PDF, so `MainActivity` hands every download to Android's DownloadManager with the session's cookies, then opens it in the phone's PDF viewer or spreadsheet app. Files live in the app's own storage (no permission asked); the same print downloaded again replaces the old copy.
- **Links to other sites** (Google's sign-in, Zoho WorkDrive, product pages) open in a Chrome tab over the app (`ExternalLinksPlugin`), and closing it returns to the page the person was on.
- **Pictures:** a field that takes a picture offers **Camera** beside the phone's picker, as Chrome does (`CameraFileChooser`); other files get the picker alone. The phone's own camera app takes the shot into the app's cache, so no camera permission is asked, and each shot is dropped when the next is taken. The iPhone's web view offers the camera by itself.

## Building a new version

On this PC: **Java 21** in `C:\Users\goodearth\.bubblewrap\jdk\jdk-21.0.12.1+1` (Capacitor 8 needs 21; the wrapper's Java 17 sits beside it), and the Android SDK in `C:\Users\goodearth\.bubblewrap\android_sdk`, named in the ignored `mobile/android/local.properties` (`sdk.dir=C\:/Users/goodearth/.bubblewrap/android_sdk`).

1. Raise `versionCode` (+1, every upload) and `versionName` in `mobile/android/app/build.gradle`; commit.
2. In `mobile/`: `npm install`, then `npm run sync`.
3. In PowerShell: unset `NoDefaultCurrentDirectoryInExePath`, set `JAVA_HOME` to the Java 21 folder and put its `bin` first on `PATH`, and set `KAADAL_UPLOAD_KEYSTORE` (the upload key's path), `KAADAL_UPLOAD_STORE_PASSWORD` and `KAADAL_UPLOAD_KEY_PASSWORD` (both from the `README.txt` beside the key, `android/PLAN.md`). Without them the build is unsigned.
4. In `mobile/android/`: `.\gradlew.bat bundleRelease assembleRelease`.
5. Upload `app/build/outputs/bundle/release/app-release.aab` in Play Console; `app/build/outputs/apk/release/app-release.apk` installs directly on a test phone.

Every package is a release at least two weeks old.
