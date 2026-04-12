import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { NoteListItem } from '../../shared/types';

interface CommandPaletteProps {
  onSelectNote: (id: string) => void;
  onRunCommand: (command: string) => void;
  onClose: () => void;
}

interface CommandDef {
  id: string;
  command: string;
  label: string;
  shortcut?: string;
}

const PALETTE_COMMANDS: CommandDef[] = [
  { id: 'cmd:new-note', command: 'new-note', label: 'New Note', shortcut: 'Ctrl+N' },
  { id: 'cmd:save', command: 'save', label: 'Save', shortcut: 'Ctrl+S' },
  { id: 'cmd:save-as', command: 'save-as', label: 'Save As…', shortcut: 'Ctrl+Shift+S' },
  { id: 'cmd:open', command: 'open', label: 'Import File into Vault…', shortcut: 'Ctrl+O' },
  { id: 'cmd:open-file-tab', command: 'open-file-tab', label: 'Open File as Tab…', shortcut: 'Ctrl+Shift+O' },
  { id: 'cmd:vault-new', command: 'vault-new', label: 'New Vault Workspace…' },
  { id: 'cmd:workspace-choose', command: 'workspace-choose', label: 'Open Workspace Folder…' },
  { id: 'cmd:workspace-sync', command: 'workspace-sync', label: 'Sync Workspace' },
  { id: 'cmd:vault-manage', command: 'vault-manage', label: 'Manage Vault Workspaces…' },
  { id: 'cmd:refresh-notes', command: 'refresh-notes', label: 'Reload Note List' },
  { id: 'cmd:note-next', command: 'note-next', label: 'Next Note', shortcut: 'Ctrl+Tab' },
  { id: 'cmd:note-prev', command: 'note-prev', label: 'Previous Note', shortcut: 'Ctrl+Shift+Tab' },
  { id: 'cmd:toggle-sidebar', command: 'toggle-sidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+B' },
  { id: 'cmd:toggle-header', command: 'toggle-header', label: 'Toggle Note Header', shortcut: 'Ctrl+Shift+H' },
  { id: 'cmd:toggle-line-numbers', command: 'toggle-line-numbers', label: 'Toggle Line Numbers', shortcut: 'Ctrl+Shift+L' },
  { id: 'cmd:toggle-note-refs', command: 'toggle-note-refs', label: 'Toggle Note Index Numbers', shortcut: 'Ctrl+Shift+N' },
  { id: 'cmd:toggle-graph', command: 'toggle-graph', label: 'Toggle Graph', shortcut: 'Ctrl+G' },
  { id: 'cmd:toggle-markdown-help', command: 'toggle-markdown-help', label: 'Markdown Helper', shortcut: 'Ctrl+M' },
  { id: 'cmd:toggle-markdown-preview', command: 'toggle-markdown-preview', label: 'Markdown Preview (GFM + diagrams)', shortcut: 'Ctrl+Shift+V' },
  { id: 'cmd:format-markdown', command: 'format-markdown', label: 'Format Note (Prettier)', shortcut: 'Alt+Shift+F' },
  { id: 'cmd:close-right-panel', command: 'close-right-panel', label: 'Close Side Panel (graph / help)' },
  { id: 'cmd:toggle-grouped', command: 'toggle-grouped', label: 'Toggle Grouped Categories' },
  { id: 'cmd:toggle-category-subtree', command: 'toggle-category-subtree', label: 'Toggle Category Subfolder Scope' },
  { id: 'cmd:layout-inherit', command: 'layout-inherit', label: 'Layout: Use Theme Default' },
  { id: 'cmd:layout-sidebar', command: 'layout-sidebar', label: 'Layout: Sidebar' },
  { id: 'cmd:layout-top', command: 'layout-top', label: 'Layout: Top Navigation' },
  { id: 'cmd:layout-ide', command: 'layout-ide', label: 'Layout: IDE (sidebar + editor)' },
  { id: 'cmd:show-help', command: 'show-help', label: 'Documentation' },
  { id: 'cmd:settings', command: 'settings', label: 'Settings…', shortcut: 'Ctrl+,' },
  { id: 'cmd:quit', command: 'quit', label: 'Quit' },
];

