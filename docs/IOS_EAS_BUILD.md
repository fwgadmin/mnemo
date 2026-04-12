# iOS EAS production build (Linux / Windows / macOS)

**You do not need a Mac.** EAS compiles iOS on **Expo’s cloud builders** (they run Xcode server-side). Your laptop can be **Linux**—same workflow many teams use for Expo apps.

What blocked **non-interactive** builds earlier is **Apple signing not yet validated in EAS**, not your OS. Fix that once using either (A) or (B) below.

## Prerequisites

1. **Apple Developer Program** (paid).
2. **Bundle ID** `com.ferrowood.mnemo.mobile` in [Identifiers](https://developer.apple.com/account/resources/identifiers/list) (explicit App ID, matches `app.json`).
3. **Expo login:** `cd apps/mnemo-mobile && npx eas whoami` (the `eas` CLI comes from the `eas-cli` devDependency).

---

## Option A — App Store Connect API key (best for Linux / CI)

This matches how a lot of Expo apps avoid interactive Apple prompts: Expo talks to Apple with an API key instead of Apple ID + 2FA in the terminal.

1. In [App Store Connect](https://appstoreconnect.apple.com/) → **Users and Access** → **Integrations** → **App Store Connect API** → create a key with access to **Developer** / **App Manager** as needed. Download the **.p8** once and note **Key ID** and **Issuer ID**.
2. In [Expo dashboard → mnemo-mobile → Credentials](https://expo.dev/accounts/fwgadmin/projects/mnemo-mobile/credentials), open **iOS** and add / link the **App Store Connect API key** (or follow [Expo’s iOS credentials docs](https://docs.expo.dev/app-signing/app-credentials/) to register the key with EAS).
3. Let EAS generate or refresh the **distribution certificate** and **provisioning profile** (still on Expo’s servers—no local Xcode).

Then from Linux:

```bash
cd apps/mnemo-mobile
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas build --platform ios --profile production --non-interactive
```

If that still complains about credentials, use Option B once, or finish any remaining steps the dashboard shows under **Credentials**.

---

## Option B — Interactive `eas build` from a normal terminal (any OS)

Use a shell with **interactive stdin** (not a headless agent). From the repo:

```bash
cd apps/mnemo-mobile
EAS_BUILD_NO_EXPO_GO_WARNING=1 npx eas build --platform ios --profile production
```

**Do not** pass `--non-interactive` on this run. Follow prompts to sign in with Apple (browser / 2FA as needed). After credentials are stored on Expo, later builds can use `--non-interactive`.

Wrapper script (same thing):

```bash
./scripts/ios-eas-production-build.sh
```

---

## After a successful build

- Logs and artifacts: [Expo → mnemo-mobile → Builds](https://expo.dev/accounts/fwgadmin/projects/mnemo-mobile/builds).
- **TestFlight / App Store:** `npx eas submit --platform ios --latest` (configure [ASC API key for submit](https://docs.expo.dev/submit/ios/) if you have not already).

See also [MOBILE_DISTRIBUTION.md](./MOBILE_DISTRIBUTION.md).
