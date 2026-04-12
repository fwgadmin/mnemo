import {
  KEYBOARD_SHORTCUTS_HEADERS,
  KEYBOARD_SHORTCUTS_ROWS,
  MCP_CLIENT_CONFIG_HEADERS,
  MCP_CLIENT_CONFIG_ROWS,
  MCP_PROMPTS_HEADERS,
  MCP_PROMPTS_ROWS,
  MCP_RESOURCES_HEADERS,
  MCP_RESOURCES_ROWS,
  MCP_STDIO_DEFAULT_NOTE,
  MCP_TOOLS_HEADERS,
  MCP_TOOLS_ROWS,
  USER_GUIDE_PATHS_HEADERS,
  USER_GUIDE_PATHS_ROWS,
} from '../../shared/userGuide';

interface HelpViewProps {
  onClose: () => void;
}

export default function HelpView({ onClose }: HelpViewProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Title bar */}
      <div className="px-8 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mnemo-text">Documentation</h1>
          <div className="mt-1 text-[10px] text-mnemo-dim">System · Read-only</div>
        </div>
        <button
          onClick={onClose}
          className="text-mnemo-dim hover:text-mnemo-muted text-xs px-3 py-1.5 rounded hover:bg-mnemo-hover transition-colors cursor-pointer"
        >
          ✕ Close
        </button>
      </div>
      <div className="mx-8 border-t border-mnemo-border my-2" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 text-mnemo-text text-sm leading-relaxed">
        <div className="max-w-2xl">

          <Section title="What is Mnemo?">
            <p>
              Mnemo is an AI-native, local-first note-taking application designed to serve as a
              memory layer for RAG pipelines and agentic AI systems. Notes live in SQLite with
              FTS5 full-text search and are mirrored as plain Markdown files in a vault directory
              for portability.
            </p>
            <p className="mt-2">
              It exposes your entire knowledge base as a{' '}
              <Mono>Model Context Protocol (MCP)</Mono> server, so AI assistants like Claude
              Desktop and Cursor can read, search, create, and link notes directly.
            </p>
          </Section>

          <Section title="Notes">
            <KV label="Create">
              Click <Mono>+</Mono> in the sidebar, press <Key>Ctrl+N</Key>, or use{' '}
              <Mono>File › New Note</Mono>.
            </KV>
            <KV label="Edit">
              Click any note in the sidebar to open it. The editor supports full Markdown. Notes
              save automatically 500 ms after you stop typing.
            </KV>
            <KV label="Save immediately">
              Press <Key>Ctrl+S</Key> or use <Mono>File › Save</Mono>.
            </KV>
            <KV label="Export">
              <Mono>File › Save As…</Mono> exports the current note to a <Mono>.md</Mono> file on
              disk.
            </KV>
            <KV label="Import">
              <Mono>File › Open…</Mono> imports one or more Markdown files from disk. YAML
              frontmatter is parsed automatically. Each file becomes a new note.
            </KV>
            <KV label="Delete">
              Right-click a note in the sidebar and choose <Mono>Delete</Mono>.
            </KV>
          </Section>

          <Section title="Wikilinks">
            <p>
              Connect notes with double-bracket syntax: <Mono>{'[[Note Title]]'}</Mono>
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-mnemo-text">
              <li>Click a wikilink to navigate to that note.</li>
              <li>If the target note does not exist, Mnemo creates it automatically.</li>
              <li>
                When you save, Mnemo also adds links from plain text: mention another note’s title by
                words (word boundaries), or reference a note by number with <Mono>#42</Mono> or{' '}
                <Mono>ref 42</Mono>.
              </li>
              <li>Backlinks (notes that link <em>to</em> the current note) appear in the panel at the bottom of the editor.</li>
            </ul>
          </Section>

          <Section title="Search &amp; Command Palette">
            <KV label="Sidebar search">
              Type in the search bar to filter notes by full-text search across title, body, and tags.
            </KV>
            <KV label="Reload list from database">
              Click the <Mono>↻</Mono> button in the sidebar header (next to <Mono>+</Mono>) or run{' '}
              <Mono>Reload Note List</Mono> from the command palette (<Key>Ctrl+P</Key>, then <Mono>&gt;</Mono>). That
              re-fetches notes and categories from the database and reloads the open note from disk — useful after
              changes from another machine, MCP, or the CLI. The app also checks periodically in the background when
              the window is visible; if the open note has no unsaved local edits, its body and title update from the
              server automatically (otherwise use ↻ to force a reload from the database).
            </KV>
            <KV label="Command palette">
              Press <Key>Ctrl+P</Key> to open the floating command palette — search notes by title, snippet,
              or tags. Type <Mono>&gt;</Mono> to filter commands (new note, save, layout, graph, settings, …).
            </KV>
          </Section>

          <Section title="Vault workspaces">
            <p>
              Workspaces share one database by default; each workspace id is a <strong>tenant</strong> so notes stay
              isolated. The menu bar shows the active vault — switch without restarting when using the shared connection.
              Optional <strong>Storage</strong> overrides per workspace (dedicated SQLite files or libSQL URL) are edited
              under <Mono>Settings</Mono> (<strong>Workspace</strong> tab → <Mono>Storage…</Mono> on a vault). Use{' '}
              <Mono>File › New Vault Workspace…</Mono> or <Mono>File › Manage Vault Workspaces…</Mono> to create, import,
              archive, or delete profiles (new vaults open immediately after creation).
            </p>
            <p className="mt-2 text-xs text-mnemo-dim leading-relaxed">
              CLI: <Mono>mnemo workspace list</Mono>, <Mono>mnemo workspace new</Mono>, <Mono>mnemo workspace switch</Mono>,{' '}
              <Mono>archive</Mono>, <Mono>delete</Mono>. Note commands use the active workspace when <Mono>--db</Mono> is
              omitted; pass <Mono>--workspace &lt;id&gt;</Mono> for a one-off tenant. MCP stdio: same <Mono>--workspace</Mono>{' '}
              flag, or rely on <Mono>workspace-profiles.json</Mono> when using the bootstrap DB. See{' '}
              <Mono>mnemo help workspace</Mono> and <Mono>mnemo help mcp</Mono>.
            </p>
          </Section>

          <Section title="Categories &amp; Tags">
            <p>
              Notes can be grouped in the sidebar by category. The <strong>first tag</strong> on a
              note determines its folder path (nested segments use <Mono>/</Mono>, e.g.{' '}
              <Mono>Work/Meetings</Mono>).
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-mnemo-text">
              <li>
                Right-click a note and choose <Mono>Set Category</Mono> to assign or change it (searchable
                combobox: <Mono>General</Mono>, <Mono>Unassigned</Mono>, or any path).
              </li>
              <li>
                Click the grid icon (<Mono>⊞</Mono>) in the sidebar header to toggle grouped view.
              </li>
              <li>
                <strong>General</strong> is the default bucket when the vault has no other categories, or
                when the first tag is explicitly <Mono>General</Mono>.
              </li>
              <li>
                <strong>Unassigned</strong> lists notes with no first tag when at least one other note has
                a category — so uncategorized notes stay visible when you start using folders.
              </li>
              <li>
                In grouped view or IDE Explorer, right-click a category header for{' '}
                <Mono>Rename</Mono>, <Mono>Promote</Mono>, <Mono>Demote</Mono>, folder colors,{' '}
                <strong>Archive folder</strong> (moves every note in that tree under <Mono>Archive/…</Mono>), or{' '}
                <strong>Delete folder</strong> (permanently deletes all notes in that tree). Folders already under{' '}
                <Mono>Archive/…</Mono> cannot be archived again from the menu.
              </li>
              <li>
                <strong>Rename</strong> moves every note whose <strong>first tag equals that folder path
                exactly</strong> (e.g. <Mono>Work</Mono>) — not notes only under a nested path such as{' '}
                <Mono>Work/Meetings</Mono>. Type the new path and press Enter to apply.
              </li>
              <li>Groups are collapsible — click the group heading to expand or collapse.</li>
            </ul>
            <p className="mt-3 text-mnemo-dim text-xs leading-relaxed">
              CLI: <Mono>mnemo note categories</Mono>, <Mono>mnemo note set-category</Mono>,{' '}
              <Mono>mnemo note category rename|promote|demote</Mono> — same folder semantics as the app.
            </p>
          </Section>

          <Section title="Graph View">
            <p>
              Press <Key>Ctrl+G</Key> or use <Mono>View › Toggle Graph</Mono> to open the
              force-directed knowledge graph. Nodes are notes; edges are outgoing links (wikilinks + inferred).
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-mnemo-text">
              <li><strong>Click</strong> a node to open that note.</li>
              <li><strong>Drag</strong> to reposition nodes.</li>
              <li><strong>Scroll</strong> to zoom in/out.</li>
            </ul>
          </Section>

          <Section title="View Options">
            <KV label="Fullscreen">
              Press <Key>F11</Key> to toggle OS fullscreen (Linux and Windows). On macOS, use <Mono>View › Toggle Full Screen</Mono>{' '}
              (<Key>Ctrl+Cmd+F</Key>) or <Key>F11</Key> — the app does not use a global menu bar on Linux/Windows, so fullscreen must be wired in-app.
            </KV>
            <KV label="Toggle Sidebar">
              <Key>Ctrl+B</Key> or <Mono>View › Toggle Sidebar</Mono>. When hidden, hover the
              left edge to reveal a re-open strip.
            </KV>
            <KV label="Switch notes">
              <Key>Ctrl+Tab</Key> / <Key>Ctrl+Shift+Tab</Key>, or <Key>Ctrl+Page Down</Key> / <Key>Ctrl+Page Up</Key>, move
              through the current note list (search results or full vault). <Key>Alt+↑</Key> / <Key>Alt+↓</Key> do the same when focus is
              not in an input or the editor. Also under <Mono>View › Next/Previous Note</Mono>.
            </KV>
            <KV label="Toggle Note Header">
              <Key>Ctrl+Shift+H</Key> or <Mono>View › Toggle Note Header</Mono> sets the default for all notes. For a single note,
              right-click it in the sidebar and choose <Mono>Hide editor header</Mono> or{' '}
              <Mono>Show editor header</Mono> (stored per note). Use <Mono>Rename note…</Mono> in that
              menu when the title field is hidden.
            </KV>
            <KV label="Themes &amp; layout">
              <strong>Default:</strong> Dark (IDE) — category tree and editor with tabs. <Key>Ctrl+,</Key> opens{' '}
              <Mono>Settings</Mono> (tabbed: <strong>General</strong> for theme and layout; <strong>Markdown</strong> for
              preview typography; <strong>Workspace</strong> for disk folder sync and vaults; <strong>Database</strong> for
              remote libSQL). Command palette (<Key>Ctrl+P</Key>) includes layout commands when you type <Mono>&gt;</Mono>.
            </KV>
            <KV label="Markdown helper">
              <Key>Ctrl+M</Key> toggles the Markdown reference side panel.
            </KV>
          </Section>

          <Section title="MCP Integration">
            <p>
              Mnemo exposes your vault as an MCP <strong>server</strong>. External AI clients
              such as Claude Desktop, Cursor, or Copilot connect to it via a <strong>stdio
              subprocess</strong> — meaning the client spawns a dedicated Mnemo process rather
              than connecting to the running GUI app over a port.
            </p>

            <SubSection title="Resources">
              <Table headers={[...MCP_RESOURCES_HEADERS]} rows={MCP_RESOURCES_ROWS} />
            </SubSection>

            <SubSection title="Tools">
              <Table headers={[...MCP_TOOLS_HEADERS]} rows={MCP_TOOLS_ROWS} />
            </SubSection>

            <SubSection title="Prompts">
              <Table headers={[...MCP_PROMPTS_HEADERS]} rows={MCP_PROMPTS_ROWS} />
            </SubSection>

            <SubSection title="Connecting to your vault">
              <p className="text-mnemo-text">
                MCP clients like Claude Desktop and Cursor don't connect to the running Mnemo
                window — instead they <strong>spawn a separate lightweight subprocess</strong> that
                speaks directly to your database. You need to build that subprocess once, then
                point your client at it.
              </p>
              <p className="mt-3 font-medium text-mnemo-text">Step 1 — build the MCP server file</p>
              <p className="mt-1 text-mnemo-text">
                In the Mnemo project folder, run:
              </p>
              <CodeBlock>{`npm run build:mcp`}</CodeBlock>
              <p className="mt-1 text-mnemo-text">
                This produces <Mono>dist/mnemo-mcp.js</Mono> next to your source code. You only
                need to do this once (or after updating Mnemo).
              </p>

              <p className="mt-3 font-medium text-mnemo-text">Step 2 — find your data paths</p>
              <p className="mt-1 text-mnemo-text">Your notes live next to <Mono>workspace-profiles.json</Mono> and{' '}
              <Mono>config.json</Mono> in your OS app-data directory (package name <Mono>mnemo-note</Mono> on most systems):</p>
              <Table headers={[...USER_GUIDE_PATHS_HEADERS]} rows={USER_GUIDE_PATHS_ROWS} />
              <p className="mt-2 text-mnemo-dim text-xs leading-relaxed">{MCP_STDIO_DEFAULT_NOTE}</p>
              <p className="mt-2 text-mnemo-text text-xs leading-relaxed">
                To match a specific vault from the GUI (not the active one), add{' '}
                <Mono>&quot;--workspace&quot;, &quot;&lt;workspace-id&gt;&quot;</Mono> to <Mono>args</Mono> after{' '}
                <Mono>mnemo-mcp.js</Mono>. Tools and resources use that vault’s tenant; UI preference tools follow the same
                workspace for namespaced prefs.
              </p>

              <p className="mt-3 font-medium text-mnemo-text">Step 3 — configure your MCP client</p>
              <p className="mt-1 text-mnemo-text">
                Open your client's config file and add a <Mono>mnemo</Mono> entry. Config file
                locations:
              </p>
              <Table headers={[...MCP_CLIENT_CONFIG_HEADERS]} rows={MCP_CLIENT_CONFIG_ROWS} />
              <p className="mt-2 font-medium text-mnemo-text">Minimal (same bootstrap DB as GUI — set MNEMO_HOME)</p>
              <CodeBlock>{`{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": ["/path/to/mnemo/dist/mnemo-mcp.js"],
      "env": { "MNEMO_HOME": "/path/to/your/mnemo-userData" }
    }
  }
}`}</CodeBlock>
              <p className="mt-2 font-medium text-mnemo-text">Windows (explicit db + vault paths)</p>
              <CodeBlock>{`{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": [
        "C:/path/to/mnemo/dist/mnemo-mcp.js",
        "--db",    "C:/Users/YOU/AppData/Roaming/mnemo-note/mnemo.db",
        "--vault", "C:/Users/YOU/AppData/Roaming/mnemo-note/vault"
      ]
    }
  }
}`}</CodeBlock>
              <p className="mt-2 font-medium text-mnemo-text">macOS</p>
              <CodeBlock>{`{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": [
        "/path/to/mnemo/dist/mnemo-mcp.js",
        "--db",    "/Users/YOU/Library/Application Support/mnemo-note/mnemo.db",
        "--vault", "/Users/YOU/Library/Application Support/mnemo-note/vault"
      ]
    }
  }
}`}</CodeBlock>
              <p className="mt-2 font-medium text-mnemo-text">Linux</p>
              <CodeBlock>{`{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": [
        "/path/to/mnemo/dist/mnemo-mcp.js",
        "--db",    "/home/YOU/.config/mnemo-note/mnemo.db",
        "--vault", "/home/YOU/.config/mnemo-note/vault"
      ]
    }
  }
}`}</CodeBlock>
              <p className="mt-2 text-mnemo-text">
                The GUI app and the MCP subprocess <strong>share the same database</strong>. With a <strong>local</strong>{' '}
                SQLite file, changes from MCP or the CLI show up as soon as the app reloads the list. With <strong>remote
                libSQL</strong> (Turso), updates from other devices or agents sync over the network; use the sidebar{' '}
                <Mono>↻</Mono> button or <Mono>Reload Note List</Mono> from the command palette to pull the latest notes
                and categories, or wait for the automatic background check.
              </p>
            </SubSection>

            <SubSection title="About Prompts (summarize_note, relate_notes, query_vault)">
              <p className="text-mnemo-text">
                These are <strong>MCP Prompt templates</strong>, not self-executing tools. When
                invoked, Mnemo fetches the requested note(s) from the database and assembles a
                ready-to-send message — for example:
              </p>
              <CodeBlock>{`Please summarize the following note titled "My Note":\n\n[note body here]`}</CodeBlock>
              <p className="mt-2 text-mnemo-text">
                That message is handed to whichever LLM your MCP client has connected (e.g.
                Claude, GPT-4o). <strong>Mnemo itself performs no summarization</strong> — it only
                prepares the prompt. Without a connected LLM, calling these prompts returns the
                raw formatted text with no summary or analysis.
              </p>
            </SubSection>
          </Section>

          <Section title="Syntax Highlighting">
            <p>
              The editor uses <Mono>CodeMirror 6</Mono> with full Markdown syntax highlighting.
              Fenced code blocks are highlighted in the language of their tag:
            </p>
            <CodeBlock>{`\`\`\`javascript
console.log('hello world');
\`\`\`

\`\`\`python
def greet(name: str) -> str:
    return f"Hello, {name}!"
\`\`\`

\`\`\`sql
SELECT * FROM notes WHERE title LIKE '%mnemo%';
\`\`\``}</CodeBlock>

            <SubSection title="Supported language tags">
              <p className="text-mnemo-text mb-2">
                Any language from the CodeMirror language-data registry is supported. Common ones:
              </p>
              <Table
                headers={['Tag', 'Language']}
                rows={[
                  ['javascript / js', 'JavaScript'],
                  ['typescript / ts', 'TypeScript'],
                  ['jsx / tsx', 'React JSX / TSX'],
                  ['python', 'Python'],
                  ['sql', 'SQL'],
                  ['html', 'HTML'],
                  ['css', 'CSS'],
                  ['json', 'JSON'],
                  ['yaml', 'YAML'],
                  ['markdown / md', 'Markdown'],
                  ['bash / sh / shell', 'Shell / Bash'],
                  ['rust', 'Rust'],
                  ['go', 'Go'],
                  ['java', 'Java'],
                  ['cpp / c++', 'C++'],
                  ['csharp / c#', 'C#'],
                  ['ruby', 'Ruby'],
                  ['php', 'PHP'],
                  ['swift', 'Swift'],
                  ['kotlin', 'Kotlin'],
                ]}
              />
            </SubSection>

            <SubSection title="Inline Markdown">
              <Table
                headers={['Syntax', 'Result']}
                rows={[
                  ['**bold**', 'Bold text'],
                  ['*italic* or _italic_', 'Italic text'],
                  ['`inline code`', 'Inline code (monospace)'],
                  ['# Heading 1 … ###### Heading 6', 'Headings'],
                  ['> quoted text', 'Blockquote'],
                  ['- item or * item', 'Unordered list'],
                  ['1. item', 'Ordered list'],
                  ['--- or ***', 'Horizontal rule'],
                  ['[[Note Title]]', 'Wikilink to another note'],
                ]}
              />
            </SubSection>
          </Section>

          <Section title="Keyboard Shortcuts">
            <Table headers={[...KEYBOARD_SHORTCUTS_HEADERS]} rows={KEYBOARD_SHORTCUTS_ROWS} />
          </Section>

          <Section title="Data Storage">
            <p>Every note is stored in two places under your app data folder (see table below; package id is often mnemo-note):</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-mnemo-text">
              <li>
                <strong>SQLite database</strong> — <Mono>mnemo.db</Mono> — powers FTS5 search, link tracking, and metadata.
                Multiple <strong>workspaces</strong> (tenants) share one file by default; optional per-workspace storage uses
                separate files (see Settings → Workspace → Storage).
              </li>
              <li>
                <strong>Markdown vault</strong> — <Mono>vault/*.md</Mono> — plain Markdown with YAML frontmatter.
                Git-friendly and safe to back up.
              </li>
            </ul>
            <p className="mt-3 text-mnemo-text text-sm">Default paths</p>
            <Table headers={[...USER_GUIDE_PATHS_HEADERS]} rows={USER_GUIDE_PATHS_ROWS} />
            <p className="mt-3 text-mnemo-dim text-xs leading-relaxed">
              The <Mono>mnemo note</Mono> CLI and MCP stdio server use the same bootstrap paths as the GUI when{' '}
              <Mono>--db</Mono> is omitted. Set <Mono>MNEMO_HOME</Mono> to your app userData directory so the terminal,
              MCP, and GUI share one database and <Mono>workspace-profiles.json</Mono>.
            </p>
          </Section>

        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-mnemo-text mb-3 pb-1.5 border-b border-mnemo-border">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-mnemo-dim mb-2">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mt-2 text-mnemo-text">
      <span className="min-w-[110px] text-mnemo-dim text-xs pt-0.5">{label}</span>
      <span className="flex-1 text-sm">{children}</span>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-mnemo-panel-elevated border border-mnemo-border-strong text-mnemo-text font-mono leading-none">
      {children}
    </kbd>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="px-1 py-0.5 rounded text-[12px] bg-mnemo-panel-elevated text-mnemo-accent">{children}</code>;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 p-3 rounded bg-mnemo-panel border border-mnemo-border text-[11px] text-mnemo-text font-mono overflow-x-auto leading-relaxed whitespace-pre">
      {children}
    </pre>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table className="w-full text-[12px] mt-2 border-collapse">
      <thead>
        <tr>
          {headers.map(h => (
            <th key={h} className="text-left text-[11px] uppercase tracking-wider text-mnemo-dim pb-1.5 border-b border-mnemo-border pr-6">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-mnemo-border">
            {row.map((cell, j) => (
              <td key={j} className={`py-1.5 pr-6 ${j === 0 ? 'text-mnemo-accent font-mono' : 'text-mnemo-text'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
