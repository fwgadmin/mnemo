# Mnemo Mobile (Expo / React Native)

Native-first prototype for **iOS** and **Android**. This app is **not** the Electron desktop UI; navigation, layout, and flows are designed for phones and tablets separately.

## Development

**Run Expo / Metro from this folder** (`apps/mnemo-mobile`). The **repo root** is the Electron desktop app. From the monorepo root you can use the same script names: **`npm run mobile:start:dev`**, **`npm run eas:dev:ios`**, **`npm run eas:build:ios`**, etc. (they delegate here — see root **`package.json`**). Do **not** install the stray npm package **`eas`** at the repo root; EAS uses **`eas-cli`** from this package (`npx eas-cli`).

```bash
cd apps/mnemo-mobile
npm install
npm run start
```

Then press `i` / `a` for iOS simulator or Android emulator, or scan the QR code with [Expo Go](https://expo.dev/go).

If Metro shows **`Requiring unknown module "<number>"`**, stop the bundler and run **`npx expo start --clear`** (stale cache). The app avoids dynamic `import()` for native-heavy packages to keep a single module graph.

On **Linux**, React Native DevTools (Electron/Chromium) may abort with **`chrome-sandbox`** / SUID errors. The **`start`** / **`start:dev`** / **`web`** scripts set **`ELECTRON_DISABLE_SANDBOX=1`** so the DevTools installer can run locally (dev-only; not used in production app binaries). Alternatively fix sandbox permissions as Chromium documents, or skip opening DevTools from the Metro menu.

If you see **`RNGestureHandlerModule` could not be found** (TurboModuleRegistry), your **dev client binary** does not include **`react-native-gesture-handler`** native code. In **development**, Metro can resolve that package to a **JS shim** (`src/shims/react-native-gesture-handler.js`) so the app runs (swipe gestures are inert). **Production** bundles use the real library. Use **`EXPO_USE_RNGH_SHIM=0`** with `expo start` if your dev client already has RNGH linked. Prefer a **rebuilt dev client**: `npx expo prebuild && npx expo run:ios|android` or an EAS development build.

### Native modules (`ExpoSecureStore`, `ExpoNetwork`, etc.)

If you see **`Cannot find native module 'ExpoSecureStore'`**, **`RNCNetInfo is null`**, or similar, the **installed app binary** was built **before** those Expo / native packages were added. **JavaScript updates alone are not enough** — create and install a **new development or simulator build** after pulling changes:

The offline banner uses **`expo-network`** (not `@react-native-community/netinfo`). If `ExpoNetwork` is missing in the binary, the banner is skipped so the app still runs.

If you see **`Unimplemented component: RNCSafeAreaProvider`**, the binary is missing **`react-native-safe-area-context`** native code. The app falls back to approximate safe-area padding, but you should **rebuild the dev client** so the real provider is linked.

If you see **`RNSScreenStack`**, **`RNSScreenContentWrapper`**, **`RNSScreenNavigationContainer`**, etc., your dev client is missing **`react-native-screens`** native views. The app uses **`@react-navigation/stack`** (JS stack) for Notes/Settings so navigation does not depend on those components. You can still **rebuild** a dev client with a current `react-native-screens` if you want native-stack behavior later.

```bash
cd apps/mnemo-mobile
npm run eas:dev:ios          # or eas:dev:android, or eas:build:ios:simulator
```

Or build locally:

```bash
npx expo prebuild --clean
npx expo run:ios    # or run:android
```

Until you install that build, the app falls back to **AsyncStorage** or **in-memory** storage (credentials may not persist across restarts; check the Metro warning).

### Dev client on a **physical phone** (EAS internal build)

- **iOS:** Your device **UDID must be registered** before the build, or install will fail or refuse to run. Run `npx eas-cli device:create` in this folder, then **rebuild** with `npm run eas:dev:ios` (or `EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform ios --profile development`). See **[docs/TROUBLESHOOTING_DEV_INSTALL.md](./docs/TROUBLESHOOTING_DEV_INSTALL.md)**.
- **Android:** The `development` profile builds an **APK** for easier sideloading. If install still fails, see the same doc.

### Development client + iOS Simulator (EAS)

The app uses **`expo-dev-client`** (not Expo Go) for native debugging. To install a **simulator** `.app` built in the cloud:

```bash
cd apps/mnemo-mobile
npm run eas:build:ios:simulator
```

This uses the `development-simulator` profile (`ios.simulator: true`, `developmentClient: true`). When the build finishes, download the artifact from the Expo dashboard, extract it on a Mac, and drag the `.app` onto the iOS Simulator (or use `xcrun simctl install`). Then start Metro with:

```bash
npm run start:dev
```

## EAS Build & Submit (`npx eas-cli`)

Run from **`apps/mnemo-mobile`** so `eas-cli` uses this package’s devDependency. **`EAS_BUILD_NO_EXPO_GO_WARNING=1`** silences the Expo Go warning (this app uses **expo-dev-client**).

| Goal | npm script |
|------|------------|
| **Dev client — iOS (device)** | `npm run eas:dev:ios` |
| **Dev client — Android (APK)** | `npm run eas:dev:android` |
| **Dev client — iOS Simulator** | `npm run eas:build:ios:simulator` |
| **Production — iOS** | `npm run eas:build:ios` |
| **Production — Android** | `npm run eas:build:android` |
| **Submit latest build — iOS** (TestFlight / App Store Connect) | `npm run eas:submit:ios` |
| **Submit latest build — Android** (Play Console) | `npm run eas:submit:android` |

**Raw `npx` equivalents** (same directory):

```bash
# —— Development (native dev client, not Expo Go) ——
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform ios --profile development
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform android --profile development
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform ios --profile development-simulator

# —— Production (store binaries; versions from app.json) ——
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform ios --profile production
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform android --profile production

# —— Submit latest finished production build ——
npx eas-cli submit --platform ios --latest --profile production
npx eas-cli submit --platform android --latest
```

`eas.json` **`submit.production`** currently configures **iOS** (team id, App Store Connect app id); Android submit uses Play Console credentials from EAS or your Google Service Account as set up in Expo.

## iOS production build (EAS)

The **first** App Store–style build may need Apple sign-in / 2FA in the CLI. See **[docs/IOS_EAS_BUILD.md](../../docs/IOS_EAS_BUILD.md)** or run:

```bash
./scripts/ios-eas-production-build.sh
```

from `apps/mnemo-mobile` after `chmod +x scripts/ios-eas-production-build.sh`.

## Stack

- **Expo** — dev client, EAS Build / Submit / Update
- **React Navigation** — bottom tabs (Notes / Settings) + **JS stack** (`@react-navigation/stack`) for list, detail, editor, search (avoids `RNSScreenStack` when `react-native-screens` native code is missing)
- **Data** — Turso remote libSQL via `@libsql/client/web` (HTTP/WebSocket only; avoids the Node `sqlite3` build that Metro cannot bundle). Same model as desktop `TursoNoteStore`. No local `better-sqlite3` on device.
- **Secrets** — Turso URL, token, and tenant id in **Expo Secure Store** when the native module is present; otherwise AsyncStorage or session memory (see **Native modules** above).

### Turso connection

1. Open **Settings** and paste your **libsql URL** and **auth token** (same values as the desktop app for that vault).
2. Optionally set **Tenant ID** (defaults to `default`).
3. Use **Save & connect**, then open the **Notes** tab and pull to refresh.

The app does not commit credentials. For EAS builds, inject tokens at build time only if you add a deliberate CI flow; prefer on-device entry via Settings for development.

### Offline behavior

Notes are read from the network (Turso). When `expo-network` is available, an **offline banner** may appear when disconnected; Turso calls still fail without connectivity. Full offline sync is not implemented.

## Distribution

See **[docs/MOBILE_DISTRIBUTION.md](../../docs/MOBILE_DISTRIBUTION.md)** for TestFlight, Play Console, EAS, and CI secrets.

## Repository layout

Lives under `apps/mnemo-mobile/` so the Electron + webpack tree at the repo root stays untouched.
