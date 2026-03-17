# Mnemo

AI-native memory layer — notes, embeddings, and MCP for intelligence systems.

Mnemo is a local-first note-taking app built for use alongside RAG pipelines and agentic workflows. It exposes your knowledge base as an [MCP](https://modelcontextprotocol.io) server so AI assistants (Claude Desktop, Cursor, etc.) can read, search, create, and link notes directly.

## Features

- **Markdown editor** — CodeMirror 6 with syntax highlighting, wikilink decorations, and auto-save
- **Wikilinks & backlinks** — `[[Note Title]]` syntax with automatic link resolution and a backlinks panel
- **Full-text search** — SQLite FTS5 across titles, bodies, and tags
- **Knowledge graph** — Force-directed d3 canvas visualization of note connections
- **Command palette** — Fuzzy note search and commands via `Ctrl+P`
- **MCP server** — Exposes resources, tools, and prompts for external AI agents
- **Standalone MCP mode** — Run headlessly via stdio for Claude Desktop / Cursor integration
- **Multi-tenant** — Tenant-scoped notes for separating knowledge bases
- **Flat-file vault** — Every note synced to `vault/` as Markdown with YAML frontmatter

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Shell | Electron 41 |
| UI | React 19, Tailwind CSS 3 |
| Editor | CodeMirror 6 |
| Storage | SQLite (better-sqlite3) with WAL + FTS5 |
| Graph | d3-force (canvas) |
| AI Integration | Model Context Protocol SDK |
| Build | Electron Forge + Webpack |
| Language | TypeScript (strict) |

## Getting Started

```bash
# Clone
git clone https://github.com/fwgadmin/mnemo.git
cd mnemo

# Install
npm install

# Run
npm start
```

## MCP Integration

### Embedded (inside Electron)

The MCP server starts automatically with the app. It provides:

**Resources**
| URI | Description |
|-----|-------------|
| `mnemo://notes` | JSON list of all notes |
| `mnemo://notes/{id}` | Single note as Markdown |

**Tools**
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

**Prompts**
| Prompt | Description |
|--------|-------------|
| `summarize_note` | Generate a summary of a note |
| `relate_notes` | Analyze relationships between two notes |
| `query_vault` | Ask a question using the vault as context |

### Standalone (stdio)

Run Mnemo as a headless MCP server for Claude Desktop, Cursor, or any MCP client:

```bash
npx ts-node src/main/mcp/stdio.ts --db ./mnemo.db --vault ./vault
```

Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": ["path/to/mnemo/dist/mcp/stdio.js", "--db", "path/to/mnemo.db", "--vault", "path/to/vault"]
    }
  }
}
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New note |
| `Ctrl+P` | Command palette |
| `Ctrl+G` | Toggle graph view |
| `Ctrl+S` | Save (also auto-saves on edit) |

## Project Structure

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # App entry, IPC handlers
│   ├── mcp/
│   │   ├── server.ts      # MCP server (resources, tools, prompts)
│   │   └── stdio.ts       # Standalone stdio entry point
│   └── store/
│       └── NoteStore.ts   # SQLite CRUD, FTS5, vault sync
├── preload/
│   └── index.ts           # contextBridge IPC layer
├── renderer/              # React UI
│   ├── App.tsx            # Root component
│   └── components/
│       ├── Editor.tsx           # CodeMirror 6 markdown editor
│       ├── Sidebar.tsx          # Note list + search
│       ├── BacklinksPanel.tsx   # Incoming links panel
│       ├── GraphView.tsx        # d3-force canvas graph
│       ├── CommandPalette.tsx   # Fuzzy search + commands
│       └── wikilinkPlugin.ts   # CM6 wikilink decorations
└── shared/
    └── types.ts           # Shared TypeScript types
```

## Scripts

```bash
npm start        # Dev mode with hot reload
npm run lint     # TypeScript type-check
npm run package  # Package for distribution
npm run make     # Build platform installers
```

## License

MIT
