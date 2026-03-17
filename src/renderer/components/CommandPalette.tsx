import { useState, useEffect, useRef, useCallback } from 'react';
import type { NoteListItem } from '../../shared/types';

interface CommandPaletteProps {
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onClose: () => void;
}

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette({ onSelectNote, onCreateNote, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<Array<{ type: 'note' | 'command'; id: string; label: string; subtitle?: string; action: () => void }>>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { id: 'cmd:new', label: 'Create New Note', shortcut: 'Ctrl+N', action: () => { onCreateNote(); onClose(); } },
  ];

  // Load all notes on mount
  useEffect(() => {
    window.mnemo.notes.list().then(setNotes);
    inputRef.current?.focus();
  }, []);

  // Filter as query changes
  useEffect(() => {
    const q = query.toLowerCase().trim();
    const items: typeof filteredItems = [];

    if (!q || !q.startsWith('>')) {
      // Note search mode
      const matchedNotes = q
        ? notes.filter(n =>
            n.title.toLowerCase().includes(q) ||
            n.snippet.toLowerCase().includes(q) ||
            n.tags.some(t => t.toLowerCase().includes(q))
          )
        : notes;

      for (const n of matchedNotes.slice(0, 20)) {
        items.push({
          type: 'note',
          id: n.id,
          label: n.title || 'Untitled',
          subtitle: n.snippet,
          action: () => { onSelectNote(n.id); onClose(); },
        });
      }
    }

    // Commands (show when query starts with > or is empty)
    if (q.startsWith('>') || !q) {
      const cmdQuery = q.startsWith('>') ? q.slice(1).trim() : '';
      for (const cmd of commands) {
        if (!cmdQuery || cmd.label.toLowerCase().includes(cmdQuery)) {
          items.push({
            type: 'command',
            id: cmd.id,
            label: cmd.label,
            subtitle: cmd.shortcut,
            action: cmd.action,
          });
        }
      }
    }

    setFilteredItems(items);
    setSelectedIndex(0);
  }, [query, notes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
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
  }, [filteredItems, selectedIndex, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[560px] max-h-[60vh] bg-[#161616] border border-[#2a2a2a] rounded-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Input */}
        <div className="px-4 py-3 border-b border-[#222]">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes... (type > for commands)"
            className="w-full bg-transparent text-sm text-[#e4e4e7] placeholder-[#555] outline-none"
          />
        </div>

        {/* Results */}
        <div className="overflow-y-auto flex-1">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-6 text-center text-[#555] text-xs">
              No results
            </div>
          ) : (
            filteredItems.map((item, i) => (
              <div
                key={item.id}
                onClick={item.action}
                className={`
                  flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors
                  ${i === selectedIndex ? 'bg-[#1a1a2e]' : 'hover:bg-[#1a1a1a]'}
                `}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    item.type === 'command' ? 'bg-[#2a1a2e] text-[#a77cff]' : 'bg-[#1a1a2e] text-[#555]'
                  }`}>
                    {item.type === 'command' ? '>' : '≡'}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs text-[#ccc] truncate">{item.label}</div>
                    {item.subtitle && (
                      <div className="text-[10px] text-[#555] truncate mt-0.5">{item.subtitle}</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[#222] flex items-center gap-4 text-[10px] text-[#444]">
          <span>↑↓ navigate</span>
          <span>⏎ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
