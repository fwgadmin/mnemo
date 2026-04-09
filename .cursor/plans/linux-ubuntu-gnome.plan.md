---
name: Linux Ubuntu GNOME + terminal-first
overview: >-
  Ship Ubuntu-friendly packages and GNOME integration, and add a real terminal entrypoint
  so Linux users can use Mnemo from the shell first (MCP and optional note subcommands), with the GUI as secondary.
todos:
  - id: add-deb-maker
    content: Add @electron-forge/maker-deb and forge.config.js options (icon, categories, linux targets)
    status: completed
  - id: desktop-entry
    content: Freedesktop .desktop for GNOME (Exec with %F, MimeType); verify argv open-file with packaged binary
    status: completed
  - id: cli-entrypoint
    content: >-
      Add mnemo CLI (npm bin + packaged /usr/bin): subcommands for mcp (stdio), mcp-http, and gui (spawn Electron);
      optional Phase 2 human note commands (list/read/search/new) reusing INoteStore
    status: completed
  - id: deb-path-wrappers
    content: Ensure .deb installs CLI wrapper(s) on PATH and documents default data dirs vs Electron userData
    status: completed
  - id: readme-linux
    content: Document Ubuntu 24.04 deps, mnemo CLI usage, .deb vs zip, GNOME open-with, MCP paths
    status: completed
  - id: verify-build
    content: Run typecheck + make on Linux; smoke-test mnemo gui, mnemo mcp, open file via argv
    status: completed
isProject: true
---

# Linux / Ubuntu 24.04 — GNOME + terminal-first

## Is Mnemo available in the terminal today?

**Partially, but not as a named `mnemo` command.**

| What | Terminal today | Notes |
|------|----------------|--------|
| **GUI app** | `npm start` (dev) or run the packaged Electron binary from `out/` | No global `mnemo` on PATH unless you add it yourself. |
| **MCP stdio** | `node dist/mnemo-mcp.js` (after `npm run build:mcp`) | Correct for Claude/Cursor; not a general interactive shell UX. |
| **MCP HTTP** | `node dist/mnemo-mcp-http.js` (after `npm run build:mcp-http`) | Server process; documented for VPS. |
| **npm `bin`** | None | [`package.json`](../package.json) has no `"bin"` field. |

So: **you can use Mnemo from the terminal for MCP workflows**, but there is **no first-class CLI** (`mnemo …`) and **no PATH integration** from packaging yet.

---

## Direction: terminal primary, desktop secondary

1. **Keep the existing plan** (`.deb`, `.desktop`, README, verification).
2. **Add development scope** for a small **Node CLI** that becomes the single shell entrypoint:
   - **`mnemo mcp`** — run the same logic as [`src/main/mcp/stdio.ts`](../../src/main/mcp/stdio.ts) (reuse `parseArgs` / store init / `createMcpServer` + stdio transport).
   - **`mnemo mcp-http`** — run HTTP server entry (reuse [`src/main/mcp/http.ts`](../../src/main/mcp/http.ts) or a thin wrapper).
   - **`mnemo gui`** (or default when no subcommand) — **spawn the packaged Electron app** with forwarded args (e.g. file paths), so `mnemo gui note.md` matches current [`getArgvFilePath()`](../../src/main/index.ts) behavior.

Implementation notes:

- Prefer **one webpack bundle** for the CLI (e.g. `dist/mnemo-cli.js`) with a shebang, or a thin `bin/mnemo` that `node`s the bundle — avoids duplicating argument parsing.
- **`npm link` / local dev**: add `"bin": { "mnemo": "bin/mnemo.js" }` (or similar) pointing at the built file or a stub that resolves to `dist/` after build.
- **Debian package**: install the CLI script to `/usr/bin/mnemo` (wrapper that invokes bundled Node script with correct `NODE_PATH` / install layout — follow Forge deb output layout; may need `maker-deb` `scripts` or postinst only if required).

**Optional Phase 2 (if you want human-first terminal note editing without an AI client):** subcommands such as `mnemo note list`, `mnemo note show <id>`, `mnemo note search <q>`, `mnemo note new` implemented against `INoteStore` / `LocalNoteStore` (same defaults as MCP: db + vault paths, Turso env flags). This is more work but matches “primarily terminal” for note CRUD.

**Data directory caveat:** Electron’s GUI uses `app.getPath('userData')` for `mnemo.db` / `vault`. A standalone CLI using `./mnemo.db` defaults **does not** share that DB unless paths are aligned. The plan should **document** `--db` / `--vault` and/or support **`MNEMO_HOME` or XDG** (e.g. `~/.local/share/mnemo/`) so CLI and GUI can point at the same store when desired.

---

## GNOME / Ubuntu packaging (unchanged intent)

1. **`@electron-forge/maker-deb`** — primary Ubuntu install path.
2. **`.desktop` file** — app grid + “Open with”; `Exec` must pass `%F` so [`getArgvFilePath()`](../../src/main/index.ts) receives files.
3. **README** — Ubuntu 24.04 prerequisites (Node 22, `build-essential` if native compile), **`mnemo` CLI** section, `.deb` install, optional GNOME default-app settings.

---

## Verification

- `mnemo mcp` starts and speaks MCP on stdio (smoke with a minimal client or documented manual check).
- `mnemo gui` launches the app; `mnemo gui /tmp/x.md` opens import path.
- Installed `.deb`: `mnemo` on PATH; `.desktop` visible in GNOME; open-with passes file path.
- `npm run typecheck` clean.

---

## Out of scope (unless requested)

- Flatpak / AppImage.
- Full TUI editor in the terminal.
- Custom system MIME XML (unless GNOME defaults are insufficient).
