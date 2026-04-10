import { useCallback, useEffect, useState, type DragEvent, type MouseEvent } from 'react';
import type { NoteListItem } from '../../shared/types';
import {
  ancestorPaths,
  categoryPathFromTags,
  GENERAL_PATH,
  UNASSIGNED_PATH,
  type CategoryTreeNode,
} from '../categoryPath';
import { colorForCategoryPath } from '../categoryColors';

const EXPANDED_KEY = 'mnemo.ideExplorerExpanded';

function loadExpandedFromStorage(): Set<string> | null {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as unknown;
    if (!Array.isArray(a)) return null;
    return new Set(a.filter((x): x is string => typeof x === 'string'));
  } catch {
    return null;
  }
}

function saveExpandedToStorage(paths: Set<string>): void {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...paths]));
  } catch {
    /* ignore */
  }
}

function defaultExpandedForActive(activeNoteId: string | null, vaultNotes: NoteListItem[]): Set<string> {
  const s = new Set<string>([GENERAL_PATH]);
  if (!activeNoteId) return s;
  const note = vaultNotes.find(n => n.id === activeNoteId);
  if (!note) return s;
  for (const a of ancestorPaths(categoryPathFromTags(note.tags, vaultNotes))) {
    s.add(a);
  }
  return s;
}

function visibleNotesInSubtree(node: CategoryTreeNode, notesByPath: Map<string, NoteListItem[]>): number {
  let n = notesByPath.get(node.path)?.length ?? 0;
  for (const c of node.children) {
    n += visibleNotesInSubtree(c, notesByPath);
  }
  return n;
}

interface IdeSolutionTreeProps {
  root: CategoryTreeNode;
  notesByPath: Map<string, NoteListItem[]>;
  activeNoteId: string | null;
  vaultNotes: NoteListItem[];
  categoryColors: Record<string, string>;
  onFolderContextMenu: (e: MouseEvent, path: string) => void;
  dragOverCategory: string | null;
  onDragOver: (e: DragEvent, path: string) => void;
  onDrop: (e: DragEvent, path: string) => void;
  onDragLeave: (e: DragEvent) => void;
  renderNote: (note: NoteListItem, depth: number) => React.ReactNode;
}

export default function IdeSolutionTree({
  root,
  notesByPath,
  activeNoteId,
  vaultNotes,
  categoryColors,
  onFolderContextMenu,
  dragOverCategory,
  onDragOver,
  onDrop,
  onDragLeave,
  renderNote,
}: IdeSolutionTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const stored = loadExpandedFromStorage();
    if (stored && stored.size > 0) return stored;
    return defaultExpandedForActive(activeNoteId, vaultNotes);
  });

  useEffect(() => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (activeNoteId) {
        const note = vaultNotes.find(n => n.id === activeNoteId);
        if (note) {
          for (const a of ancestorPaths(categoryPathFromTags(note.tags, vaultNotes))) {
            next.add(a);
          }
        }
      }
      return next;
    });
  }, [activeNoteId, vaultNotes]);

  const toggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveExpandedToStorage(next);
      return next;
    });
  }, []);

  const renderNode = (
    node: CategoryTreeNode,
    depth: number,
    opts?: { generalTopLevel?: boolean },
  ): React.ReactNode => {
    const notesHere = [...(notesByPath.get(node.path) ?? [])].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }),
    );
    const childFolders =
      opts?.generalTopLevel && node.path === GENERAL_PATH
        ? []
        : [...node.children].sort((a, b) =>
            a.segment.localeCompare(b.segment, undefined, { sensitivity: 'base' }),
          );
    const hasSubfolders = childFolders.length > 0;
    const hasNotes = notesHere.length > 0;
    const expandable = hasSubfolders || hasNotes;
    const isOpen = expanded.has(node.path);
    const label =
      node.path === GENERAL_PATH ? 'General' : node.path === UNASSIGNED_PATH ? 'Unassigned' : node.segment;
    const stripe = colorForCategoryPath(node.path, categoryColors);
    const isDrag = dragOverCategory === node.path;
    const visibleCount =
      opts?.generalTopLevel && node.path === GENERAL_PATH
        ? notesHere.length
        : visibleNotesInSubtree(node, notesByPath);

    const indent = 4 + depth * 14;

    return (
      <div key={node.path} role="treeitem" aria-expanded={expandable ? isOpen : undefined}>
        <div
          onDragOver={e => onDragOver(e, node.path)}
          onDrop={e => onDrop(e, node.path)}
          onDragLeave={onDragLeave}
          onContextMenu={e => onFolderContextMenu(e, node.path)}
          className={`rounded-sm transition-colors ${isDrag ? 'bg-mnemo-active/40 ring-1 ring-mnemo-accent/30' : ''}`}
          style={{ paddingLeft: indent }}
          title="Right-click for folder actions"
        >
          <div className="flex min-h-[26px] items-center gap-0.5 pr-1">
            <button
              type="button"
              className={`flex h-6 w-5 shrink-0 items-center justify-center rounded text-[10px] text-mnemo-dim hover:bg-mnemo-hover hover:text-mnemo-text ${
                expandable ? 'cursor-pointer' : 'cursor-default opacity-30'
              }`}
              aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
              disabled={!expandable}
              onClick={e => {
                e.stopPropagation();
                if (expandable) toggle(node.path);
              }}
            >
              {expandable ? (isOpen ? '▾' : '▸') : '·'}
            </button>
            {expandable ? (
              <button
                type="button"
                className="min-w-0 flex-1 flex items-center gap-1.5 text-left rounded-sm py-0.5 pr-1 -my-0.5 hover:bg-mnemo-hover/50"
                onClick={() => toggle(node.path)}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
              >
                <span
                  className={`min-w-0 flex-1 truncate text-[11px] font-medium ${stripe ? '' : 'text-mnemo-text'}`}
                  style={stripe ? { color: stripe } : undefined}
                >
                  {label}
                </span>
                <span className="shrink-0 text-[9px] text-mnemo-dim tabular-nums">{visibleCount}</span>
              </button>
            ) : (
              <>
                <span className={`min-w-0 flex-1 truncate text-[11px] font-medium ${stripe ? '' : 'text-mnemo-text'}`} style={stripe ? { color: stripe } : undefined}>
                  {label}
                </span>
                <span className="shrink-0 text-[9px] text-mnemo-dim tabular-nums">{visibleCount}</span>
              </>
            )}
          </div>
        </div>

        {isOpen && (
          <div role="group">
            {childFolders.map(ch => renderNode(ch, depth + 1))}
            {notesHere.map(n => (
              <div key={n.id}>{renderNote(n, depth + 1)}</div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const topChildren = [...root.children].sort((a, b) =>
    a.segment.localeCompare(b.segment, undefined, { sensitivity: 'base' }),
  );

  return (
    <div className="py-0.5 font-sans text-[11px] leading-tight" role="tree">
      {renderNode(root, 0, { generalTopLevel: true })}
      {topChildren.map(ch => renderNode(ch, 0))}
    </div>
  );
}
