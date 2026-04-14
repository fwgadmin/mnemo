# Changelog

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
