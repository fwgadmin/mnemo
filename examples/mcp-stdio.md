# MCP — stdio (Cursor, Claude Desktop, local tools)

The MCP server exposes Mnemo’s tools and resources over **stdio** using the Model Context Protocol.

## Run

From a global install:

```bash
mnemo mcp
```

From a git clone (after `npm run build:cli`):

```bash
./node_modules/.bin/mnemo mcp
# or
npx mnemo mcp
```

## Local SQLite

**Important:** `mnemo mcp` defaults to **`./mnemo.db`** and **`./vault`** in the **current working directory** (unlike `mnemo note`, which defaults to `~/.local/share/mnemo/` on Linux). Point it at the same files the GUI uses:

```bash
# Linux typical GUI/CLI data dir
mnemo mcp --db "$HOME/.local/share/mnemo/mnemo.db" --vault "$HOME/.local/share/mnemo/vault"
```

Or set `MNEMO_HOME` and pass:

```bash
export MNEMO_HOME="$HOME/.local/share/mnemo"
mnemo mcp --db "$MNEMO_HOME/mnemo.db" --vault "$MNEMO_HOME/vault"
```

Ad-hoc paths:

```bash
mnemo mcp --db ./my.db --vault ./my-vault
```

## With Turso / libSQL

```bash
mnemo mcp --turso-url "libsql://…" --turso-token "…"
```

Or rely on `config.json` / `MNEMO_TURSO_*` env vars (see [cli-libsql.md](cli-libsql.md)).

## Cursor — sample `mcp.json` fragment

Adjust the path to your `mnemo` binary (global install or repo `bin/mnemo.js` via `node`).

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "mnemo",
      "args": ["mcp"],
      "env": {}
    }
  }
}
```

To force a dedicated data dir:

```json
"env": {
  "MNEMO_HOME": "/home/you/.local/share/mnemo"
}
```

## Claude Desktop

Same idea: add a server entry whose **command** is `mnemo` and **args** are `["mcp"]` (or the full path to `mnemo` on Windows).

Verify tools appear in the client after restart. Use `mnemo --help` for the full CLI surface.
