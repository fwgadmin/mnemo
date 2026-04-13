# Mnemo Mobile — store distribution checklist

Use this when preparing **Google Play**, **Apple App Store**, or **TestFlight** builds. Adjust for your legal entity and hosting URLs.

## Build & signing

- [ ] **EAS** (or `expo run:android` / `expo run:ios`) with release credentials
- [ ] **Version** / **build number** bumped in `app.json` and store consoles
- [ ] **Bundle ID** / **application ID** match store listings (`com.ferrowood.mnemo.mobile` in `app.json`)

## Privacy & legal (required for most stores)

- [ ] **Privacy Policy URL** — host the same text as in-app (`src/legal/legalContent.ts`) on a public HTTPS page, or link to your repo’s rendered doc / GitHub Pages
- [ ] **App Privacy** questionnaires (Apple): data types collected — Mnemo Mobile stores DB credentials locally and syncs note content to **your** Turso/libSQL endpoint; declare “User Content” / “Other” as appropriate; **no** publisher analytics in the stock app
- [ ] **Data safety** (Google): similar disclosures; encryption in transit to your DB endpoint
- [ ] **Terms of Use** — optional for some stores but recommended; in-app copy lives beside the privacy policy

## Product page assets

- [ ] Screenshots (phone; tablet if `supportsTablet` is true)
- [ ] Short / full description mentioning **bring-your-own database** (Turso / libSQL)
- [ ] Support URL / email for store listing
- [ ] Age rating (typically **4+** / **Everyone** if no user-generated content policy beyond notes the user owns)

## Technical

- [ ] **Orientation**: `app.json` uses `"orientation": "default"` — test **landscape** on Notes, Categories, Settings, Note detail
- [ ] **Encryption export** — `ITSAppUsesNonExemptEncryption: false` in `app.json` (standard if you only use HTTPS/TLS)
- [ ] **ProGuard / R8** (Android release) — verify release build if you add native obfuscation later

## Updates

When you change `PRIVACY_POLICY` or `TERMS_OF_USE` in `legalContent.ts`, bump **`LEGAL_EFFECTIVE_DATE`**, update any hosted policy URL, and submit a store **metadata** update if required.
