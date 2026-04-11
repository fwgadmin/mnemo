# MCP — HTTP/SSE (remote libSQL only)

`mnemo mcp-http` runs a small **Express** server that exposes the same MCP surface over **HTTP + SSE** so remote clients (hosted assistants, gateways) can connect without stdio.

## Requirements

- **Remote libSQL only** — local SQLite is not supported for this mode.
- Built bundle: `dist/mnemo-mcp-http.js` (included in `npm publish`; from source run `npm run build:mcp-http`).

## Environment variables


| Variable                                  | Required | Purpose                        |
| ----------------------------------------- | -------- | ------------------------------ |
| `TURSO_URL` or `LIBSQL_URL`               | Yes      | libSQL connection URL          |
| `TURSO_AUTH_TOKEN` or `LIBSQL_AUTH_TOKEN` | Yes      | Database auth token            |
| `MCP_API_KEY`                             | Yes      | Bearer token clients must send |
| `PORT`                                    | No       | Listen port (default **3001**) |


## Run

```bash
export TURSO_URL="libsql://…"
export TURSO_AUTH_TOKEN="…"
export MCP_API_KEY="long-random-secret"
export PORT=3001
mnemo mcp-http
```

The process uses plain **Node** (not Electron) for this entrypoint; the `bin/mnemo.js` wrapper runs `node dist/mnemo-mcp-http.js`.

## Security

- Always terminate **TLS** in front of this service in production (reverse proxy).
- Treat `MCP_API_KEY` as a secret; rotate if leaked.

## Compared to stdio MCP


|             | `mnemo mcp`               | `mnemo mcp-http`               |
| ----------- | ------------------------- | ------------------------------ |
| Transport   | stdio                     | HTTP/SSE                       |
| Database    | Local SQLite and/or Turso | **Turso/libSQL only**          |
| Typical use | Cursor / Claude Desktop   | Cloud bridges, custom gateways |


