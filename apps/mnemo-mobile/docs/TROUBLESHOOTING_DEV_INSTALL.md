# “Unable to install” / install fails on a real phone (dev client)

If the build **finishes** but the phone shows **“Unable to install”**, **“App not installed”**, or similar when you tap **Install** or the app icon, it is almost always **signing / device eligibility**, not JavaScript.

## iPhone (internal / ad hoc EAS builds)

Apple only allows the app on **UDIDs that were in the provisioning profile when EAS built the app**.

1. **Register this phone** before (or before the next) device build:
   ```bash
   cd apps/mnemo-mobile
   npx eas device:create
   ```
   Follow the prompts (USB or link) so your device UDID is on your Apple team.

2. **Trigger a new build** after the device is registered:
   ```bash
   npx eas build --platform ios --profile development
   ```
   Old builds **cannot** be “fixed” by registering later; you need a **new** build.

3. After install, if the app opens but iOS blocks it: **Settings → General → VPN & Device Management** → trust the developer / enterprise app (wording varies).

4. Prefer **TestFlight** (production profile + `eas submit`) if you want installs without per-device UDID lists—different process, but avoids ad hoc limits.

## Android (APK / internal install)

1. **Uninstall** any previous `com.ferrowood.mnemo.mobile` build (Play vs sideload can conflict).

2. **Install the APK** from the EAS build page (this repo’s `development` profile is set to produce an **APK** for simpler sideloading). If you only see an **AAB**, use a build profile that sets `android.buildType` to `apk` or install via **Play internal testing**.

3. Allow **Install unknown apps** for the browser / Files app you use to open the APK.

4. Temporarily disable **Play Protect** “scan apps” if it blocks the install (then re-enable).

5. **Free space** and **reboot** if the package installer still fails.

## After the app actually opens

The dev client expects a **Metro** server when you use `expo start --dev-client` (same Wi‑Fi as the phone, or tunnel). A failed **native** install is separate from “could not connect to Metro.”

## Still stuck?

Note **iOS vs Android**, **exact message**, and whether you used **EAS internal install link**, **APK file**, or **Play**. That narrows it down quickly.
