# Changelog

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
