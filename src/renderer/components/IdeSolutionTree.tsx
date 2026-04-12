import { Fragment, useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent } from 'react';
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

/** One horizontal step per nesting level (margin on each treeitem — stacks with ancestors). */
const TREE_LEVEL_PX = 10;

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
  const s = new Set<string>();
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

  /** Only changes when the active note’s resolved category path changes — not on every vault list refresh. */
  const activeNoteCategoryKey = useMemo(() => {
    if (!activeNoteId) return '';
    const note = vaultNotes.find(n => n.id === activeNoteId);
    if (!note) return '';
    return categoryPathFromTags(note.tags, vaultNotes);
  }, [activeNoteId, vaultNotes]);

  useEffect(() => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (activeNoteId && activeNoteCategoryKey) {
        const note = vaultNotes.find(n => n.id === activeNoteId);
        if (note) {
          for (const a of ancestorPaths(categoryPathFromTags(note.tags, vaultNotes))) {
            next.add(a);
          }
        }
      }
      return next;
    });
    // Intentionally omit vaultNotes: only re-expand when active note or its category path changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [activeNoteId, activeNoteCategoryKey]);

  const toggle = useCallback((path: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      saveExpandedToStorage(next);
      return next;
    });
  }, []);

  const renderNode = (node: CategoryTreeNode, depth: number): React.ReactNode => {
    const notesHere = [...(notesByPath.get(node.path) ?? [])].sort((a, b) =>
      (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }),
    );
    const childFolders = [...node.children].sort((a, b) =>
      a.segment.localeCompare(b.segment, undefined, { sensitivity: 'base' }),
    );
    const hasSubfolders = childFolders.length > 0;
    const hasNotes = notesHere.length > 0;
    const expandable = hasSubfolders || hasNotes;
    const isOpen = expanded.has(node.path);
    const label =
      node.path === GENERAL_PATH ? 'General' : node.path === UNASSIGNED_PATH ? 'Unassigned' : node.segment;
    const stripe = colorForCategoryPath(node.path, categoryColors);
    const stripeBorder = stripe
      ? `color-mix(in srgb, ${stripe} 42%, var(--mnemo-accent) 58%)`
      : `color-mix(in srgb, var(--mnemo-border) 82%, var(--mnemo-accent) 18%)`;
    const isDrag = dragOverCategory === node.path;
    const visibleCount = visibleNotesInSubtree(node, notesByPath);

    const depthIndentPx = depth > 0 ? TREE_LEVEL_PX : 0;

    return (
      <div
        key={node.path}
        role="treeitem"
        aria-expanded={expandable ? isOpen : undefined}
        style={{ marginLeft: depthIndentPx }}
      >
        <div
          onDragOver={e => onDragOver(e, node.path)}
          onDrop={e => onDrop(e, node.path)}
          onDragLeave={onDragLeave}
          onContextMenu={e => onFolderContextMenu(e, node.path)}
          className={`flex min-h-[28px] flex-row items-stretch rounded-sm transition-[background-color,box-shadow] duration-150 bg-mnemo-panel-elevated/50 border ${
            isDrag ? 'bg-mnemo-active/25 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--mnemo-border)_65%,var(--mnemo-accent)_35%)]' : ''
          }`}
          style={{
            borderColor: 'var(--mnemo-sidebar-category-edge)',
            borderLeftWidth: 3,
            borderLeftStyle: 'solid',
            borderLeftColor: stripeBorder,
          }}
          title="Right-click for folder actions"
        >
          <button
            type="button"
            className={`flex h-auto min-h-[28px] w-5 shrink-0 items-center justify-center rounded-none text-[10px] text-mnemo-dim hover:bg-mnemo-hover hover:text-mnemo-text ${
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
              className="min-w-0 flex-1 flex items-center gap-1.5 text-left rounded-sm py-0.5 pr-1 pl-0.5 -my-0.5 hover:bg-mnemo-hover/50"
              onClick={() => toggle(node.path)}
              aria-expanded={isOpen}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${label}`}
            >
              <span
                className={`min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.05em] ${stripe ? '' : 'text-mnemo-muted'}`}
                style={stripe ? { color: stripe } : undefined}
              >
                {label}
              </span>
              <span className="shrink-0 text-[10px] text-mnemo-dim tabular-nums font-medium">{visibleCount}</span>
            </button>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left py-0.5 pr-1 pl-0.5">
              <span
                className={`min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-[0.05em] ${stripe ? '' : 'text-mnemo-muted'}`}
                style={stripe ? { color: stripe } : undefined}
              >
                {label}
              </span>
              <span className="shrink-0 text-[10px] text-mnemo-dim tabular-nums font-medium">{visibleCount}</span>
            </div>
          )}
        </div>

        {isOpen && (
          <div
            role="group"
            onDragOver={e => onDragOver(e, node.path)}
            onDrop={e => onDrop(e, node.path)}
            onDragLeave={onDragLeave}
            className={`border-l border-[color:var(--mnemo-sidebar-tree-guide)] pl-0.5 ${
              isDrag ? 'rounded-b-sm bg-mnemo-active/12' : ''
            }`}
          >
            {childFolders.map(ch => renderNode(ch, depth + 1))}
            {notesHere.length > 0 && (
              <div
                role="group"
                className="mt-0.5 pl-2"
              >
                {notesHere.map(n => (
                  <Fragment key={n.id}>
                    <div
                      className={`mx-0.5 min-h-[2px] rounded-sm transition-[background-color] duration-150 ${
                        isDrag ? 'bg-mnemo-active/18' : 'hover:bg-mnemo-hover/30'
                      }`}
                      onDragOver={e => onDragOver(e, node.path)}
                      onDrop={e => onDrop(e, node.path)}
                      onDragLeave={onDragLeave}
                      aria-hidden
                    />
                    <div>{renderNote(n, depth + 1)}</div>
                  </Fragment>
                ))}
                <div
                  className={`mx-0.5 min-h-[2px] rounded-sm transition-[background-color] duration-150 ${
                    isDrag ? 'bg-mnemo-active/18' : 'hover:bg-mnemo-hover/30'
                  }`}
                  onDragOver={e => onDragOver(e, node.path)}
                  onDrop={e => onDrop(e, node.path)}
                  onDragLeave={onDragLeave}
                  aria-hidden
                />
              </div>
            )}
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
      {topChildren.map(ch => renderNode(ch, 0))}
    </div>
  );
}
