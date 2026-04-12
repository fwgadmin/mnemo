# Mnemo Mobile (Expo / React Native)

Native-first prototype for **iOS** and **Android**. This app is **not** the Electron desktop UI; navigation, layout, and flows are designed for phones and tablets separately.

## Development

```bash
cd apps/mnemo-mobile
npm install
npm run start
```

Then press `i` / `a` for iOS simulator or Android emulator, or scan the QR code with [Expo Go](https://expo.dev/go).

### Dev client on a **physical phone** (EAS internal build)

- **iOS:** Your device **UDID must be registered** before the build, or install will fail or refuse to run. Run `npx eas device:create` in this folder, then **rebuild** with `npx eas build --platform ios --profile development`. See **[docs/TROUBLESHOOTING_DEV_INSTALL.md](./docs/TROUBLESHOOTING_DEV_INSTALL.md)**.
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

## iOS production build (EAS)

The **first** App Store–style build must be run **interactively** on your Mac (Apple sign-in / 2FA). See **[docs/IOS_EAS_BUILD.md](../../docs/IOS_EAS_BUILD.md)** or run:

```bash
./scripts/ios-eas-production-build.sh
```

from `apps/mnemo-mobile` after `chmod +x scripts/ios-eas-production-build.sh`.

## Stack (planned)

- **Expo** — dev client, EAS Build / Submit / Update
- **React Navigation** — add when you introduce multiple screens
- **Data** — Turso (`@libsql/client`) or Expo SQLite for offline; see repo root docs

## Distribution

See **[docs/MOBILE_DISTRIBUTION.md](../../docs/MOBILE_DISTRIBUTION.md)** for TestFlight, Play Console, EAS, and CI secrets.

## Repository layout

Lives under `apps/mnemo-mobile/` so the Electron + webpack tree at the repo root stays untouched.
