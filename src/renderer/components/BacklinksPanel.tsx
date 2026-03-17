import { useState, useEffect } from 'react';
import type { NoteListItem } from '../../shared/types';

interface BacklinksPanelProps {
  noteId: string;
  onSelectNote: (id: string) => void;
}

export default function BacklinksPanel({ noteId, onSelectNote }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<NoteListItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.mnemo.notes.getBacklinks(noteId).then((links) => {
      if (!cancelled) setBacklinks(links);
    });
    return () => { cancelled = true; };
  }, [noteId]);

  if (backlinks.length === 0) return null;

  return (
    <div className="border-t border-[#1e1e1e]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-2 text-[11px] text-[#777] hover:text-[#aaa] transition-colors cursor-pointer"
      >
        <span className="font-medium tracking-wide">
          BACKLINKS ({backlinks.length})
        </span>
        <span className="text-[10px]">{collapsed ? '▸' : '▾'}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-1">
          {backlinks.map((bl) => (
            <div
              key={bl.id}
              onClick={() => onSelectNote(bl.id)}
              className="px-3 py-1.5 rounded-md cursor-pointer text-[#888] hover:text-[#ccc] hover:bg-[#1a1a1a] transition-colors"
            >
              <div className="text-xs font-medium truncate">{bl.title || 'Untitled'}</div>
              {bl.snippet && (
                <div className="text-[10px] text-[#555] truncate mt-0.5">{bl.snippet}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
