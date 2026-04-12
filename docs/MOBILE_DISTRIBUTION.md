# Mobile distribution (Expo / React Native)

This document describes how to ship the **native** mobile app in [`apps/mnemo-mobile`](../apps/mnemo-mobile/) to **iOS** and **Android**. It is separate from the Electron desktop build.

## Prerequisites

| Platform | Requirement |
|----------|-------------|
| **Apple** | [Apple Developer Program](https://developer.apple.com/programs/) (annual fee). App Store Connect access. |
| **Google** | [Google Play Console](https://play.google.com/console) (one-time registration fee). |

## Recommended toolchain: Expo Application Services (EAS)

[EAS Build](https://docs.expo.dev/build/introduction/) produces signed **IPA** (iOS) and **AAB** (Android) in the cloud so every developer does not need a full local Xcode/Android signing setup for every release.

1. Install EAS CLI: `npm install -g eas-cli`
2. In `apps/mnemo-mobile`, run `eas login` and `eas build:configure`
3. Add `eas.json` profiles (`development`, `preview`, `production`) as needed.

### EAS Submit

- **iOS:** `eas submit -p ios` uploads to App Store Connect (TestFlight or review).
- **Android:** `eas submit -p android` uploads **AAB** to Play Console.

Configure API keys or store credentials per [Expo submit docs](https://docs.expo.dev/submit/introduction/).

### EAS Update (optional)

[OTA updates](https://docs.expo.dev/eas-update/introduction/) for JavaScript/asset changes without a full store review (subject to store policy and native change limits).

---

## iOS: TestFlight → App Store

1. **Bundle identifier** — Set in `app.json` / `app.config.js` under `expo.ios.bundleIdentifier` (e.g. `com.yourorg.mnemo.mobile`). Must match the App ID in Apple Developer → Identifiers.
2. **Signing**
   - **EAS:** Let EAS manage certificates and provisioning profiles (recommended), or provide your own via `credentials.json` / Expo dashboard.
   - **Local Xcode:** Open `ios/` after `npx expo prebuild`, archive in Xcode, distribute.
3. **TestFlight** — Upload build in App Store Connect → TestFlight → internal/external testers.
4. **App Store** — Complete metadata, privacy nutrition labels, review submission.

### CI secrets (iOS, typical)

Store in GitHub Actions (or your CI) **only** as encrypted secrets; never commit:

- `EXPO_TOKEN` — Expo access token for `eas build` / `eas submit`.
- Apple: App Store Connect API key (`.p8`), Issuer ID, Key ID, or App-Specific Password for alt tooling.
- Optional: `MATCH_PASSWORD`, Fastlane match repo credentials if using [Fastlane Match](https://docs.fastlane.tools/actions/match/).

Example (conceptual):

```yaml
# .github/workflows/mobile-eas.yml (snippet)
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: cd apps/mnemo-mobile && npm ci && eas build --platform all --non-interactive --no-wait
```

Use a **macOS** runner only if you must run Xcode-specific steps locally.

---

## Android: internal testing → production

1. **Application ID** — `expo.android.package` in `app.json` (e.g. `com.yourorg.mnemo.mobile`). Unique on Play.
2. **Signing** — Play App Signing (recommended): Google holds the upload key; you sign **AAB** with an upload keystore. EAS can generate and store credentials.
3. **Tracks** — Internal testing → Closed → Open → Production in Play Console.
4. **AAB** — Required for new listings; EAS Build outputs AAB by default for store profile.

### CI secrets (Android, typical)

- `EXPO_TOKEN`
- Optional: **Google Service Account** JSON for `eas submit` to Play (service account linked in Play Console → API access).

---

## Local builds (without EAS)

- **Android:** `npx expo prebuild` then `cd android && ./gradlew bundleRelease` (requires JDK, Android SDK, and configured keystore).
- **iOS:** `npx expo prebuild` then open `ios/*.xcworkspace` in Xcode on macOS, archive, export.

Document local keystore paths and env vars in your team runbook only—do not commit keystores.

---

## EAS quick reference (`apps/mnemo-mobile`)

Run from `apps/mnemo-mobile` after `eas login` (account must own the Expo project).

| Goal | Command / notes |
|------|-------------------|
| **iOS Simulator dev client** | `cd apps/mnemo-mobile && npm run eas:build:ios:simulator` — profile `development-simulator` (`expo-dev-client` + `ios.simulator: true`). Install the `.app` on a Mac Simulator; then `npm run start:dev`. |
| **Android production AAB** | `EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform android --profile production` |
| **iOS production IPA** | First time: run **without** `--non-interactive` so EAS can validate the Apple **distribution** certificate. `eas build --platform all --non-interactive` fails on iOS until that step succeeds once. **Step-by-step:** [IOS_EAS_BUILD.md](./IOS_EAS_BUILD.md). |
| **Submit Android (Play)** | `npx eas-cli submit --platform android --latest` — first-time Google Play upload requires a **Google Service Account** JSON; Expo walks you through it in **interactive** mode (`--non-interactive` is not supported until credentials exist in EAS). |
| **Submit iOS (ASC)** | `npx eas-cli submit --platform ios --latest` after a successful iOS build (App Store Connect API key or Apple ID as per [Expo submit](https://docs.expo.dev/submit/ios/)). |

**App Store encryption:** `app.json` includes `ios.infoPlist.ITSAppUsesNonExemptEncryption: false` for apps that only use HTTPS / standard OS crypto (answer “No” to export compliance in App Store Connect if applicable).

---

## Branching

Prototype and mobile-only work can live on **`mobile/native-prototype`** (or similar) until store-ready; merge policy is a team choice.

---

## Relation to desktop

The Electron app in the repo root is **not** part of this pipeline. Mobile uses a **separate** native UX under `apps/mnemo-mobile`; shared **non-UI** TypeScript may be copied or packaged later as a small workspace package.
