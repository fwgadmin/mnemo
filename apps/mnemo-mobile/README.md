# Mnemo Mobile (Expo / React Native)

Native-first prototype for **iOS** and **Android**. This app is **not** the Electron desktop UI; navigation, layout, and flows are designed for phones and tablets separately.

## Development

```bash
cd apps/mnemo-mobile
npm install
npm run start
```

Then press `i` / `a` for iOS simulator or Android emulator, or scan the QR code with [Expo Go](https://expo.dev/go).

## iOS production build (EAS)

**No Mac required**—EAS builds iOS in the cloud. On **Linux**, prefer configuring an [App Store Connect API key](https://docs.expo.dev/submit/ios/#submitting-your-app-using-app-store-connect-api-key) in Expo so builds can run non-interactively (same pattern as many Expo apps). Alternately run an interactive `eas build` once from a normal terminal.

See **[docs/IOS_EAS_BUILD.md](../../docs/IOS_EAS_BUILD.md)** or:

```bash
./scripts/ios-eas-production-build.sh
```

## Stack (planned)

- **Expo** — dev client, EAS Build / Submit / Update
- **React Navigation** — add when you introduce multiple screens
- **Data** — Turso (`@libsql/client`) or Expo SQLite for offline; see repo root docs

## Distribution

See **[docs/MOBILE_DISTRIBUTION.md](../../docs/MOBILE_DISTRIBUTION.md)** for TestFlight, Play Console, EAS, and CI secrets.

## Repository layout

Lives under `apps/mnemo-mobile/` so the Electron + webpack tree at the repo root stays untouched.
