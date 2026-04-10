# Mnemo

**AI-native memory layer** — local-first note-taking with a built-in MCP server so AI assistants can read, search, create, and link your notes directly.

[version](package.json)
[license](LICENSE)

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
- **File associations** — right-click any `.md` or `.txt` file in Explorer to open it in Mnemo
- **Multi-tenant** — tenant-scoped notes for separating knowledge bases
- **Flat-file vault** — every note synced to `vault/` as Markdown with YAML frontmatter
- **Categories** — first tag is the folder path (`General`, `Unassigned`, or nested paths); sidebar grouping, IDE Solution Explorer, folder colors, rename/promote/demote
- **Themes & layouts** — CSS-variable themes; classic sidebar, top navigation, or IDE tabs with optional layout override in Settings
- **CLI** — `mnemo note` includes list/show/search/new/import plus category tree, `set-category`, and folder rename/promote/demote (same semantics as the app)
- **UI preferences sync** — theme, layout, folder colors, Markdown appearance (CSS variables), and related settings save to `ui-preferences.json`; with a linked **Turso/libSQL** database the same merged JSON is mirrored to `app_kv` (`ui_preferences`) for multi-device sync

---

## UI preferences persistence

The app stores **themes, layout (and override), sidebar/chrome toggles, grouped list & category subtree scope, category folder colors, Markdown editor CSS overrides** (`markdownGlobal` / `markdownByTheme`), and **IDE tab order** in **`ui-preferences.json`** beside your config directory (same resolution as `MNEMO_HOME` / Electron user data). The MCP resource `mnemo://preferences` and tools `get_ui_preferences` / `set_ui_preferences` use the same shape.

### Remote database (Turso / libSQL)

When Settings points at a **remote libSQL** datasource, the Electron app uses `TursoNoteStore`. Each preferences save writes the **full merged** snapshot to:

1. **`ui-preferences.json`** on disk (also used by CLI and local MCP when not cloud-backed), and  
2. The **`app_kv`** table, key **`ui_preferences`**, in the linked database — so other machines or services using the same vault see the same colors and format settings.

On launch, the app reads disk and **merges** cloud values when Turso is connected (see `readUiPreferencesMerged` in `src/main/uiPreferences.ts`). A few values are cached in `localStorage` for bootstrap; the file and `app_kv` mirror are the durable sources.

---

## Tech Stack


| Layer          | Technology                             |
| -------------- | -------------------------------------- |
| Shell          | Electron 41                            |
| UI             | React 19, Tailwind CSS 3               |
| Editor         | CodeMirror 6                           |
| Local storage  | SQLite via better-sqlite3 (WAL + FTS5) |
| Cloud storage  | Turso (libSQL) via @libsql/client      |
| Graph          | d3-force (canvas)                      |
| AI integration | Model Context Protocol SDK 1.x         |
| HTTP server    | Express 4                              |
| Build          | Electron Forge + Webpack               |
| Language       | TypeScript 5 (strict)                  |


---

## Getting Started

```bash
git clone https://github.com/fwgadmin/mnemo.git
cd mnemo
npm install
npm start
```

The app opens with a local SQLite database stored in your OS user-data directory. No sign-up required.

### Linux (Ubuntu 24.04) — terminal first

**System packages for packaging:** building a `.deb` needs `fakeroot` and `dpkg` (usually already present on Ubuntu).

**Optional build tools:** if `better-sqlite3` fails to install prebuilt binaries, install build prerequisites:

```bash
sudo apt install -y build-essential python3
```

**Install the app:** after `npm run make`, install `out/make/deb/x64/mnemo_*_amd64.deb` (or use the zip under `out/make/zip/`). The package installs the `mnemo` command and a GNOME desktop entry for **Mnemo**.

`**mnemo` command (after `.deb` install):**


| Command                                       | Purpose                                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `mnemo`                                       | Open the graphical app (pass `.md` / `.txt` paths to import)                                  |
| `mnemo mcp`                                   | MCP server on stdio (same flags as `dist/mnemo-mcp.js`)                                       |
| `mnemo mcp-http`                              | HTTP/SSE server (requires `TURSO_URL`, `TURSO_AUTH_TOKEN`, `MCP_API_KEY`; uses system `node`) |
| `mnemo note list` / `show` / `search` / `new` / `import` / `graph` / `autolink` | Notes in the terminal |
| `mnemo note categories` / `set-category` / `category …` | Category tree and folder operations (matches in-app behavior) |


`mcp` and `note` run on the **same Electron runtime** as the app so SQLite native code matches. `mcp-http` uses your system Node.js.

**Category CLI quick reference:** `mnemo note categories` prints the folder tree; `mnemo note set-category` takes a ref or UUID and a category (`General`, `Unassigned`, or a nested path); `mnemo note category rename`, `promote`, and `demote` bulk-move notes between folders. Use `-c` on `list`, `new`, and `import` with the same category names. Run `mnemo help` or `mnemo --help` for the full text.

**Share one vault between GUI and CLI:** set `MNEMO_HOME` to a directory; both the app and `mnemo note` / `mnemo mcp` use it for `mnemo.db` and `vault/` (GUI reads this via `app.setPath('userData', …)`).