export default function CommandPalette({ onSelectNote, onRunCommand, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<
    Array<{ type: 'note' | 'command'; id: string; label: string; subtitle?: string; action: () => void }>
  >([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo(
    () =>
      PALETTE_COMMANDS.map(c => ({
        ...c,
        action: () => onRunCommand(c.command),
      })),
    [onRunCommand],
  );

  useEffect(() => {
    window.mnemo.notes.list().then(setNotes);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.toLowerCase().trim();
    const items: typeof filteredItems = [];

    const matchesCommand = (label: string, id: string, cmdQuery: string) => {
      if (!cmdQuery) return true;
      const hay = `${label} ${id.replace(/^cmd:/, '')}`.toLowerCase();
      return hay.includes(cmdQuery);
    };

    if (q.startsWith('>') || !q) {
      const cmdQuery = q.startsWith('>') ? q.slice(1).trim() : '';
      for (const cmd of commands) {
        if (!matchesCommand(cmd.label, cmd.id, cmdQuery)) continue;
        items.push({
          type: 'command',
          id: cmd.id,
          label: cmd.label,
          subtitle: cmd.shortcut,
          action: cmd.action,
        });
      }
    }

    if (!q || !q.startsWith('>')) {
      const noteQuery = q.startsWith('>') ? '' : q;
      const matchedNotes = noteQuery
        ? notes.filter(
            n =>
              n.title.toLowerCase().includes(noteQuery) ||
              n.snippet.toLowerCase().includes(noteQuery) ||
              n.tags.some(t => t.toLowerCase().includes(noteQuery)),
          )
        : notes;

      for (const n of matchedNotes.slice(0, 20)) {
        items.push({
          type: 'note',
          id: n.id,
          label: n.title || 'Untitled',
          subtitle: n.snippet,
          action: () => {
            onSelectNote(n.id);
            onClose();
          },
        });
      }
    }

    setFilteredItems(items);
    setSelectedIndex(0);
  }, [query, notes, commands, onSelectNote, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        filteredItems[selectedIndex]?.action();
      }
    },
    [filteredItems, selectedIndex, onClose],
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[560px] max-h-[60vh] bg-mnemo-panel-elevated border border-mnemo-border rounded-xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-4 py-3 border-b border-mnemo-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, or type > for commands"
            className="w-full bg-transparent text-sm text-mnemo-text placeholder-mnemo-dim outline-none"
          />
        </div>

        <div className="overflow-y-auto flex-1">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-mnemo-dim text-xs">No results</div>
          ) : (
            filteredItems.map((item, i) => (
              <div
                key={`${item.type}-${item.id}`}
                onClick={item.action}
                className={`
                  flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors
                  ${i === selectedIndex ? 'bg-mnemo-active' : 'hover:bg-mnemo-hover'}
                `}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      item.type === 'command' ? 'bg-mnemo-active text-mnemo-accent' : 'bg-mnemo-active text-mnemo-dim'
                    }`}
                  >
                    {item.type === 'command' ? '>' : '≡'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-mnemo-muted truncate">{item.label}</div>
                    {item.subtitle != null && item.subtitle !== '' && (
                      <div className="text-[10px] text-mnemo-dim truncate mt-0.5">{item.subtitle}</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-mnemo-border flex items-center gap-4 text-[10px] text-mnemo-dim flex-wrap">
          <span>↑↓ navigate</span>
          <span>⏎ select</span>
          <span>esc close</span>
          <span className="text-mnemo-dim/80">&gt; filters commands</span>
        </div>
      </div>
    </div>
  );
}
