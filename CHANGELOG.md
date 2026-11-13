# Changelog

## 2.2.1 — 2026-11-13

- **Release:** `mnemo-note@2.2.1` on npm; tag **`v2.2.1`** on GitHub. Windows installers are still unsigned (see 2.2.0).
- **Workspace names no longer revert to their ids** (`ws-…`). Any Mnemo process (app, CLI or MCP server) that read `workspace-profiles.json` mid-write, or found it missing, used to save a bare Default list over it and copy that to Turso; tenant repair then re-added each workspace named by its id. The file is now written atomically, an unreadable file is never overwritten with defaults, a missing file is not copied to Turso, and syncing keeps a real name over an id placeholder and keeps profiles only one side has (deletions stay tombstoned). Names already lost need renaming once; older CLI/MCP processes can still cause it until they are updated to 2.2.1.

## 2.2.0 — 2026-11-13

- **Release:** `mnemo-note@2.2.0` on npm; tag **`v2.2.0`** on GitHub (Windows zip; Linux zip containing the `.deb` and the app folder). Includes everything listed below, plus the unreleased 2.1.19 npm change. The mobile app is not part of this release.
- **Windows builds:** the repository variable `WINDOWS_SIGNING_DISABLED=true` builds Windows installers unsigned while Azure Trusted Signing is unavailable (it currently returns 403); delete the variable to sign again. **2.2.0 Windows installers are unsigned**, so SmartScreen will warn on first run.
- **Fixes from release review:**
  - **Cut on media:** Preview's Cut no longer deletes media when the clipboard write failed.
  - **Preview width/alignment controls:** they save through the normal debounced, per-note save queue instead of forcing one save per slider event.
  - **Pinned MCP servers:** a server started with `mnemo mcp --db` now refuses `switch_workspace` instead of rewriting the machine-wide active workspace.
  - **CodeQL:** removed the regex-based HTML comment stripping in rich paste (turndown skips comments), which CodeQL flagged as incomplete sanitization.
- **Security (HTTP MCP):** hono 4.13.16 and @hono/node-server 2.1.6 (the MCP SDK accepts the 2.x line) clear the remaining moderate advisories: path traversal and middleware bypass, double path decoding, and a WebSocket-upgrade crash. `npm audit` is now 4 low, 0 moderate/high/critical. These two releases are 11–12 days old, an explicit owner-approved exception to the two-week dependency-age rule.
- **Spreadsheet charts:**
  - **Inserting:** use 📊 in the toolbar or right-click → Insert chart from selection.
  - **Types:** column, bar, line, or stacked (share). The first column gives the labels, the other columns give up to 8 series, and a text header row names them.
  - **Charts panel:** charts appear below the grid with an editable title, type and range. Ranges follow row and column inserts and deletes, and charts are saved with the sheet.
  - **Rendering:** SVG with a validated colour-blind-safe categorical palette (separate dark and light steps per theme), thin rounded bars, a 2px gap between stacked segments, 2px lines, hairline grid, a legend for multiple series, sparing direct labels, and a hover tooltip showing every series value in its number format.
  - **Not exported:** charts are not included in XLSX exports.
- **Spreadsheet sort, filter, and fill handle:**
  - **Sort:** the right-click menu sorts the selected rows, or everything below row 1, by the active column, A→Z or Z→A. Numbers sort before text, blanks always go last, and the sort is stable. Rows move whole, with their formats, and formulas in moved rows shift their relative references.
  - **Filter:** the toolbar's ⏷ or the right-click menu filters by the active column ("contains"). It is view-only, never saved, and always keeps the header row.
  - **Fill handle:** drag the corner of a selection down, up, left or right. Numbers and dates continue their step, single dates count by day, text ending in a number increments ("Item 1" → "Item 2", "Q09" → "Q10"), formulas shift their references, other text repeats, and formats are copied.
