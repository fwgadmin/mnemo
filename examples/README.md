# Mnemo examples

These guides assume you have built CLI/MCP bundles from a dev tree (`npm run build:cli && npm run build:mcp && npm run build:mcp-http`) or installed the published package (`npm install -g mnemo-note`), which ships `dist/` in the npm tarball.

**Defaults:** `mnemo note` uses your XDG data dir (`~/.local/share/mnemo/` on Linux) for `mnemo.db` + `vault/`. **`mnemo mcp`** defaults to **`./mnemo.db`** and **`./vault`** in the current directory unless you pass `--db` / `--vault` — see [mcp-stdio.md](mcp-stdio.md).

| Guide | What it covers |
|--------|----------------|
| [CLI — local vault](cli-local.md) | Default data directory, listing/search/show, categories |
| [CLI — libSQL / Turso](cli-libsql.md) | Same CLI against a remote database (env or flags) |
| [MCP — stdio (Cursor, Claude Desktop)](mcp-stdio.md) | `mnemo mcp` local or remote |
| [MCP — HTTP/SSE](mcp-http.md) | `mnemo mcp-http` for hosted platforms (Turso required) |
| [Desktop app](gui-desktop.md) | GUI, Settings, shared vault with CLI |

Full command reference: run `mnemo --help` (or `node dist/mnemo-cli.js --help` from a dev build).
