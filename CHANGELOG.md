# Changelog

## 2.1.14 — 2026-04-15

- **npm / GitHub:** `mnemo-note@2.1.14`; tag **`v2.1.14`** — ships **2.1.13** security hardening (transitive **`hono`** / **`dompurify`** overrides, **moderate**-level **`npm audit`** CI) plus README demo GIFs and heading tweaks (**#66–#68**).
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.14**, iOS build number **14**. In **`app.json`**: **`expo.version`** = **2.1.14**, **`ios.buildNumber`** = **14**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

## 2.1.13 — 2026-04-16

- **Security (dependencies):** Transitive **`hono`** (via `@modelcontextprotocol/sdk`) and **`dompurify`** (via `mermaid`) bumped to patched releases; **`package-lock.json`** updated and **`package.json` → `overrides`** pin **`hono@^4.12.14`**, **`dompurify@^3.4.0`** so installs stay on fixed versions. **CI:** `.github/workflows/npm-audit.yml` now fails on **moderate** and above (aligned with Dependabot).
- **npm / GitHub:** `mnemo-note@2.1.13`; tag **`v2.1.13`** when released.

## 2.1.12 — 2026-04-15

- **Desktop (CI / signing):** **Azure Artifact Signing** on GitHub Actions — **`scripts/ci/azure-trusted-signing-setup.ps1`** installs the NuGet dlib, writes **`metadata.json`**, locates **SignTool**; **`.github/workflows/release.yml`** and **`windows-build.yml`** run it when repository **secrets** (`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`) and **variables** (`AZURE_CODESIGNING_ENDPOINT`, `AZURE_CODESIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME`) are set. **`forge.config.js`** supports Trusted Signing alongside **PFX** fallback; **`docs/CODE_SIGNING.md`** documents setup and troubleshooting.
- **npm / GitHub:** `mnemo-note@2.1.12`; tag **`v2.1.12`** when released so Windows (and other) release assets build with signing when Azure is configured.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.12**, iOS build number **12**. In **`app.json`**: **`expo.version`** = **2.1.12**, **`ios.buildNumber`** = **12**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

## 2.1.11 — 2026-04-16

- **Mobile (Expo / iOS):** **`patch-package`** patch for **`expo-dev-menu@55.0.23`** — React Native **0.85** removed **`RCTPackagerConnection.shared()`**; dev menu packager handlers now register on **`RCTDevSettings`** when **`DevMenuManager.currentBridge`** is set (fixes Xcode: *type `RCTPackagerConnection` has no member `shared`* on EAS iOS builds).
- **npm / GitHub:** `mnemo-note@2.1.11`; tag `v2.1.11` when released.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.11**, iOS build number **11**. In **`app.json`**: **`expo.version`** = **2.1.11**, **`ios.buildNumber`** = **11**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

## 2.1.10 — 2026-04-16

- **npm (mnemo-note):** Restore **`README.md`** and **`LICENSE`** to **`package.json` → `files`** so the tarball and registry UI always ship/show the readme. v2.1.8 removed them assuming npm always included them; the **npmjs.com** package page sometimes showed **no README** anyway.
- **`prepublishOnly`** now runs **`scripts/verify-npm-package-readme.js`** — publish fails if those paths are missing from **`files`** or from disk.
- **Cursor:** **`.cursor/rules/mnemo-npm-readme.mdc`** — do not remove README/LICENSE from `"files"` again.

## 2.1.9 — 2026-04-15

- **Mobile (Expo):** `SplashScreen.preventAutoHideAsync()` in `earlyStartup` (after RN init); global `ErrorUtils` wrapper logs `[mnemo-mobile]` before redbox / RCTFatal; `AppErrorBoundary` wraps full `AppInner` including the boot “Connecting…” screen. **`ELECTRON_DISABLE_SANDBOX=1`** on `start` / `start:dev` / `web` for Linux hosts where React Native DevTools (Electron) hits `chrome-sandbox` / SUID issues (documented in `apps/mnemo-mobile/README.md`).
- **CLI:** `mnemo note delete <ref|uuid>` (aliases `mnemo delete`, `mnemo rm`); vault CLI routing and tab completion updated.
- **Repo:** Root scripts `npm run mobile:start:dev` and `npm run mobile:expo` delegate to `apps/mnemo-mobile`.
- **npm / GitHub:** `mnemo-note@2.1.9`; tag `v2.1.9` when released.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.9**, iOS build number **9**. In **`app.json`**: **`expo.version`** = **2.1.9** (user-facing / marketing version, **CFBundleShortVersionString**), **`ios.buildNumber`** = **9** (monotonic **CFBundleVersion** per upload). After merge, run **`eas build --platform ios --profile production`** then **`eas submit --platform ios --latest`** so TestFlight and App Store Connect show **2.1.9** with build **9** (replacing older trains such as **2.1.6 (7)** once this build is submitted).

## 2.1.8 — 2026-04-16

- **npm:** Stop listing `README.md` and `LICENSE` under `package.json` `files`. npm always includes those paths in the tarball; relying on the default avoids rare registry/UI cases where the package page showed no README despite the file being published.
- **npm / GitHub:** `mnemo-note@2.1.8`; tag `v2.1.8` when released.
- **Mobile (Expo):** App version **2.1.8**, iOS build number **8**.

## 2.1.7 — 2026-04-16

- **Workspace / CLI / MCP:** Turso `deletedWorkspaceIds` tombstones; merged workspace profiles when using global libSQL; cloud-vs-disk sync rules; workspace rename (Settings, CLI, MCP). CLI and MCP use the same merged profile list as the GUI for tenant parity.
- **Desktop:** Optional LLM summarization — named provider profiles (OpenAI-compatible, Ollama, Anthropic, Gemini), local `llm-config.json`, IPC and context menu *Copy as summary* / *Paste as summary*. Markdown editor: spell check and autocomplete preferences; fenced language + `[[` wikilink completions on the runtime markdown language (nested JS/Python/etc. completions preserved); Tab accepts completion when the tooltip is active.
- **Mobile (CI):** Scoped `eas-cli` / `minimatch` override for `npm audit` workflow.
- **npm / GitHub:** `mnemo-note@2.1.7`; tag `v2.1.7` builds Windows, Linux, and macOS zips via CI.
- **Mobile (Expo):** App version **2.1.7**, iOS build number **7** for App Store Connect / EAS submit.

## 2.1.6 — 2026-04-15

- **CLI / workspaces:** Friendly **1-based index** for `mnemo workspace list`, `switch`, `archive`, `delete`, and `--workspace` (alongside vault ids). MCP stdio validates `--workspace` the same way.
- **Sync (additive):** `mnemo sync push` and `mnemo sync pull` merge by `updated_at`; links use `INSERT OR IGNORE` only (nothing deleted on either side). **Settings → Database:** Upload (local → remote) and Download (remote → local) when using libSQL. IPC: `syncPullLocalNotes`.
- **npm / GitHub:** `mnemo-note@2.1.6`; tagged release builds Windows, Linux, and macOS zips via CI.
- **Mobile (Expo):** App version **2.1.6**, iOS build number **3** for App Store Connect / EAS submit.

## 2.1.5 — 2026-04-14

- **Desktop (GUI):** Markdown / Preview icon toggle (eye / pencil) in shipped **GitHub Release** desktop zips/installers.
- **CI / releases:** macOS zip (`mnemo-v*-macos.zip`) on tagged releases alongside Windows and Linux.
- **npm:** `mnemo-note` package at this version.
- **Docs & mobile:** `docs/privacy-mobile.md`; Expo app version / `eas.json` aligned for App Store and TestFlight.

## 2.1.4 — 2026-04-09

- **Packaging:** npm `mnemo-note` version alignment with release tagging (PR #28).

## 2.1.3 — 2026-04-13

- **Security / repo hygiene:** Added `SECURITY.md` (secrets policy, EAS identifiers, reporting). Confirmed no committed `.env` or high-entropy API keys in tree.
- **Desktop (GUI):** Markdown / Preview toggle moved to the top-right of the note header; smaller controls; “Body” label removed.
- **Mobile (Expo):** Broader `AppErrorBoundary` around category colors + navigator; validated stack params in `MobileNavContext`; safer Legal route; resilient SecureStore / AsyncStorage with in-memory fallback; legal screens and store checklist doc; misc. storage and navigation fixes.

## 2.1.0 — 2026-04-12

- **Vault workspaces:** Multi-tenant profiles with shared or dedicated DB storage, workspace migration, `workspaceProfiles` IPC, and vault/workspace switcher in the shell. Per-workspace `ui-preferences.<id>.json` (IDE tabs and UI state no longer leak across vaults when the workspace file is new).
- **Settings:** Tabbed layout (General, Markdown, Workspace, Database); workspace storage and new-vault flows on the Workspace tab.
- **GUI:** Menu bar bottom border no longer hidden under the menu row (`box-content`); IDE explorer tree guide lines are subtler; new note focuses the title field when the note header is visible.
- **Data / stores:** Atomic `INSERT` for next `ref` on create (Turso + local SQLite) to fix `UNIQUE` races on `(tenant_id, ref)` with libSQL.
- **Docs & CLI:** `userGuide` and Help view updated for workspaces, `--workspace`, MCP, and data paths.

## 2.0.0 — 2026-04-09

- **GUI — default experience:** New installs use **Dark (IDE)** (`ide-dark`): sidebar + editor with tabs. Existing `mnemo.themeId` / synced `ui-preferences.json` unchanged.
- **GUI — IDE explorer:** Tree guides align with category color stripes; consistent nesting; tighter padding between guide and note rows; no duplicate vertical line on notes.
- **GUI — filesystem tabs:** Open files as editor tabs (read/write on disk), **File › Open File as Tab…** / **Ctrl+Shift+O**; vault import remains **Ctrl+O**. IDE tab order in preferences; backlinks hidden for file tabs.
- **Workspace:** Open/sync a folder as markdown-backed categories; search and category UX improvements (see PR #22).
- **Docs:** README, in-app help, and `mnemo help desktop` describe defaults and shortcuts.

## 1.0.9 — 2026-04-11

- **GUI:** Hide the IDE tab strip horizontal scrollbar; wheel / trackpad scrolling unchanged (#20).

## 1.0.8 — 2026-04-11

- **Categories:** Flat folder tree (top-level folders are peers, not nested under General); folder renames migrate nested paths (`folder/…` moves with the folder). **UI:** Softer drag-over highlight when moving notes between folders (theme-token tints instead of accent rings).
