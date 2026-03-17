import { useState, useRef, useCallback } from 'react';
import type { NoteListItem } from '../../shared/types';

interface SidebarProps {
  notes: NoteListItem[];
  activeNoteId: string | null;
  searchQuery: string;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  onSearch: (query: string) => void;
}

export default function Sidebar({
  notes,
  activeNoteId,
  searchQuery,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onSearch,
}: SidebarProps) {
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenuId(noteId === contextMenuId ? null : noteId);
  }, [contextMenuId]);

  return (
    <aside className="w-64 min-w-[200px] h-full flex flex-col border-r border-[#1e1e1e] bg-[#111]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
        <span className="text-sm font-semibold tracking-wide text-[#888]">
          MNEMO
        </span>
        <button
          onClick={onCreateNote}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#252525] text-[#888] hover:text-[#ccc] transition-colors cursor-pointer"
          title="New Note"
        >
          +
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search notes..."
          className="w-full px-3 py-1.5 text-xs bg-[#1a1a1a] border border-[#282828] rounded-md text-[#ccc] placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
        />
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {notes.length === 0 ? (
          <div className="px-3 py-8 text-center text-[#555] text-xs">
            {searchQuery ? 'No results' : 'No notes yet'}
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              onClick={() => onSelectNote(note.id)}
              onContextMenu={(e) => handleContextMenu(e, note.id)}
              className={`
                group relative px-3 py-2 mx-1 rounded-md cursor-pointer text-sm transition-colors
                ${activeNoteId === note.id
                  ? 'bg-[#1a1a2e] text-[#e4e4e7]'
                  : 'text-[#999] hover:bg-[#1a1a1a] hover:text-[#ccc]'
                }
              `}
            >
              <div className="font-medium truncate text-xs">
                {note.title || 'Untitled'}
              </div>
              {note.snippet && (
                <div className="text-[10px] text-[#555] truncate mt-0.5">
                  {note.snippet}
                </div>
              )}
              {note.tags.length > 0 && (
                <div className="flex gap-1 mt-1 flex-wrap">
                  {note.tags.slice(0, 3).map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-[#1e1e2e] text-[#777]">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Context menu */}
              {contextMenuId === note.id && (
                <div
                  className="absolute right-2 top-8 z-10 bg-[#1e1e1e] border border-[#333] rounded-md shadow-lg py-1 min-w-[100px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      onDeleteNote(note.id);
                      setContextMenuId(null);
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left text-red-400 hover:bg-[#2a2a2a] cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#1e1e1e] text-[10px] text-[#444]">
        {notes.length} note{notes.length !== 1 ? 's' : ''}
      </div>
    </aside>
  );
}