- **Spreadsheet formatting:**
  - **Per-cell formats:** bold, italic, alignment, text colour, fill colour, and number formats (number with grouping, integer, percent, currency, date, plain text) with decimal controls.
  - **Where to apply:** the format toolbar above the grid, Ctrl/⌘+B/I in the grid, and right-click → Clear formatting.
  - **Formats travel with cells:** they move on row/column insert or delete and are copied with internal copy/paste.
  - **Dates:** typed ISO dates (`2026-11-13`) are real dates in formulas. Formula cells inherit the number format of the first cell they reference, so `=B5+30` shows a date.
  - **Everywhere:** formats apply in the grid, `mnemo sheet show`, MCP `read_sheet`, and sheet embeds.
  - **XLSX:** styles and number formats round-trip, and dates export as real Excel dates.
- **Live preview embeds:**
  - **Mermaid:** ```` ```mermaid ```` blocks render as diagrams when the cursor is outside them.
  - **Audio/video:** attachment links render as players. Their controls keep their own clicks, so playing doesn't drop you into the source.
  - **Note embeds:** a line that is only `![[Note]]` shows that note read-only, one level deep (nested embeds show as links).
  - **Sheet embeds:** an embed of a spreadsheet note shows a table of computed values: `![[Budget]]`, `![[Budget#A1:D10]]`, `![[Budget#Sheet2!A1:D10]]`, or `![[Budget#Q1!]]` for a whole sheet whose name looks like a cell.
  - **Editing:** clicking a diagram or embed opens its source.
  - **Preview:** renders the same embeds.
  - **Mermaid label fix:** node labels were blank in both Preview and the editor. Mermaid drew them in `<foreignObject>`, which the sanitizer strips; it now draws SVG text labels.
- **Attachment maintenance:**
  - **Where:** Settings → Database → Attachments, `mnemo attachments stats|convert|gc` and the MCP tools below. Everything applies to the current workspace.
  - **Statistics:** stored and unused files and sizes, and how many notes still embed base64 `data:` media.
  - **Convert inline media:** moves base64 `data:` media from older notes into stored attachments, keeping alt text, titles and width/alignment hints. Unsupported types or files over 10 MB stay inline.
  - **Remove unused:** deletes attachments no note references, with a 24-hour grace period so a just-pasted file whose note hasn't saved yet is never removed. It affects only the store it runs against.
  - **New store method:** `deleteAttachment` on both stores (removes metadata, chunks and the mirror copy).
  - **MCP:** `get_attachment` returns images as MCP image content and text/PDF/media as base64 with their MIME type; `attachment_stats` reports the statistics.
- **Linux packaging fixes:**
  - **AppArmor:** on systems that restrict unprivileged user namespaces (Ubuntu 23.10+), the desktop app aborted at startup with a Chromium SUID-sandbox error unless run with `--no-sandbox`. The `.deb` now installs an AppArmor profile granting `userns` to `/usr/lib/mnemo/Mnemo` (the same approach as Chrome, VS Code and Obsidian; the sandbox stays on) and removes it on uninstall. Zip builds ship `resources/apparmor-profile.sh`, and the launcher prints the one-line fix instead of the crash.
  - **Permissions:** packaged Linux files were group/world-writable (mode 0777 inherited from Electron's extracted binaries). This included `/usr/lib/mnemo/Mnemo` in the `.deb`. The package step now strips `go-w`.
  - **`/usr/bin/mnemo` symlink:** it failed with "expected Electron binary at /usr/Mnemo" because the launcher didn't resolve its own symlink.
  - **CLI routing:** the launcher no longer needs a system `node` to route commands, and it now sends `sync`, `delete`, `rm` and `sheet` to the CLI instead of opening the GUI.
- **Spreadsheet notes:** New note kind (`File → New Spreadsheet`, command palette, `mnemo sheet new`). Schema v7 adds `notes.kind` (`markdown` | `sheet`), set at creation and synced; older builds leave it untouched. A sheet's body is versioned JSON of raw cell input, so search matches cell text and sync stays whole-note. The `.md` mirror stores it in a ```` ```mnemo-sheet ```` fence with `kind: "sheet"` frontmatter.
  - **Grid:** formula bar, virtualized rows, multiple sheets (add / rename / delete), Excel-style keyboard navigation, undo/redo, row and column insert/delete with formula reference rewriting across sheets, resizable columns.
  - **Clipboard:** copy/paste with relative formula shifting, and TSV for other apps.
  - **Import/export:** CSV/TSV/XLSX import; CSV export of the current sheet's values; XLSX export of every sheet with formulas and cached results.
  - **Formulas:** own parser and evaluator (precedence, `%`, `&`, comparisons, ranges, `Sheet!A1` / `'Sheet name'!A1`, `$` anchors, cycle detection, lazy IF/IFERROR) plus ~400 Excel functions from formulajs (MIT).
  - **CLI and MCP:** `mnemo sheet new|show|set|list` (`mnemo help sheet`) and MCP tools `create_sheet`, `read_sheet`, `update_sheet_cells`.
  - **Dependencies:** `@formulajs/formulajs` 4.6.1 and `exceljs` 4.4.0 (both MIT; no new npm audit findings).
- **Editor / formatting toolbar:** Selecting text shows a floating toolbar (bold, italic, strikethrough, highlight, inline code, link, H1–H3, quote, bulleted / numbered / task list). It is on by default; turn it off under **Settings → Markdown → Formatting toolbar**. Matching toggle shortcuts: Ctrl/⌘+B / I / Shift+X / Alt+H / E, Ctrl/⌘+1–3 and 0, Ctrl/⌘+Shift+8 / 7 / 9 / `.`. Toggles keep selected spaces outside the markers and tell bold and italic apart (`***both***`). **Ctrl/⌘+B now bolds when text is selected in the editor** and still toggles the sidebar otherwise. The context menu's Bold/Italic use the same toggles.
- **Editor / live preview tables:** GFM tables render as formatted tables when the cursor is outside them, with column alignment and inline Markdown (bold, highlight, code, links) in cells. Clicking a cell moves the cursor to that cell's Markdown and shows the whole table as source for editing.
- **Editor / live preview:** Obsidian-style live preview, on by default (**Settings → Markdown → Live preview**). Markdown is still what is stored. Heading `#`, emphasis/strike/highlight/code markers, link brackets and URLs, and quote markers are hidden except on the element or line under the cursor, which shows its raw Markdown for editing. Attachment and inline images render at their saved width and alignment. Bullets render as dots, and task items as clickable checkboxes that toggle `[ ]`/`[x]`. Quotes, horizontal rules, and fenced code blocks get block styling. Hidden syntax moves and deletes as one unit. Ctrl/⌘-click opens https links externally and saves 📎 attachments.
- **Highlights:** `==text==` is parsed in the editor and rendered as `<mark>` in Preview and in rich-copy HTML (it was already produced when pasting `<mark>` HTML).
- **Build toolchain:** Electron Forge **7 → 8.0.1**. Forge 8 is ESM-only and requires Node 22.17+, so the main bundle is now `.webpack/main/index.cjs` (`package.json` → `main`) and pull-request CI moves from Node 22.12.0 to the current Node 22 release, matching `.nvmrc` and the other workflows. `npm start` shows webpack output as terminal tabs (press `r` to restart). vitest 4.1.12 and undici 8.12 (no longer held back for Node 22.12). Overrides for glob 14 / minimatch 11 (via `@electron/asar`), webpack-dev-server 5.2.7, and uuid 11 (via sockjs) clear the remaining packaging and dev-server advisories; the packaged app's file list is byte-for-byte the same. `npm audit`: 36 → 6 (0 high, 0 critical; hono pending its fixed release clearing the two-week cutoff, mermaid 12 and fork-ts-checker are low).
- **Dev server CSP:** `npm start` sends an explicit `devContentSecurityPolicy` that allows `mnemo-asset:`. Forge's default dev CSP header blocked attachment images and fetches in development builds.
- **Fix (CLI / MCP / desktop vault location):** CLI note/sync/workspace commands and the stdio/HTTP MCP servers no longer move the shared `mnemo.db`, `vault/`, `config.json`, and `ui-preferences.json` into `workspaces/default/` (the desktop app reads them from the bootstrap root, so local-only notes appeared to vanish from the desktop after any CLI or MCP use; nothing was deleted). On start, the desktop app, CLI, and MCP servers now restore data that older builds moved: they move it back when the root database is missing, or merge it into the root database with the normal sync rules and archive the moved copy under `workspaces/_migrated/<stamp>/`. A dedicated SQLite workspace whose database lives in `workspaces/default/` is left alone.
- **Fix (sync):** Notes created offline on two devices with the same `#` ref no longer abort push/pull with `UNIQUE constraint failed: notes.tenant_id, notes.ref`. An incoming new note whose ref is taken in that workspace gets the next free ref, and updates keep each store's existing ref.
- **Dependencies (Dependabot rollup into `dev`):** Electron **41 → 43.8.4** (41 is out of support; 43.8.4 rather than Dependabot's 43.0.0 for the later security patches), better-sqlite3 12.11.1, @libsql/client 0.17.4, CodeMirror, React 19.2.7, mermaid 11.17, uuid 14, zod 4.4, Electron Forge 7.11.2, @types/node 26, TypeScript 6.0.3, and the remaining root security bumps (ws, express/qs, hono, dompurify, launch-editor, shell-quote, fast-uri, ip-address/express-rate-limit, @xmldom/xmldom, websocket-driver). Also @modelcontextprotocol/sdk 1.32.2 and overrides for patched brace-expansion, js-yaml, postcss-selector-parser, vite, compression, follow-redirects, source-map-js, and http-proxy-middleware (undici 8 stays at 8.10.1: newer releases need Node ≥ 22.19 and break the jsdom tests on CI's Node 22.12). Resolved with `--before` a two-week cutoff. `npm audit`: 70 (4 critical) → 36 (0 critical); the rest is mostly the Electron Forge 7 toolchain (needs Forge 8). Mobile lockfile picks up the linkify-it, ws, form-data, shell-quote, tmp, and fast-uri security bumps; the mobile framework group was left out because its `patch-package` patches pin the current expo / react-navigation versions.
- **Attachments (Electron 43):** The `mnemo-asset` scheme is CORS-enabled and echoes the requesting app origin, because Electron 43 enforces CORS for `fetch()` from the `file://` renderer (image copy and rich-copy image inlining depend on it).
- **Attachments:** Pasted, dropped, and chosen media are now stored as content-addressed vault attachments (`mnemo-asset://asset/<sha256>.<ext>`, 10 MB each, schema v6) instead of base64 `data:` URLs inside note bodies, so search, list, sync, and the Markdown mirror no longer carry the file bytes. Attachments are chunked (512 KB), hash-verified on every read, served to the renderer through a restricted custom protocol (GET only, active workspace only, `nosniff`, range requests for media seeking), mirrored to `vault/_attachments/`, and synced both ways by `mnemo sync push/pull` and Settings upload/download. Existing inline `data:` media keeps rendering. Settings upload now uses the same push path as the CLI, so it also sends deletion tombstones.
- **Rich copy & paste:** HTML from browsers, Google Docs, Word, and email is converted to Markdown on paste (skipped inside code blocks, for code-editor copies, and for Mnemo's own copies); a new **Paste as plain text** menu item bypasses conversion. Copy/cut write Markdown plus sanitized HTML with attachment images inlined, so pasting into email or documents keeps formatting. Copying an image from Preview now always produces PNG.
- **Bulk category operations:** Rename, promote, demote, archive, and category deletion now use transactional bulk store operations instead of one IPC/write per note. Remote operations use bounded batches, partial failures are reported, and category colors, stamps, and sort modes share one tested path-remapping implementation.
- **Editor saves:** Autosaves now use one optimistic, atomic note-and-link operation. Per-note queues serialize writes, coalesce rapid edits, flush before navigation/close, retain failed drafts, and expose a persistent save state with retry instead of transient alerts.
- **Category performance:** Desktop and mobile build indexed category models once per note-list update, including resolved paths, adjacency, sorted children, and bottom-up counts. The 10,000-note/1,000-path benchmark is reproducible with `npm run bench:category-model` and measured about 21× faster than the previous repeated filtering path.
- **List performance:** Desktop, Turso, and mobile sidebar/backlink queries now select 120-character SQL snippets instead of transferring entire note bodies and embedded media. New tenant+updated/created/title indexes keep per-workspace sorting indexed; large-body payload and query-plan regressions are covered by integration tests.
- **MCP HTTP:** Migrated the hosted endpoint from legacy SSE to Streamable HTTP at `/mcp`. Every transport now owns an independent workspace context and MCP server; authenticated diagnostics, idle expiry, bounded session count, request size/time limits, and deterministic close cleanup prevent session crossover and resource leaks.
- **Desktop security:** Enabled Chromium renderer sandboxing, added a restrictive CSP and navigation/window guards, moved persisted-file access behind expiring per-window capabilities, hardened Mermaid rendering, encrypted database/LLM/workspace tokens with Electron `safeStorage` when available, set credential files owner-only, isolated dedicated store caches/vaults by workspace and token identity, and bounded all LLM requests to 60 seconds.
- **Sync:** Note deletions now propagate through durable timestamped tombstones instead of allowing stale replicas to resurrect data. Synced outgoing links use exact replacement, so removed links stay removed; newer recreations still supersede older deletions.
- **Workspaces:** Archive is now reversible and never deletes notes or dedicated files. Archived vaults stay visible in management views, remain unavailable to normal switching, and can be restored from Settings, CLI, or MCP; permanent Delete remains separate.
- **Storage:** Local SQLite and Turso/libSQL now use one ordered, versioned migration ledger. Local databases receive one consistent backup per pre-migration schema version, and both stores write the same complete Markdown frontmatter.
- **Data contracts:** Search results now retain tags and creation/modification timestamps, so category grouping and per-category creation-date sorting remain correct while searching. Stored tag JSON is decoded defensively across desktop and mobile list/read/search/backlink paths.
- **Editor / media:** Fixed persisted media widths being read as the default 80% because the preview parser did not recognize Mnemo's own `mnemo:w=…` title prefix.
- **Quality:** Added desktop unit and Electron-ABI integration test suites plus pull-request validation for desktop/mobile typechecks and CLI, MCP, and renderer builds.
- **MCP / workspaces:** Each stdio MCP connection now owns its workspace selection. `--workspace` pins an agent to a vault, and `switch_workspace` retargets only that connection instead of changing `workspace-profiles.json` or another Codex window's target.
- **Editor / media:** Paste, drop, or choose images, audio, video, PDF, and text attachments directly in note bodies. Rendered Preview provides controls for width, alignment, vertical movement, copy/cut, description changes, and deletion; embedded data stays with the Markdown note across local or remote databases.
- **Categories:** New categories are automatically assigned theme-aware colors by default. Nested categories receive close, readable shades of their parent color; the new General setting can disable automatic colors without removing manual picks.
- **Sidebar:** Note context menus and category rename/demote popovers now measure against the viewport and flip above bottom-edge rows instead of being clipped by the scrollable note list.
- **Sidebar / sorting:** Each category and subcategory can independently sort notes alphabetically, newest-created first, or oldest-created first from its right-click menu. Nested folders inherit the closest parent mode until they set an override; sort preferences follow renames/archives and sync with workspace UI preferences.

## 2.1.19 — 2026-04-16

- **npm (`mnemo-note`):** **`bin`** now exposes **`mnemo-note`** as well as **`mnemo`** (same entry point) so the package name matches a command when using **`npx`**. **README** clarifies that **`npm install -g mnemo-note`** is required for a global **`mnemo`** on **`PATH`**; without **`-g`**, use **`npx mnemo`** / **`npx mnemo-note`** or **`node_modules/.bin/mnemo`**.
- **npm / GitHub:** `mnemo-note@2.1.19`; tag **`v2.1.19`** when released.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.19**, iOS build number **19**. In **`app.json`**: **`expo.version`** = **2.1.19**, **`ios.buildNumber`** = **19**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

## 2.1.18 — 2026-04-16

- **Desktop (CI / packaging):** **`electron`** is listed in **`devDependencies`** again (same range as **`dependencies`**) — **`@electron-forge/plugin-webpack`** resolves the Electron version only from **`devDependencies`**, so **`npm run make`** / Release builds failed with *Could not find any Electron packages in devDependencies* after **`electron`** was moved for global npm installs (**2.1.16**).
- **npm / GitHub:** `mnemo-note@2.1.18`; tag **`v2.1.18`** when released.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.18**, iOS build number **18**. In **`app.json`**: **`expo.version`** = **2.1.18**, **`ios.buildNumber`** = **18**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

## 2.1.17 — 2026-04-16

- **npm (`mnemo-note`):** Global **`npm install -g`** postinstall no longer invokes **`npx @electron/rebuild`** (fails with *electron-rebuild: not found* / exit 127). **`@electron/rebuild`** is added as a **dependency**; **`scripts/rebuild-electron-native.js`** runs the CLI via **`node`** + **`module.createRequire`** (compatible with `@electron/rebuild` v4 **`exports`**). **`MNEMO_SKIP_NATIVE_REBUILD=1`** still skips the step.
- **npm / GitHub:** `mnemo-note@2.1.17`; tag **`v2.1.17`** when released.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.17**, iOS build number **17**. In **`app.json`**: **`expo.version`** = **2.1.17**, **`ios.buildNumber`** = **17**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

## 2.1.16 — 2026-04-16

- **npm (`mnemo-note`):** **`npm install -g mnemo-note`** no longer fails in **`postinstall`** — the tarball now includes **`scripts/rebuild-electron-native.js`** (it was listed in **`scripts`** but omitted from **`package.json` → `files`**). **`electron`** is moved from **`devDependencies`** to **`dependencies`** so the global CLI can **`require('electron')`** (same as the repo install). After a failed install, remove the broken global folder if needed (e.g. **`rm -rf "$(npm root -g)/mnemo-note"`**) then reinstall.
- **npm / GitHub:** `mnemo-note@2.1.16`; tag **`v2.1.16`** when released.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.16**, iOS build number **16**. In **`app.json`**: **`expo.version`** = **2.1.16**, **`ios.buildNumber`** = **16**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

## 2.1.15 — 2026-04-15

- **Desktop (releases):** **GitHub Releases** no longer ship a **macOS** desktop zip — the prior artifact did not work reliably on Mac. **`.github/workflows/release.yml`** builds and attaches **Windows** and **Linux** only; **`forge.config.js`** zip maker targets **`linux`** and **`win32`** (no **`darwin`**). **README** documents that macOS users should use **`mnemo-note`** from npm (CLI) or **`npm start`** from source.
- **npm / GitHub:** `mnemo-note@2.1.15`; tag **`v2.1.15`** when released.
- **Mobile (Expo / App Store Connect):** Marketing version **2.1.15**, iOS build number **15**. In **`app.json`**: **`expo.version`** = **2.1.15**, **`ios.buildNumber`** = **15**. After merge, run **`eas build`** (production profiles) then **`eas submit --latest`** as needed.

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
