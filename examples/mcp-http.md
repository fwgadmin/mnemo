# MCP — Streamable HTTP (remote libSQL only)

`mnemo mcp-http` runs a small **Express** server that exposes the same MCP surface over **Streamable HTTP** so remote clients (hosted assistants, gateways) can connect without stdio. Connect clients to `/mcp`; the legacy `/sse` and `/messages` endpoints return `410 Gone`.

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
| `MCP_HTTP_HOST`                           | No       | Bind address (default **127.0.0.1**). Set `0.0.0.0` only behind a controlled reverse proxy or firewall. |
| `MCP_HTTP_MAX_SESSIONS`                   | No       | Maximum concurrent sessions (default **100**) |
| `MCP_HTTP_IDLE_MS`                        | No       | Idle session expiry in milliseconds (default **1800000**) |
| `MCP_HTTP_REQUEST_TIMEOUT_MS`             | No       | Non-streaming request limit in milliseconds (default **30000**) |
| `MCP_HTTP_BODY_LIMIT`                     | No       | Express JSON size limit (default **1mb**) |


## Run

```bash
export TURSO_URL="libsql://…"
export TURSO_AUTH_TOKEN="…"
export MCP_API_KEY="long-random-secret"
export PORT=3001
mnemo mcp-http
```

The process uses plain **Node** (not Electron) for this entrypoint; the `bin/mnemo.js` wrapper runs `node dist/mnemo-mcp-http.js`.

Each Streamable HTTP transport owns its own workspace selection. Calling `switch_workspace` affects only that transport; other HTTP clients, stdio clients, the CLI, and the desktop app keep their current workspace.

## Security

- Always terminate **TLS** in front of this service in production (reverse proxy).
- Treat `MCP_API_KEY` as a secret; rotate if leaked.
- `/health` includes the active session count and therefore requires the same bearer token.

## Compared to stdio MCP


|             | `mnemo mcp`               | `mnemo mcp-http`               |
| ----------- | ------------------------- | ------------------------------ |
| Transport   | stdio                     | Streamable HTTP                |
| Database    | Local SQLite and/or Turso | **Turso/libSQL only**          |
| Typical use | Cursor / Claude Desktop   | Cloud bridges, custom gateways |

