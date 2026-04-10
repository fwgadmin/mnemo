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
            <KV label="Command palette">
              Press <Key>Ctrl+P</Key> to open the floating command palette — search notes by title, snippet,
              or tags. Type <Mono>&gt;</Mono> to filter commands (new note, save, layout, graph, settings, …).
            </KV>
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
                In grouped view or IDE Solution Explorer, right-click a category header for{' '}
                <Mono>Rename</Mono>, <Mono>Promote</Mono>, <Mono>Demote</Mono>, and folder colors (see
                Settings for details).
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
            <KV label="Toggle Sidebar">
              <Key>Ctrl+B</Key> or <Mono>View › Toggle Sidebar</Mono>. When hidden, hover the
              left edge to reveal a re-open strip.
            </KV>
            <KV label="Toggle Note Header">
              <Key>Ctrl+Shift+H</Key> or <Mono>View › Toggle Note Header</Mono> sets the default for all notes. For a single note,
              right-click it in the sidebar and choose <Mono>Hide editor header</Mono> or{' '}
              <Mono>Show editor header</Mono> (stored per note). Use <Mono>Rename note…</Mono> in that
              menu when the title field is hidden.
            </KV>
            <KV label="Themes &amp; layout">
              <Key>Ctrl+,</Key> opens <Mono>Settings</Mono>: choose a theme (including dark/light with top bar or IDE tabs),
              and override layout (classic sidebar, top navigation, or IDE tabs). Command palette (<Key>Ctrl+P</Key>){' '}
              includes layout commands when you type <Mono>&gt;</Mono>.
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
              <Table
                headers={['URI', 'Description']}
                rows={[
                  ['mnemo://notes', 'JSON list of all notes'],
                  ['mnemo://notes/{id}', 'Single note content as Markdown'],
                  ['mnemo://preferences', 'UI preferences JSON (theme, layout, grouped categories, category colors, IDE tab order) — same as Settings / ui-preferences.json'],
                ]}
              />
            </SubSection>

            <SubSection title="Tools">
              <Table
                headers={['Tool', 'Description']}
                rows={[
                  ['create_note', 'Create a note; optional tags (first tag = category path)'],
                  ['read_note', 'Read a note by ID'],
                  ['update_note', 'Update title, body, tags (first tag = category), hideHeader'],
                  ['delete_note', 'Delete a note'],
                  ['search_notes', 'Full-text search'],
                  ['get_backlinks', 'Get notes linking to a given note'],
                  ['link_notes', 'Set outgoing wikilinks from source to targets'],
                  ['get_graph', 'Full note graph (nodes include id, title, ref; edges are links)'],
                  ['get_ui_preferences', 'Read UI preferences from disk'],
                  ['set_ui_preferences', 'Merge partial UI preferences (theme, layoutOverride, grouped, categoryColors, …)'],
                ]}
              />
            </SubSection>

            <SubSection title="Prompts">
              <Table
                headers={['Prompt', 'Description']}
                rows={[
                  ['summarize_note', 'Generate a concise summary of a note'],
                  ['relate_notes', 'Analyze relationships between two notes'],
                  ['query_vault', 'Answer a question using the full vault as context'],
                ]}
              />
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
              <p className="mt-1 text-mnemo-text">Your notes are stored in your OS app-data directory:</p>
              <Table
                headers={['OS', 'Database', 'Vault']}
                rows={[
                  ['Windows', '%APPDATA%\\Mnemo\\mnemo.db', '%APPDATA%\\Mnemo\\vault'],
                  ['macOS', '~/Library/Application Support/Mnemo/mnemo.db', '~/Library/Application Support/Mnemo/vault'],
                  ['Linux (Electron app)', '~/.config/Mnemo/mnemo.db', '~/.config/Mnemo/vault'],
                  ['Linux (CLI / MCP default)', '~/.local/share/mnemo/mnemo.db', '~/.local/share/mnemo/vault'],
                ]}
              />

              <p className="mt-3 font-medium text-mnemo-text">Step 3 — configure your MCP client</p>
              <p className="mt-1 text-mnemo-text">
                Open your client's config file and add a <Mono>mnemo</Mono> entry. Config file
                locations:
              </p>
              <Table
                headers={['Client', 'Config file']}
                rows={[
                  ['Claude Desktop (Windows)', '%APPDATA%\\Claude\\claude_desktop_config.json'],
                  ['Claude Desktop (macOS)', '~/Library/Application Support/Claude/claude_desktop_config.json'],
                  ['Cursor', '.cursor/mcp.json in your project, or global settings → MCP'],
                  ['VS Code (Copilot)', '.vscode/mcp.json in your project'],
                ]}
              />
              <p className="mt-2 font-medium text-mnemo-text">Windows</p>
              <CodeBlock>{`{
  "mcpServers": {
    "mnemo": {
      "command": "node",
      "args": [
        "C:/path/to/mnemo/dist/mnemo-mcp.js",
        "--db",    "C:/Users/YOU/AppData/Roaming/Mnemo/mnemo.db",
        "--vault", "C:/Users/YOU/AppData/Roaming/Mnemo/vault"
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
        "--db",    "/Users/YOU/Library/Application Support/Mnemo/mnemo.db",
        "--vault", "/Users/YOU/Library/Application Support/Mnemo/vault"
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
        "--db",    "/home/YOU/.config/Mnemo/mnemo.db",
        "--vault", "/home/YOU/.config/Mnemo/vault"
      ]
    }
  }
}`}</CodeBlock>
              <p className="mt-2 text-mnemo-text">
                The GUI app and the MCP subprocess <strong>share the same database</strong>, so
                any notes created or edited by an AI agent appear immediately in the Mnemo window.
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
            <Table
              headers={['Shortcut', 'Action']}
              rows={[
                ['Ctrl+N', 'New note'],
                ['Ctrl+S', 'Save immediately'],
                ['Ctrl+Shift+S', 'Save As (export .md)'],
                ['Ctrl+O', 'Open / import .md file'],
                ['Ctrl+P', 'Command palette'],
                ['Ctrl+G', 'Toggle graph view'],
                ['Ctrl+B', 'Toggle sidebar'],
                ['Ctrl+M', 'Toggle Markdown helper panel'],
                ['Ctrl+Shift+H', 'Toggle note header'],
                ['Ctrl+Shift+L', 'Toggle line numbers'],
                ['Ctrl+Shift+N', 'Toggle note index numbers (#refs)'],
                ['Ctrl+,', 'Settings (themes, layout)'],
              ]}
            />
          </Section>

          <Section title="Data Storage">
            <p>Every note is stored in two places:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-mnemo-text">
              <li>
                <strong>SQLite database</strong> — <Mono>%APPDATA%/Mnemo/mnemo.db</Mono> — powers
                fast FTS5 search, link tracking, and metadata queries.
              </li>
              <li>
                <strong>Markdown vault</strong> — <Mono>%APPDATA%/Mnemo/vault/*.md</Mono> — plain
                Markdown files with YAML frontmatter. Git-friendly, Obsidian-compatible, and safe
                to back up or sync.
              </li>
            </ul>
            <p className="mt-3 text-mnemo-dim text-xs leading-relaxed">
              The <Mono>mnemo note</Mono> CLI and MCP stdio server default to XDG data{' '}
              <Mono>~/.local/share/mnemo</Mono> (Linux) unless <Mono>MNEMO_HOME</Mono> is set. Set{' '}
              <Mono>MNEMO_HOME</Mono> to your app userData directory so the terminal and GUI share one vault.
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