**From a git checkout (development):** `npm install`, then `npm run build:cli`, then use `npx mnemo` or `node bin/mnemo.js` (or add `./node_modules/.bin` to `PATH`). The dev launcher runs `mcp`/`note` under Electron-as-Node with the repo’s `node_modules`.

---

## MCP Integration

### Resources


| URI                    | Description |
| ---------------------- | ----------- |
| `mnemo://notes`        | JSON list of all notes |
| `mnemo://notes/{id}`   | Single note as Markdown |
| `mnemo://preferences`  | UI preferences (theme, layout, grouped categories, category colors, Markdown CSS overrides, IDE tab order) — same JSON as `ui-preferences.json`; with Turso, merged from disk + `app_kv` |


### Tools


| Tool                 | Description |
| -------------------- | ----------- |
| `create_note`        | Create a note; optional `tags` (first tag = category path; use `General` for that bucket) |
| `read_note`          | Read a note by ID |
| `update_note`        | Update title, body, tags (first tag = category), `hideHeader` |
| `delete_note`        | Delete a note |
| `search_notes`       | Full-text search |
| `get_backlinks`      | Notes linking to a given note |
| `link_notes`         | Set outgoing wikilinks from source to targets |
| `get_graph`          | Nodes (`id`, `title`, `ref`) and link edges |
| `get_ui_preferences` | Read merged UI preferences (disk + Turso `app_kv` when connected) |
| `set_ui_preferences` | Merge partial preferences (theme, layout, editor toggles, grouped, category subtree scope, category colors, Markdown appearance maps, IDE tab IDs); writes `ui-preferences.json` and mirrors to `app_kv` when the store is Turso |


### Prompts


| Prompt           | Description                               |
| ---------------- | ----------------------------------------- |
| `summarize_note` | Generate a summary of a note              |
| `relate_notes`   | Analyze relationships between two notes   |
| `query_vault`    | Ask a question using the vault as context |


---

## MCP Connection Options

### Option A — Embedded (inside the Electron app)

The MCP server starts automatically. Connect via the in-app **Help** screen which shows the auto-generated Claude Desktop config snippet.

### Option B — Stdio (Claude Desktop / Cursor)

Build the standalone MCP binary:

```bash
npm run build:mcp
```

This produces `dist/mnemo-mcp.js`. Add it to your Claude Desktop config (on Linux with the `.deb` installed you can use `"command": "mnemo"` and `"args": ["mcp", ...]` instead of `node` + the script path):

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


