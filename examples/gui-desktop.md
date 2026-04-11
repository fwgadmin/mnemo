# Desktop app (Electron GUI)

## Start

- **Installed build:** launch **Mnemo** from the OS (Windows/Linux installer or unpacked app).
- **From source:** `npm start` or `mnemo` / `mnemo gui` from the repo (runs Electron Forge dev).

## Vault location

The app stores data under the OS user data directory (Electron `userData`). If the package was renamed, legacy paths may still be used when migrating Turso config — see the main README and `src/main/userConfig.ts` for details.

Set **`MNEMO_HOME`** to pin a single directory for DB + `config.json` + vault (same variable the CLI respects).

## Settings — remote database (libSQL)

**Settings** in the app let you save **Turso / libSQL** URL and token. That writes `config.json`; the **CLI** and **`mnemo mcp`** then use the same credentials when you do not pass `--turso-url` on every invocation.

Flow many teams use:

1. Create a database (e.g. Turso CLI or dashboard).
2. Enter URL + token in **Settings**, save.
3. Use **GUI**, **`mnemo note list`**, and **`mnemo mcp`** interchangeably against the same vault.

## Features (GUI)

- Markdown editor (CodeMirror), wikilinks, backlinks, graph
- Categories as folder paths (first tag), sidebar / IDE layouts
- Optional Turso / libSQL — same vault as CLI and MCP when credentials match
- **Reloading the list:** sidebar button **↻** (or command palette **Reload Note List**) re-fetches notes and categories from the database and reloads the open note from the server. While the window is focused, the app also checks for vault changes on a short interval so new categories and notes appear without restarting (the open note is not overwritten until you save or reload manually — avoids clobbering unsaved edits).
- **Fullscreen:** **F11** on Linux and Windows (no global menu bar in those builds). macOS: **View → Toggle Full Screen** or **Ctrl+Cmd+F**.

For terminal automation, prefer the examples in [cli-local.md](cli-local.md) and [cli-libsql.md](cli-libsql.md).
