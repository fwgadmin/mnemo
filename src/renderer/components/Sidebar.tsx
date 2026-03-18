import { useState, useRef, useCallback, useEffect } from 'react';
import type { NoteListItem } from '../../shared/types';

interface SidebarProps {
  notes: NoteListItem[];
  activeNoteId: string | null;
  searchQuery: string;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
  onSearch: (query: string) => void;
  onSetCategory: (id: string, category: string) => void;
  onHide: () => void;
}

function groupByCategory(notes: NoteListItem[]): Map<string, NoteListItem[]> {
  const map = new Map<string, NoteListItem[]>();
  for (const note of notes) {
    const cat = note.tags[0] || 'General';
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(note);
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      if (a === 'General') return 1;
      if (b === 'General') return -1;
      return a.localeCompare(b);
    }),
  );
}

export default function Sidebar({
  notes,
  activeNoteId,
  searchQuery,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onSearch,
  onSetCategory,
  onHide,
}: SidebarProps) {
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [categoryEditId, setCategoryEditId] = useState<string | null>(null);
  const [categoryValue, setCategoryValue] = useState('');
  const [grouped, setGrouped] = useState(() => localStorage.getItem('mnemo.grouped') === 'true');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('mnemo.grouped', String(grouped));
  }, [grouped]);

  useEffect(() => {
    if (categoryEditId) setTimeout(() => categoryInputRef.current?.focus(), 50);
  }, [categoryEditId]);

  useEffect(() => {
    if (!contextMenuId) return;
    const handler = () => setContextMenuId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenuId]);

  const handleContextMenu = useCallback((e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenuId(noteId === contextMenuId ? null : noteId);
    setCategoryEditId(null);
  }, [contextMenuId]);

  const openCategoryEdit = useCallback((noteId: string, currentCategory: string) => {
    setContextMenuId(null);
    setCategoryEditId(noteId);
    setCategoryValue(currentCategory);
  }, []);

  const commitCategory = useCallback((noteId: string) => {
    onSetCategory(noteId, categoryValue.trim());
    setCategoryEditId(null);
  }, [onSetCategory, categoryValue]);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }, []);

  const renderNoteItem = (note: NoteListItem) => (
    <div key={note.id}>
      <div
        onClick={() => { onSelectNote(note.id); setContextMenuId(null); }}
        onContextMenu={(e) => handleContextMenu(e, note.id)}
        className={`
          group relative px-3 py-2 mx-1 rounded-md cursor-pointer text-sm transition-colors
          ${activeNoteId === note.id
            ? 'bg-[#1a1a2e] text-[#e4e4e7]'
            : 'text-[#999] hover:bg-[#1a1a1a] hover:text-[#ccc]'
          }
        `}
      >
        <div className="font-medium truncate text-xs">{note.title || 'Untitled'}</div>
        {note.snippet && (
          <div className="text-[10px] text-[#555] truncate mt-0.5">{note.snippet}</div>
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

        {contextMenuId === note.id && (
          <div
            className="absolute right-2 top-8 z-20 bg-[#1e1e1e] border border-[#333] rounded-md shadow-lg py-1 min-w-[130px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => openCategoryEdit(note.id, note.tags[0] || '')}
              className="w-full px-3 py-1.5 text-xs text-left text-[#aaa] hover:bg-[#2a2a2a] cursor-pointer"
            >
              Set Category
            </button>
            <div className="border-t border-[#2a2a2a] my-1" />
            <button
              onClick={() => { onDeleteNote(note.id); setContextMenuId(null); }}
              className="w-full px-3 py-1.5 text-xs text-left text-red-400 hover:bg-[#2a2a2a] cursor-pointer"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {categoryEditId === note.id && (
        <div className="mx-2 mb-1 px-2" onClick={(e) => e.stopPropagation()}>
          <input
            ref={categoryInputRef}
            type="text"
            value={categoryValue}
            onChange={(e) => setCategoryValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCategory(note.id);
              if (e.key === 'Escape') setCategoryEditId(null);
            }}
            onBlur={() => commitCategory(note.id)}
            placeholder="Category name…"
            className="w-full px-2 py-1 text-[11px] bg-[#1a1a2e] border border-[#3a3a6a] rounded text-[#ccc] placeholder-[#555] focus:outline-none"
          />
        </div>
      )}
    </div>
  );

  return (
    <aside className="w-64 min-w-[200px] h-full flex flex-col border-r border-[#1e1e1e] bg-[#111]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
        <span className="text-sm font-semibold tracking-wide text-[#888]">MNEMO</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setGrouped(g => !g)}
            title={grouped ? 'Show flat list' : 'Group by category'}
            className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors cursor-pointer ${grouped ? 'bg-[#1a1a2e] text-[#7c7cff]' : 'hover:bg-[#252525] text-[#555] hover:text-[#aaa]'}`}
          >
            ⊞
          </button>
          <button
            onClick={onCreateNote}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#252525] text-[#888] hover:text-[#ccc] transition-colors cursor-pointer"
            title="New Note"
          >
            +
          </button>
          <button
            onClick={onHide}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#252525] text-[#555] hover:text-[#aaa] transition-colors cursor-pointer"
            title="Hide Sidebar (Ctrl+B)"
          >
            ‹
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <input
          ref={searchRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search notes…"
          className="w-full px-3 py-1.5 text-xs bg-[#1a1a1a] border border-[#282828] rounded-md text-[#ccc] placeholder-[#555] focus:outline-none focus:border-[#444] transition-colors"
        />
      </div>

      {/* Note list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {notes.length === 0 ? (
          <div className="px-3 py-8 text-center text-[#555] text-xs">
            {searchQuery ? 'No results' : 'No notes yet'}
          </div>
        ) : grouped && !searchQuery ? (
          [...groupByCategory(notes).entries()].map(([group, groupNotes]) => (
            <div key={group} className="mb-1">
              <button
                onClick={() => toggleGroup(group)}
                className="w-full flex items-center gap-1.5 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#555] hover:text-[#888] transition-colors cursor-pointer"
              >
                <span className="text-[8px]">{collapsedGroups.has(group) ? '▶' : '▼'}</span>
                {group}
                <span className="ml-auto text-[9px] font-normal text-[#444]">{groupNotes.length}</span>
              </button>
              {!collapsedGroups.has(group) && groupNotes.map(renderNoteItem)}
            </div>
          ))
        ) : (
          notes.map(renderNoteItem)
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-[#1e1e1e] text-[10px] text-[#444]">
        {notes.length} note{notes.length !== 1 ? 's' : ''}
      </div>
    </aside>
  );
}
