# Mnemo

**AI-native memory layer** — local-first note-taking with a built-in MCP server so AI assistants can read, search, create, and link your notes directly.

[![version](https://img.shields.io/badge/version-0.9.0-blue)](package.json)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

---

## Features

- **Markdown editor** — CodeMirror 6 with syntax highlighting, wikilink decorations (`[[Note Title]]`), and auto-save
- **Wikilinks & backlinks** — automatic link resolution with a backlinks panel per note
- **Full-text search** — SQLite FTS5 across titles, bodies, and tags
- **Knowledge graph** — force-directed d3 canvas visualization of note connections
- **Command palette** — fuzzy note search and quick commands via `Ctrl+P`
- **MCP server (embedded)** — resources, tools, and prompts available to any MCP-compatible AI
- **MCP server (stdio)** — run headlessly for Claude Desktop / Cursor integration
- **MCP server (HTTP/SSE)** — hosted endpoint for cloud AI platforms (ChatGPT, Gemini, etc.)
- **Turso cloud sync** — optional Turso-backed database so multiple clients share one vault
- **Multi-tenant** — tenant-scoped notes for separating knowledge bases
- **Flat-file vault** — every note synced to `vault/` as Markdown with YAML frontmatter

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 41 |
| UI | React 19, Tailwind CSS 3 |
| Editor | CodeMirror 6 |
| Local storage | SQLite via better-sqlite3 (WAL + FTS5) |
| Cloud storage | Turso (libSQL) via @libsql/client |
| Graph | d3-force (canvas) |
| AI integration | Model Context Protocol SDK 1.x |
| HTTP server | Express 4 |
| Build | Electron Forge + Webpack |
| Language | TypeScript 5 (strict) |

---

## Getting Started

```bash
git clone https://github.com/fwgadmin/mnemo.git
cd mnemo
npm install
npm start
```

The app opens with a local SQLite database stored in your OS user-data directory. No sign-up required.

---

## MCP Integration

### Resources

| URI | Description |
|-----|-------------|
| `mnemo://notes` | JSON list of all notes |
| `mnemo://notes/{id}` | Single note as Markdown |

### Tools

| Tool | Description |
|------|-------------|
| `create_note` | Create a new note |
| `read_note` | Read a note by ID |
| `update_note` | Update title, body, or tags |
| `delete_note` | Delete a note |
| `search_notes` | Full-text search |
| `get_backlinks` | Get notes linking to a given note |
| `link_notes` | Set outgoing links from source to targets |
| `get_graph` | Full node/edge graph data |

### Prompts

| Prompt | Description |
|--------|-------------|
| `summarize_note` | Generate a summary of a note |
| `relate_notes` | Analyze relationships between two notes |
| `query_vault` | Ask a question using the vault as context |

---

## MCP Connection Options

### Option A — Embedded (inside the Electron app)

The MCP server starts automatically. Connect via the in-app **Help** screen which shows the auto-generated Claude Desktop config snippet.

### Option B — Stdio (Claude Desktop / Cursor)

Build the standalone MCP binary:

```bash
npm run build:mcp
```

This produces `dist/mnemo-mcp.js`. Add it to your Claude Desktop config:

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": [
        "/absolute/path/to/mnemo/dist/mnemo-mcp.js",
        "--db", "/absolute/path/to/mnemo.db",
        "--vault", "/absolute/path/to/vault"
      ]
    }
  }
}
```

To use a shared Turso database instead of a local file:

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": [
        "/absolute/path/to/mnemo/dist/mnemo-mcp.js",
        "--turso-url", "libsql://your-db.turso.io",
        "--turso-token", "your-turso-auth-token",
        "--vault", "/absolute/path/to/vault"
      ]
    }
  }
}
```

### Option C — HTTP/SSE server (hosted AI platforms)

Build the HTTP server bundle:

```bash
npm run build:mcp-http
```

