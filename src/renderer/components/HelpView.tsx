interface HelpViewProps {
  onClose: () => void;
}

export default function HelpView({ onClose }: HelpViewProps) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Title bar */}
      <div className="px-8 pt-6 pb-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#e4e4e7]">Documentation</h1>
          <div className="mt-1 text-[10px] text-[#555]">System · Read-only</div>
        </div>
        <button
          onClick={onClose}
          className="text-[#555] hover:text-[#aaa] text-xs px-3 py-1.5 rounded hover:bg-[#1e1e1e] transition-colors cursor-pointer"
        >
          ✕ Close
        </button>
      </div>
      <div className="mx-8 border-t border-[#1a1a1a] my-2" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8 text-[#ccc] text-sm leading-relaxed">
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
            <ul className="mt-2 space-y-1 list-disc list-inside text-[#aaa]">
              <li>Click a wikilink to navigate to that note.</li>
              <li>If the target note does not exist, Mnemo creates it automatically.</li>
              <li>Backlinks (notes that link <em>to</em> the current note) appear in the panel at the bottom of the editor.</li>
            </ul>
          </Section>

          <Section title="Search &amp; Command Palette">
            <KV label="Sidebar search">
              Type in the search bar to filter notes by full-text search across title, body, and tags.
            </KV>
            <KV label="Command palette">
              Press <Key>Ctrl+P</Key> to open the floating command palette — fuzzy search across all
              notes. Type <Mono>&gt;</Mono> to switch to command mode and run actions.
            </KV>
          </Section>

          <Section title="Categories &amp; Tags">
            <p>
              Notes can be grouped in the sidebar by category. The <strong>first tag</strong> on a
              note determines its category.
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-[#aaa]">
              <li>
                Right-click any note and choose <Mono>Set Category</Mono> to assign or change it.
              </li>
              <li>
                Click the grid icon (<Mono>⊞</Mono>) in the sidebar header to toggle grouped view.
              </li>
              <li>Notes without a tag appear under <Mono>General</Mono>.</li>
              <li>Groups are collapsible — click the group heading to expand or collapse.</li>
            </ul>
          </Section>

          <Section title="Graph View">
            <p>
              Press <Key>Ctrl+G</Key> or use <Mono>View › Toggle Graph</Mono> to open the
              force-directed knowledge graph. Nodes are notes; edges are wikilinks.
            </p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-[#aaa]">
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
              <Mono>View › Toggle Note Header</Mono> hides the title input and metadata bar,
              reducing padding for a more focused writing area.
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
                ]}
              />
            </SubSection>

            <SubSection title="Tools">
              <Table
                headers={['Tool', 'Description']}
                rows={[
                  ['create_note', 'Create a new note'],
                  ['read_note', 'Read a note by ID'],
                  ['update_note', 'Update title, body, or tags'],
                  ['delete_note', 'Delete a note'],
                  ['search_notes', 'Full-text search'],
                  ['get_backlinks', 'Get notes linking to a given note'],
                  ['link_notes', 'Set outgoing wikilinks from source to targets'],
                  ['get_graph', 'Return the full node/edge graph'],
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
              <p className="text-[#aaa]">
                MCP clients like Claude Desktop and Cursor don't connect to the running Mnemo
                window — instead they <strong>spawn a separate lightweight subprocess</strong> that
                speaks directly to your database. You need to build that subprocess once, then
                point your client at it.
              </p>
              <p className="mt-3 font-medium text-[#ccc]">Step 1 — build the MCP server file</p>
              <p className="mt-1 text-[#aaa]">
                In the Mnemo project folder, run:
              </p>
              <CodeBlock>{`npm run build:mcp`}</CodeBlock>
              <p className="mt-1 text-[#aaa]">
                This produces <Mono>dist/mnemo-mcp.js</Mono> next to your source code. You only
                need to do this once (or after updating Mnemo).
              </p>

              <p className="mt-3 font-medium text-[#ccc]">Step 2 — find your data paths</p>
              <p className="mt-1 text-[#aaa]">Your notes are stored here:</p>
              <Table
                headers={['File', 'Path']}
                rows={[
                  ['Database', '%APPDATA%\\Mnemo\\mnemo.db'],
                  ['Vault', '%APPDATA%\\Mnemo\\vault'],
                ]}
              />
              <p className="mt-1 text-[#aaa]">
                On Windows, <Mono>%APPDATA%</Mono> is typically{' '}
                <Mono>C:\Users\YOU\AppData\Roaming</Mono>.
              </p>

              <p className="mt-3 font-medium text-[#ccc]">Step 3 — configure your MCP client</p>
              <p className="mt-1 text-[#aaa]">
                <strong>Claude Desktop</strong> — open{' '}
                <Mono>%APPDATA%\Claude\claude_desktop_config.json</Mono> and add:
              </p>
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
              <p className="mt-2 text-[#aaa]">
                <strong>Cursor / VS Code</strong> — add the same <Mono>mnemo</Mono> block to
                your workspace or user MCP settings JSON.
              </p>
              <p className="mt-2 text-[#aaa]">
                The GUI app and the MCP subprocess <strong>share the same database</strong>, so
                any notes created or edited by an AI agent appear immediately in the Mnemo window.
              </p>
            </SubSection>

            <SubSection title="About Prompts (summarize_note, relate_notes, query_vault)">
              <p className="text-[#aaa]">
                These are <strong>MCP Prompt templates</strong>, not self-executing tools. When
                invoked, Mnemo fetches the requested note(s) from the database and assembles a
                ready-to-send message — for example:
              </p>
              <CodeBlock>{`Please summarize the following note titled "My Note":\n\n[note body here]`}</CodeBlock>
              <p className="mt-2 text-[#aaa]">
                That message is handed to whichever LLM your MCP client has connected (e.g.
                Claude, GPT-4o). <strong>Mnemo itself performs no summarization</strong> — it only
                prepares the prompt. Without a connected LLM, calling these prompts returns the
                raw formatted text with no summary or analysis.
              </p>
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
              ]}
            />
          </Section>

          <Section title="Data Storage">
            <p>Every note is stored in two places:</p>
            <ul className="mt-2 space-y-1 list-disc list-inside text-[#aaa]">
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
      <h2 className="text-base font-semibold text-[#e4e4e7] mb-3 pb-1.5 border-b border-[#1e1e1e]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#666] mb-2">{title}</h3>
      {children}
    </div>
  );
}

function KV({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 mt-2 text-[#aaa]">
      <span className="min-w-[110px] text-[#666] text-xs pt-0.5">{label}</span>
      <span className="flex-1 text-sm">{children}</span>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded text-[11px] bg-[#1e1e1e] border border-[#333] text-[#ccc] font-mono leading-none">
      {children}
    </kbd>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <code className="px-1 py-0.5 rounded text-[12px] bg-[#1a1a1a] text-[#a78bfa]">{children}</code>;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-2 p-3 rounded bg-[#111] border border-[#1e1e1e] text-[11px] text-[#aaa] font-mono overflow-x-auto leading-relaxed whitespace-pre">
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
            <th key={h} className="text-left text-[11px] uppercase tracking-wider text-[#555] pb-1.5 border-b border-[#1e1e1e] pr-6">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-[#111]">
            {row.map((cell, j) => (
              <td key={j} className={`py-1.5 pr-6 ${j === 0 ? 'text-[#7c7cff] font-mono' : 'text-[#aaa]'}`}>
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