| Shortcut       | Action                         |
| -------------- | ------------------------------ |
| `Ctrl+N`       | New note                       |
| `Ctrl+P`       | Command palette                |
| `Ctrl+G`       | Toggle graph view              |
| `Ctrl+B`       | Toggle sidebar                 |
| `Ctrl+S`       | Save (also auto-saves on edit) |
| `Ctrl+Shift+S` | Save As (export `.md` file)    |
| `Ctrl+O`       | Open / import `.md` file       |
| `Ctrl+Shift+H` | Toggle note header             |
| `Ctrl+Shift+L` | Toggle line numbers            |
| `Ctrl+Shift+N` | Toggle note index numbers (#refs) |
| `Ctrl+M`       | Toggle Markdown helper panel   |
| `Ctrl+,`       | Settings (themes & layout)     |


---

## Project Structure

```
src/
├── main/                        # Electron main process
│   ├── index.ts                 # App entry, IPC handlers
│   ├── mcp/
│   │   ├── server.ts            # MCP server (resources, tools, prompts)
│   │   ├── stdio.ts             # Standalone stdio entry point
│   │   ├── stdio-bootstrap.ts   # Shared MCP stdio bootstrap (CLI + mnemo-mcp.js)
│   │   └── http.ts              # HTTP/SSE entry point (hosted platforms)
│   ├── cli.ts                   # Node CLI bundle (mcp, mcp-http, note)
│   ├── cliCategory.ts           # CLI category path helpers (parity with App tag rules)
│   └── store/
│       ├── NoteStore.ts         # LocalNoteStore — SQLite via better-sqlite3
│       └── TursoNoteStore.ts    # TursoNoteStore — cloud SQLite via @libsql/client
├── preload/
│   └── index.ts                 # contextBridge IPC layer
├── renderer/                    # React UI
│   ├── App.tsx                  # Root component
│   └── components/
│       ├── Editor.tsx           # CodeMirror 6 markdown editor
│       ├── Sidebar.tsx          # Note list + search (MNEMO / Explorer header in IDE layout)
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
npm run build:cli      # Build unified CLI bundle → dist/mnemo-cli.js
npm run package        # Package Electron app for distribution
npm run make           # Build platform installers (.deb + zip on Linux)
```

### Windows shell context menu (dev mode)

The packaged installer registers "Open in Mnemo" automatically via Squirrel hooks. For dev mode, run once:

```powershell
.\scripts\register-shell-windows.ps1 -ExePath '"C:\path\to\out\Mnemo-win32-x64\Mnemo.exe"'
# Remove with:
.\scripts\register-shell-windows.ps1 -Unregister
```

Right-click any `.md` or `.txt` file in Explorer and choose **Open in Mnemo**.

### Linux / GNOME (`.deb`)

The Debian package registers **Mnemo** for `text/markdown` and `text/plain`. Use **Open With** in Files, or set the default app under **Settings → Default Applications**. The menu entry runs `mnemo %U`, which opens the Electron app and forwards file paths.

---

## Deploying the HTTP MCP Server to a VPS

The HTTP/SSE MCP server (`dist/mnemo-mcp-http.js`) is a plain Node.js process. It connects to a shared [Turso](https://turso.tech) database so the same note vault is accessible from the Electron desktop app and from hosted AI platforms simultaneously.

### Prerequisites

- A VPS with Node.js 22 LTS installed (Ubuntu 24.04 recommended — see below)
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

### 2. Build and upload the server bundle

On your local machine:

```powershell
npm run build:mcp-http
```

This produces `dist/mnemo-mcp-http.js`. Upload it along with a minimal `package.json`:

```powershell
# Create deploy package
New-Item -ItemType Directory -Force dist\deploy | Out-Null
Copy-Item dist\mnemo-mcp-http.js dist\deploy\

@'
{
  "name": "mnemo-mcp-http",
  "version": "0.9.0",
  "main": "mnemo-mcp-http.js",
  "dependencies": {
    "express": "*",
    "@libsql/client": "*",
    "@modelcontextprotocol/sdk": "*",
    "zod": "*"
  }
}
'@ | Set-Content dist\deploy\package.json

# Upload (replace YOUR_VPS_IP)
scp -r dist\deploy\* root@YOUR_VPS_IP:/opt/mnemo/
```

### 3. Install Node.js 22 and dependencies on the VPS

```bash
# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs

# Install server dependencies
cd /opt/mnemo
npm install --omit=dev
```

### 4. Set environment variables

Generate a strong random API key and create `/opt/mnemo/.env`:

```bash
openssl rand -hex 32   # use the output as MCP_API_KEY

cat > /opt/mnemo/.env << 'EOF'
TURSO_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-token
MCP_API_KEY=your-strong-random-key
PORT=3001
EOF

chmod 600 /opt/mnemo/.env
```

> Never commit this file to source control.

### 5. Run as a systemd service

```bash
cat > /etc/systemd/system/mnemo-mcp.service << 'EOF'
[Unit]
Description=Mnemo MCP HTTP Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mnemo
EnvironmentFile=/opt/mnemo/.env
ExecStart=/usr/bin/node /opt/mnemo/mnemo-mcp-http.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now mnemo-mcp
systemctl status mnemo-mcp
```

### 6. Expose via nginx with TLS

```bash
apt install -y nginx certbot python3-certbot-nginx

# HTTP-only first (certbot needs port 80 to issue the cert)
cat > /etc/nginx/sites-available/mnemo-mcp << 'EOF'
server {
    listen 80;
    server_name mnemo.yourdomain.com;

    proxy_read_timeout  3600s;
    proxy_send_timeout  3600s;
    proxy_buffering     off;

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   Connection '';
        chunked_transfer_encoding on;
    }
}
EOF

ln -sf /etc/nginx/sites-available/mnemo-mcp /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Obtain TLS cert (certbot rewrites the nginx config to add HTTPS)
certbot --nginx -d mnemo.yourdomain.com
```

### 7. Connect an AI platform

Point your AI client at the SSE endpoint with your API key as a Bearer token:


| Field            | Value                                                |
| ---------------- | ---------------------------------------------------- |
| SSE URL          | `https://mcp.yourdomain.com/sse`                     |
| Auth header      | `Authorization: Bearer <MCP_API_KEY>`                |
| Message endpoint | `https://mcp.yourdomain.com/messages?sessionId=<id>` |


### 8. Health check

```bash
curl https://mcp.yourdomain.com/health
# → {"status":"ok","sessions":0}
```

### 9. Connect the Electron app to the same Turso vault

Create a `.env` file in the repo root (it is gitignored):

```bash
# .env  — never commit this file
MNEMO_TURSO_URL=libsql://your-db.turso.io
MNEMO_TURSO_TOKEN=your-turso-token
```

Then `npm start` as normal. The app reads the `.env` at startup and switches from local SQLite to `TursoNoteStore`, sharing the same database as the hosted MCP server.

To return to local-only storage, delete or comment out both lines.

**Alternatively**, set the variables in your shell before launching:

**Windows (PowerShell):**

```powershell
$env:MNEMO_TURSO_URL = "libsql://your-db.turso.io"
$env:MNEMO_TURSO_TOKEN = "your-turso-token"
npm start
```

**macOS / Linux:**

```bash
MNEMO_TURSO_URL="libsql://your-db.turso.io" \
MNEMO_TURSO_TOKEN="your-turso-token" \
npm start
```

---

## About

Mnemo is built and maintained by [Ferrowood Group, LLC](https://www.ferrowoodgroup.com).

---

## License

MIT © [Ferrowood Group, LLC](https://www.ferrowoodgroup.com)