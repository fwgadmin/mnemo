# CLI — libSQL (Turso or self-hosted)

The same `mnemo note` and `mnemo mcp` commands can use a **remote libSQL** database instead of local SQLite when credentials are available.

## Priority (same as the GUI)

1. Command-line flags: `--turso-url` and `--turso-token`
2. `config.json` from the app (see [gui-desktop.md](gui-desktop.md)) — keys `tursoUrl` / `tursoToken` (or legacy `libsqlUrl` / `libsqlAuthToken`). On Linux the GUI stores these under `~/.config/mnemo-note/` (Electron `userData`); the CLI also checks `workspaces/default/config.json` in that folder when the flat `config.json` has no remote credentials.
3. Environment variables:

```bash
export MNEMO_TURSO_URL="libsql://your-db.turso.io"
export MNEMO_TURSO_TOKEN="..."
# Aliases:
# MNEMO_LIBSQL_URL / MNEMO_LIBSQL_AUTH_TOKEN
```

## Example: note list against Turso

```bash
mnemo note list \
  --turso-url "$MNEMO_TURSO_URL" \
  --turso-token "$MNEMO_TURSO_TOKEN"
```

If env vars are already set (or `config.json` exists from the GUI), a plain `mnemo note list` picks them up automatically.

## Example: MCP stdio with Turso

```bash
mnemo mcp --turso-url "$MNEMO_TURSO_URL" --turso-token "$MNEMO_TURSO_TOKEN"
```

You still pass `--vault` if you want a local markdown mirror path; remote stores note bodies in libSQL regardless.

## HTTP MCP vs stdio

- **`mnemo mcp`** — stdio, works with **local SQLite or Turso** (flags/env/config).
- **`mnemo mcp-http`** — separate server; **requires** Turso/libSQL env vars (`TURSO_URL`, `TURSO_AUTH_TOKEN`, `MCP_API_KEY`). See [mcp-http.md](mcp-http.md).

## Additive sync (`mnemo sync`)

After remote credentials work for `mnemo note list`, you can merge **without deleting** data on either side:

```bash
# Local SQLite → remote (same as Settings → Database → Upload)
mnemo sync push

# Remote → local mnemo.db + vault/*.md (same as Settings → Download)
mnemo sync pull
```

Use `--db` / `--vault` to target paths other than the bootstrap defaults; see `mnemo help sync`.
