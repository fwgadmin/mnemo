# iOS EAS production build (first time)

EAS cannot finish the **first** iOS production build in a non-interactive environment until Apple signing is validated. You need to run the build **once** from your own machine (Terminal.app, iTerm, etc.) where you can sign in to Apple and complete prompts.

## Before you run

1. **Apple Developer Program** membership (paid).
2. **Bundle ID** `com.ferrowood.mnemo.mobile` registered in [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list) (same as `app.json`). Create it if missing (App ID, explicit).
3. **Expo account** logged in: `cd apps/mnemo-mobile && npx eas-cli whoami` (should show your team, e.g. `fwgadmin`).

## Start the build (interactive)

From the repo root:

```bash
chmod +x apps/mnemo-mobile/scripts/ios-eas-production-build.sh
./apps/mnemo-mobile/scripts/ios-eas-production-build.sh
```

Or:

```bash
cd apps/mnemo-mobile
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform ios --profile production
```

**Do not** pass `--non-interactive` on this first run.

Follow the prompts to authenticate with Apple (Apple ID + 2FA, or [App Store Connect API key](https://docs.expo.dev/submit/ios/#submitting-your-app-using-app-store-connect-api-key)). EAS will create or reuse a **distribution certificate** and **provisioning profile** stored on Expo’s servers.

When the build finishes, open the build URL EAS prints (or [Expo dashboard → mnemo-mobile → Builds](https://expo.dev/accounts/fwgadmin/projects/mnemo-mobile/builds)).

## After the first success

Later builds can use:

```bash
cd apps/mnemo-mobile
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas-cli build --platform ios --profile production --non-interactive
```

Submit to TestFlight / App Store:

```bash
cd apps/mnemo-mobile
npx eas-cli submit --platform ios --latest
```

See also [MOBILE_DISTRIBUTION.md](./MOBILE_DISTRIBUTION.md).
