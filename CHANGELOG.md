# Changelog

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