This produces `dist/mnemo-mcp-http.js`. Deploy it to any Node.js host and set the environment variables shown in the [VPS deployment guide](#deploying-the-http-mcp-server-to-a-vps) below.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New note |
| `Ctrl+P` | Command palette |
| `Ctrl+G` | Toggle graph view |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+S` | Save (also auto-saves on edit) |
| `Ctrl+Shift+H` | Toggle note header |
| `Ctrl+Shift+L` | Toggle line numbers |

---

## Project Structure

```
src/
├── main/                        # Electron main process
│   ├── index.ts                 # App entry, IPC handlers
│   ├── mcp/
│   │   ├── server.ts            # MCP server (resources, tools, prompts)
│   │   ├── stdio.ts             # Standalone stdio entry point
│   │   └── http.ts              # HTTP/SSE entry point (hosted platforms)
│   └── store/
│       ├── NoteStore.ts         # LocalNoteStore — SQLite via better-sqlite3
│       └── TursoNoteStore.ts    # TursoNoteStore — cloud SQLite via @libsql/client
├── preload/
│   └── index.ts                 # contextBridge IPC layer
├── renderer/                    # React UI
│   ├── App.tsx                  # Root component
│   └── components/
│       ├── Editor.tsx           # CodeMirror 6 markdown editor
│       ├── Sidebar.tsx          # Note list + search
│       ├── BacklinksPanel.tsx   # Incoming links panel
│       ├── GraphView.tsx        # d3-force canvas graph
│       ├── CommandPalette.tsx   # Fuzzy search + commands
│       ├── HelpView.tsx         # In-app documentation
│       ├── MenuBar.tsx          # Custom title-bar menu
│       └── wikilinkPlugin.ts    # CM6 wikilink decorations
└── shared/
    └── types.ts                 # Shared TypeScript types + INoteStore interface
```

---

## Scripts

```bash
npm start              # Dev mode with hot reload
npm run typecheck      # TypeScript type-check (zero errors enforced)
npm run build:mcp      # Build stdio MCP server → dist/mnemo-mcp.js
npm run build:mcp-http # Build HTTP MCP server → dist/mnemo-mcp-http.js
npm run package        # Package Electron app for distribution
npm run make           # Build platform installers
```

---

## Deploying the HTTP MCP Server to a VPS

The HTTP/SSE MCP server (`dist/mnemo-mcp-http.js`) is a plain Node.js process. It connects to a shared [Turso](https://turso.tech) database so the same note vault is accessible from the Electron desktop app and from hosted AI platforms simultaneously.

### Prerequisites

- A VPS with Node.js 20+ installed (Ubuntu/Debian recommended)
- A free [Turso](https://turso.tech) account and database
- `dist/mnemo-mcp-http.js` built locally with `npm run build:mcp-http`

### 1. Create a Turso database

```bash
# Install the Turso CLI
curl -sSfL https://get.tur.so/install.sh | bash

# Authenticate
turso auth login

# Create a database
turso db create mnemo

# Get the connection URL
turso db show mnemo --url          # → libsql://mnemo-<org>.turso.io

# Create an auth token
turso db tokens create mnemo       # → <token>
```

### 2. Copy the server bundle to your VPS

```bash
scp dist/mnemo-mcp-http.js user@your-vps:/opt/mnemo/
```

### 3. Install Node.js dependencies on the VPS

The bundle externalises `express` and `@libsql/client`, so install them next to the binary:

```bash
ssh user@your-vps
cd /opt/mnemo
npm init -y
npm install express @libsql/client @modelcontextprotocol/sdk zod
```

### 4. Set environment variables

Generate a strong random API key (e.g. `openssl rand -hex 32`) and set:

```bash
export TURSO_URL="libsql://mnemo-<org>.turso.io"
export TURSO_AUTH_TOKEN="<your-turso-token>"
export MCP_API_KEY="<your-strong-random-key>"
export PORT=3001          # optional, default 3001
```

Store these in `/etc/environment` or use a process manager `.env` file — never commit them to source control.

### 5. Run with PM2

```bash
npm install -g pm2

pm2 start /opt/mnemo/mnemo-mcp-http.js \
  --name mnemo-mcp \
  --env production

pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

### 6. Expose via nginx (HTTPS required for most AI platforms)

Install certbot and nginx, then add a site config:

```nginx
server {
    listen 443 ssl;
    server_name mcp.yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/mcp.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mcp.yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;

        # Required for SSE — disable buffering
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo certbot --nginx -d mcp.yourdomain.com
sudo systemctl reload nginx
```

### 7. Connect an AI platform

Point your AI client at the SSE endpoint with your API key as a Bearer token:

| Field | Value |
|-------|-------|
| SSE URL | `https://mcp.yourdomain.com/sse` |
| Auth header | `Authorization: Bearer <MCP_API_KEY>` |
| Message endpoint | `https://mcp.yourdomain.com/messages?sessionId=<id>` |

### 8. Health check

```bash
curl https://mcp.yourdomain.com/health
# → {"status":"ok","sessions":0}
```

### 9. Connect the Electron app to the same Turso vault

Set environment variables before launching Mnemo to share the cloud DB:

**Windows (PowerShell):**
```powershell
$env:MNEMO_TURSO_URL = "libsql://mnemo-<org>.turso.io"
$env:MNEMO_TURSO_TOKEN = "<your-turso-token>"
npm start
```

**macOS / Linux:**
```bash
MNEMO_TURSO_URL="libsql://mnemo-<org>.turso.io" \
MNEMO_TURSO_TOKEN="<your-turso-token>" \
npm start
```

For a packaged app, set the variables in your OS environment before launching the `.exe` / `.app`.

---

## License

MIT
