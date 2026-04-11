import { Fragment, useState, useRef, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { NoteListItem } from '../../shared/types';
import {
  GENERAL_PATH,
  UNASSIGNED_PATH,
  buildCategoryTree,
  categoryColorStorageKey,
  categoryPathFromTags,
  distinctCategoryPaths,
  filterNotesByCategory,
  findNodeByPath,
  isValidDemoteParent,
  normalizePath,
  promoteCategoryPath,
  pruneCategoryTree,
  sortPathsByTreeOrder,
  splitPath,
  categoryDisplayDepth,
} from '../categoryPath';
import { colorForCategoryPath } from '../categoryColors';
import CategoryCombobox from './CategoryCombobox';
import IdeSolutionTree from './IdeSolutionTree';
import CategoryFolderColorMenu, { type FolderColorMenuState } from './CategoryFolderColorMenu';

export interface SidebarProps {
  /** Full vault list (for tree paths and combobox) */
  vaultNotes: NoteListItem[];
  /** Shown in note list (search results or vault subset) */
  notes: NoteListItem[];
  activeNoteId: string | null;
  searchQuery: string;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  /** Reload categories/note list from DB (Turso / other devices); optional — command palette also has Reload. */
  onRefreshVault?: () => void;
  onDeleteNote: (id: string) => void;
  onSearch: (query: string) => void;
  onSetCategory: (id: string, category: string) => void;
  onRenameNote?: (id: string) => void;
  /** Toggle per-note editor title/metadata strip (stored on the note). */
  onToggleHideNoteHeader?: (id: string) => void;
  /** Collapse sidebar or note band (same as Ctrl+B) */
  onToggleSidebar: () => void;
  layout?: 'sidebar' | 'top' | 'ide';
  /** When layout is top, hide the note list column (e.g. Ctrl+B) */
  navColumnVisible?: boolean;
  /** When layout is top, editor + panels go here */
  children?: ReactNode;
  /** Stable note ref (#) — off by default; useful with CLI */
  showNoteRefs?: boolean;
  /** User-stored folder colors only (used for Clear, custom picker base). */
  categoryColors?: Record<string, string>;
  /** Explicit colors + theme-contrast auto + General fallback — use for stripes and labels. */
  resolvedCategoryColors?: Record<string, string>;
  /** Panel background for category stripe border (vs label) — from active theme. */
  themePanelBg?: string;
  /** Accent for stripe hue when label color is achromatic gray. */
  themeAccent?: string;
  /** Theme-based suggested swatches for folder color menu. */
  categoryColorSwatches?: string[];
  onSetCategoryColor?: (path: string, color: string | null) => void;
  /** Right-click category folder → rename (updates all notes in that exact category) */
  onRenameCategory?: (oldPath: string, newPath: string) => void | Promise<void>;
  onPromoteCategory?: (path: string) => void | Promise<void>;
  onDemoteCategory?: (path: string, parentPath: string) => void | Promise<void>;
  grouped: boolean;
  onGroupedChange: (v: boolean) => void;
  includeSubfolders: boolean;
  onIncludeSubfoldersChange: (v: boolean) => void;
}

export default function Sidebar({
  vaultNotes,
  notes,
  activeNoteId,
  searchQuery,
  onSelectNote,
  onCreateNote,
  onRefreshVault,
  onDeleteNote,
  onSearch,
  onSetCategory,
  onRenameNote,
  onToggleHideNoteHeader,
  onToggleSidebar,
  layout = 'sidebar',
  navColumnVisible = true,
  children,
  showNoteRefs = false,
  categoryColors = {},
  resolvedCategoryColors: resolvedCategoryColorsProp,
  categoryColorSwatches = [],
  onSetCategoryColor = () => {},
  onRenameCategory,
  onPromoteCategory,
  onDemoteCategory,
  grouped,
  onGroupedChange,
  includeSubfolders,
  onIncludeSubfoldersChange,
}: SidebarProps) {
  const resolvedCategoryColors = resolvedCategoryColorsProp ?? categoryColors;
  const [contextMenuId, setContextMenuId] = useState<string | null>(null);
  const [categoryEditId, setCategoryEditId] = useState<string | null>(null);
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showJumpSection, setShowJumpSection] = useState(() => {
    try {
      return localStorage.getItem('mnemo.showJumpSection') === 'true';
    } catch {
      return false;
    }
  });
  const searchRef = useRef<HTMLInputElement>(null);
  const [folderColorMenu, setFolderColorMenu] = useState<FolderColorMenuState>(null);
  const [folderRename, setFolderRename] = useState<{ path: string; x: number; y: number } | null>(null);
  const [folderDemote, setFolderDemote] = useState<{ path: string; x: number; y: number } | null>(null);
  const folderRenameRef = useRef<HTMLDivElement>(null);
  const folderDemoteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenuId) return;
    const handler = () => setContextMenuId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenuId]);

  useEffect(() => {
    if (!folderRename) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFolderRename(null);
    };
    const onDown = (e: MouseEvent) => {
      if (folderRenameRef.current?.contains(e.target as Node)) return;
      setFolderRename(null);
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [folderRename]);

  useEffect(() => {
    if (!folderDemote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFolderDemote(null);
    };
    const onDown = (e: MouseEvent) => {
      if (folderDemoteRef.current?.contains(e.target as Node)) return;
      setFolderDemote(null);
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDown, true), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDown, true);
    };
  }, [folderDemote]);


  const categoryPathsList = useMemo(() => distinctCategoryPaths(vaultNotes), [vaultNotes]);

  const demoteParentPaths = useMemo(() => {
    if (!folderDemote) return [];
    return categoryPathsList.filter(p => isValidDemoteParent(folderDemote.path, p));
  }, [vaultNotes, folderDemote, categoryPathsList]);

  const canDemoteFolderMenu = useMemo(() => {
    if (!folderColorMenu || !onDemoteCategory) return false;
    return categoryPathsList.some(p => isValidDemoteParent(folderColorMenu.path, p));
  }, [folderColorMenu, onDemoteCategory, categoryPathsList]);
  const tree = useMemo(() => buildCategoryTree(vaultNotes), [vaultNotes]);

  const displayedNotes = useMemo(() => {
    if (searchQuery.trim()) return notes;
    if (selectedFolder === null) return notes;
    return filterNotesByCategory(vaultNotes, selectedFolder, includeSubfolders);
  }, [notes, vaultNotes, searchQuery, selectedFolder, includeSubfolders]);

  const notesByPath = useMemo(() => {
    const m = new Map<string, NoteListItem[]>();
    for (const n of displayedNotes) {
      const p = categoryPathFromTags(n.tags, vaultNotes);
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(n);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) =>
        (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }),
      );
    }
    return m;
  }, [displayedNotes, vaultNotes]);

  const prunedTreeRoot = useMemo(
    () => pruneCategoryTree(tree, notesByPath),
    [tree, notesByPath],
  );

  const groupedSections = useMemo(() => {
    const paths = sortPathsByTreeOrder([...notesByPath.keys()], tree);
    return paths.map(path => ({
      path,
      notes: notesByPath.get(path)!,
      node: findNodeByPath(tree, path),
    }));
  }, [notesByPath, tree]);

  const handleContextMenu = useCallback((e: React.MouseEvent, noteId: string) => {
    e.preventDefault();
    setContextMenuId(noteId === contextMenuId ? null : noteId);
    setCategoryEditId(null);
  }, [contextMenuId]);

  const openCategoryEdit = useCallback((noteId: string, currentCategory: string) => {
    setContextMenuId(null);
    setCategoryEditId(noteId);
  }, []);

  const commitCategory = useCallback(
    (noteId: string, path: string) => {
      if (path === GENERAL_PATH) onSetCategory(noteId, GENERAL_PATH);
      else if (path === UNASSIGNED_PATH || path === '') onSetCategory(noteId, '');
      else onSetCategory(noteId, normalizePath(path) || GENERAL_PATH);
      setCategoryEditId(null);
    },
    [onSetCategory],
  );

  const handleDragStart = useCallback((e: React.DragEvent, noteId: string) => {
    e.dataTransfer.setData('text/plain', noteId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, category: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverCategory(category);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, category: string) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOverCategory(null);
      const noteId = e.dataTransfer.getData('text/plain');
      if (!noteId) return;
      onSetCategory(
        noteId,
        category === GENERAL_PATH ? GENERAL_PATH : category === UNASSIGNED_PATH ? '' : category,
      );
    },
    [onSetCategory],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setDragOverCategory(null);
  }, []);

  const openFolderContextMenu = useCallback((e: React.MouseEvent, path: string) => {
    e.preventDefault();
    setContextMenuId(null);
    setFolderColorMenu({ path, x: e.clientX, y: e.clientY });
  }, []);

  const noteRowPad = layout === 'top' ? 'py-1.5' : 'py-2';

  const renderNoteItem = (note: NoteListItem, hideCategory = false, treeDepth?: number) => {
    const notePath = categoryPathFromTags(note.tags, vaultNotes);
    const rowAccent = colorForCategoryPath(notePath, resolvedCategoryColors);
    /** Under grouped / tree, category color belongs on folder headers only — notes stay neutral for contrast with headers. */
    const useAccentOnTitle = !hideCategory;
    const treeIndent =
      treeDepth !== undefined && treeDepth > 0 ? { paddingLeft: `${4 + treeDepth * 14}px` } : undefined;
    const mxClass = treeDepth !== undefined ? 'mx-0' : 'mx-1';
    return (
    <div key={note.id}>
      <div
        draggable
        onDragStart={e => handleDragStart(e, note.id)}
        onClick={() => {
          onSelectNote(note.id);
          setContextMenuId(null);
        }}
        onContextMenu={e => handleContextMenu(e, note.id)}
        className={`
          group relative pl-2 pr-3 ${noteRowPad} ${mxClass} rounded-md cursor-pointer text-sm transition-colors
          ${activeNoteId === note.id
            ? 'bg-mnemo-active text-mnemo-text'
            : 'text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text'
          }
        `}
        style={treeIndent}
      >
        <div className="font-normal truncate text-[13px] leading-snug">
          {showNoteRefs && (
            <span className="text-mnemo-dim mr-1.5 tabular-nums text-xs">{note.ref}</span>
          )}
          <span
            className="truncate"
            style={useAccentOnTitle && rowAccent ? { color: rowAccent } : undefined}
          >
            {note.title || 'Untitled'}
          </span>
        </div>
        {note.snippet && (
          <div className="text-[10px] text-mnemo-dim truncate mt-0.5">{note.snippet}</div>
        )}
        {!hideCategory && note.tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {note.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-mnemo-panel-elevated text-mnemo-muted">
                {tag}
              </span>
            ))}
          </div>
        )}

        {contextMenuId === note.id && (
          <div
            className="absolute right-2 top-8 z-20 bg-mnemo-panel-elevated border border-mnemo-border rounded-md shadow-lg py-1 min-w-[180px]"
            onClick={e => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => openCategoryEdit(note.id, note.tags[0] || '')}
              className="w-full px-3 py-1.5 text-xs text-left text-mnemo-muted hover:bg-mnemo-hover cursor-pointer"
            >
              Set category…
            </button>
            {onRenameNote && (
              <button
                type="button"
                onClick={() => {
                  onRenameNote(note.id);
                  setContextMenuId(null);
                }}
                className="w-full px-3 py-1.5 text-xs text-left text-mnemo-muted hover:bg-mnemo-hover cursor-pointer"
              >
                Rename note…
              </button>
            )}
            {onToggleHideNoteHeader && (
              <button
                type="button"
                onClick={() => {
                  onToggleHideNoteHeader(note.id);
                  setContextMenuId(null);
                }}
                className="w-full px-3 py-1.5 text-xs text-left text-mnemo-muted hover:bg-mnemo-hover cursor-pointer"
              >
                {note.hideHeader ? 'Show editor header' : 'Hide editor header'}
              </button>
            )}
            <div className="border-t border-mnemo-border my-1" />
            <button
              type="button"
              onClick={() => {
                onDeleteNote(note.id);
                setContextMenuId(null);
              }}
              className="w-full px-3 py-1.5 text-xs text-left text-red-400 hover:bg-mnemo-hover cursor-pointer"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      {categoryEditId === note.id && (
        <div className="mx-2 mb-1 px-2" onClick={e => e.stopPropagation()}>
          <CategoryCombobox
            paths={categoryPathsList}
            value={categoryPathFromTags(note.tags, vaultNotes)}
            onChange={path => commitCategory(note.id, path)}
            placeholder="e.g. Work/Meetings"
            className="mt-1"
          />
          <p className="text-[9px] text-mnemo-dim mt-1">Use / for nested folders</p>
        </div>
      )}
    </div>
    );
  };

  const categoryStrip = (
    <div className="px-3 py-2 border-b border-mnemo-border bg-mnemo-category-bar space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-mnemo-dim shrink-0">Jump</span>
        <div className="flex-1 min-w-[120px]">
          <CategoryCombobox
            paths={categoryPathsList}
            value={selectedFolder ?? ''}
            onChange={path => {
              const t = path.trim();
              if (!t) {
                setSelectedFolder(null);
                return;
              }
              setSelectedFolder(normalizePath(t) || GENERAL_PATH);
            }}
            placeholder="All categories…"
            allowCreate={false}
          />
        </div>
        <button
          type="button"
          onClick={() => setSelectedFolder(null)}
          className="text-[10px] px-2 py-1 rounded border border-mnemo-border text-mnemo-muted hover:bg-mnemo-hover shrink-0"
        >
          All
        </button>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-mnemo-dim cursor-pointer select-none">
        <input
          type="checkbox"
          checked={includeSubfolders}
          onChange={e => onIncludeSubfoldersChange(e.target.checked)}
        />
        Include subfolders when filtering
      </label>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between px-4 py-3 border-b border-mnemo-border">
      {layout === 'ide' ? (
        <div className="min-w-0">
          <div className="text-xs font-semibold tracking-wide text-mnemo-muted truncate leading-tight">MNEMO</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-mnemo-dim mt-0.5">Explorer</div>
        </div>
      ) : (
        <span className="text-sm font-semibold tracking-wide text-mnemo-muted">MNEMO</span>
      )}
      <div className="flex items-center gap-1">
        {layout !== 'ide' && (
        <button
          type="button"
          onClick={() => onGroupedChange(!grouped)}
          title={grouped ? 'Flat list (no grouping)' : 'Group notes under category headers'}
          className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors cursor-pointer ${grouped ? 'bg-mnemo-active text-mnemo-accent' : 'hover:bg-mnemo-hover text-mnemo-dim hover:text-mnemo-muted'}`}
        >
          ⊞
        </button>
        )}
        {onRefreshVault && (
          <button
            type="button"
            onClick={onRefreshVault}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-mnemo-hover text-mnemo-dim hover:text-mnemo-muted transition-colors cursor-pointer"
            title="Reload notes, categories, and open note from database"
          >
            ↻
          </button>
        )}
        <button
          type="button"
          onClick={onCreateNote}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-mnemo-hover text-mnemo-muted hover:text-mnemo-text transition-colors cursor-pointer"
          title="New Note"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setShowJumpSection(v => {
              const next = !v;
              try {
                localStorage.setItem('mnemo.showJumpSection', String(next));
              } catch {
                /* ignore quota */
              }
              return next;
            });
          }}
          className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors cursor-pointer ${
            showJumpSection
              ? 'bg-mnemo-active text-mnemo-accent'
              : 'hover:bg-mnemo-hover text-mnemo-dim hover:text-mnemo-muted'
          }`}
          title={showJumpSection ? 'Hide category jump' : 'Show category jump'}
          aria-pressed={showJumpSection}
        >
          ⌖
        </button>
        {(layout === 'sidebar' || layout === 'top' || layout === 'ide') && (
          <button
            type="button"
            onClick={onToggleSidebar}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-mnemo-hover text-mnemo-dim hover:text-mnemo-muted transition-colors cursor-pointer"
            title={
              layout === 'top'
                ? navColumnVisible
                  ? 'Hide note list band (Ctrl+B)'
                  : 'Show note list band (Ctrl+B)'
                : 'Hide sidebar (Ctrl+B)'
            }
            aria-expanded={layout === 'top' ? navColumnVisible : true}
          >
            {layout === 'top' ? (navColumnVisible ? '‹' : '›') : '‹'}
          </button>
        )}
      </div>
    </div>
  );

  const searchBar = (
    <div className="px-3 py-2">
      <input
        ref={searchRef}
        type="text"
        value={searchQuery}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search notes…"
        className="w-full px-3 py-1.5 text-xs bg-mnemo-panel-elevated border border-mnemo-border rounded-md text-mnemo-text placeholder-mnemo-dim focus:outline-none focus:border-mnemo-border-strong transition-colors"
      />
    </div>
  );

  const noteListBody =
    displayedNotes.length === 0 ? (
      <div className="px-3 py-8 text-center text-mnemo-dim text-xs">
        {searchQuery ? 'No results' : selectedFolder ? 'No notes in this folder' : 'No notes yet'}
      </div>
    ) : layout === 'ide' && searchQuery.trim() ? (
      <div className="py-1">{displayedNotes.map(n => renderNoteItem(n))}</div>
    ) : layout === 'ide' && prunedTreeRoot ? (
      <IdeSolutionTree
        root={prunedTreeRoot}
        notesByPath={notesByPath}
        activeNoteId={activeNoteId}
        vaultNotes={vaultNotes}
                categoryColors={resolvedCategoryColors}
        onFolderContextMenu={openFolderContextMenu}
        dragOverCategory={dragOverCategory}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragLeave={handleDragLeave}
        renderNote={(n, depth) => renderNoteItem(n, true, depth)}
      />
    ) : layout === 'ide' ? (
      <div className="px-3 py-8 text-center text-mnemo-dim text-xs">No notes yet</div>
    ) : grouped ? (
      <div className="py-1">
        {groupedSections.map(({ path, notes: sectionNotes, node }, idx) => {
          const depth = categoryDisplayDepth(path);
          const label =
            path === GENERAL_PATH
              ? 'General'
              : path === UNASSIGNED_PATH
                ? 'Unassigned'
                : splitPath(path).join(' / ') || node?.segment || path;
          const isDrag = dragOverCategory === path;
          const stripe = colorForCategoryPath(path, resolvedCategoryColors);
          /** Stripe is tuned for label contrast; left rule uses accent mix so it never reads as white on dark themes. */
          const stripeBorder = stripe
            ? `color-mix(in srgb, ${stripe} 42%, var(--mnemo-accent) 58%)`
            : 'color-mix(in srgb, var(--mnemo-border) 82%, var(--mnemo-accent) 18%)';
          return (
            <div key={path}>
              {idx > 0 && (
                <div
                  className="mx-3 my-2 border-t border-[color:var(--mnemo-sidebar-category-separator)]"
                  aria-hidden
                />
              )}
              <div
                role="group"
                aria-label={`Category ${label}`}
                onDragOver={e => handleDragOver(e, path)}
                onDrop={e => handleDrop(e, path)}
                onDragLeave={handleDragLeave}
                className={`mx-1 rounded-md transition-[background-color,box-shadow] duration-150 pb-1 ${
                  isDrag
                    ? 'bg-mnemo-active/25 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--mnemo-border)_65%,var(--mnemo-accent)_35%)]'
                    : ''
                }`}
              >
                <div
                  className="rounded-md bg-mnemo-panel-elevated/80 border"
                  style={{
                    paddingLeft: 8 + depth * 10,
                    borderColor: 'var(--mnemo-sidebar-category-edge)',
                    borderLeftWidth: 3,
                    borderLeftStyle: 'solid',
                    borderLeftColor: stripeBorder,
                  }}
                >
                  <div
                    className="flex items-center gap-2 py-2 pr-2 min-h-[30px] cursor-default"
                    title="Right-click for folder actions"
                    onContextMenu={e => openFolderContextMenu(e, path)}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-[0.06em] ${stripe ? '' : 'text-mnemo-muted'}`}
                      style={stripe ? { color: stripe } : undefined}
                    >
                      {label}
                    </span>
                    <span className="text-[10px] text-mnemo-dim tabular-nums font-medium">{sectionNotes.length}</span>
                  </div>
                </div>
                <div className="pt-0.5">
                  {sectionNotes.map((n, i) => (
                    <Fragment key={n.id}>
                      <div
                        className={`mx-0.5 min-h-[6px] rounded-sm transition-[background-color] duration-150 ${
                          dragOverCategory === path ? 'bg-mnemo-active/18' : 'hover:bg-mnemo-hover/30'
                        }`}
                        onDragOver={e => handleDragOver(e, path)}
                        onDrop={e => handleDrop(e, path)}
                        onDragLeave={handleDragLeave}
                        aria-hidden
                      />
                      {renderNoteItem(n, true, depth + 1)}
                    </Fragment>
                  ))}
                  <div
                    className={`mx-0.5 min-h-[6px] rounded-sm transition-[background-color] duration-150 ${
                      dragOverCategory === path ? 'bg-mnemo-active/18' : 'hover:bg-mnemo-hover/30'
                    }`}
                    onDragOver={e => handleDragOver(e, path)}
                    onDrop={e => handleDrop(e, path)}
                    onDragLeave={handleDragLeave}
                    aria-hidden
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      displayedNotes.map(n => renderNoteItem(n))
    );

  const notesPanel = (
    <div className="mnemo-scrollbar-hover flex-1 overflow-y-auto px-1 py-1 min-h-0">{noteListBody}</div>
  );

  const footer = (
    <div className="px-4 py-2 border-t border-mnemo-border text-[10px] text-mnemo-dim">
      {displayedNotes.length} note{displayedNotes.length !== 1 ? 's' : ''}
      {selectedFolder && !searchQuery && (
        <span className="ml-2 text-mnemo-muted">· {selectedFolder}</span>
      )}
    </div>
  );

  const folderColorChrome = (
    <CategoryFolderColorMenu
      state={folderColorMenu}
      onClose={() => setFolderColorMenu(null)}
      suggestedColors={categoryColorSwatches}
      onPickSuggestedColor={hex => {
        if (!folderColorMenu) return;
        onSetCategoryColor(folderColorMenu.path, hex);
        setFolderColorMenu(null);
      }}
      currentColorHex={
        folderColorMenu
          ? categoryColors[categoryColorStorageKey(folderColorMenu.path)] ??
            resolvedCategoryColors[categoryColorStorageKey(folderColorMenu.path)]
          : undefined
      }
      onPickCustomColor={hex => {
        if (!folderColorMenu) return;
        onSetCategoryColor(folderColorMenu.path, hex);
        setFolderColorMenu(null);
      }}
      canPromote={Boolean(
        folderColorMenu &&
          onPromoteCategory &&
          promoteCategoryPath(folderColorMenu.path) !== null,
      )}
      onPromote={() => {
        if (!folderColorMenu || !onPromoteCategory) return;
        const p = folderColorMenu.path;
        setFolderColorMenu(null);
        void onPromoteCategory(p);
      }}
      canDemote={canDemoteFolderMenu}
      onRequestDemote={() => {
        if (!folderColorMenu || !onDemoteCategory) return;
        const { path, x, y } = folderColorMenu;
        setFolderColorMenu(null);
        setFolderDemote({ path, x, y });
      }}
      onRequestRename={
        onRenameCategory
          ? () => {
              if (!folderColorMenu) return;
              const { path, x, y } = folderColorMenu;
              setFolderColorMenu(null);
              setFolderRename({ path, x, y });
            }
          : undefined
      }
      canClear={
        folderColorMenu
          ? Object.prototype.hasOwnProperty.call(categoryColors, categoryColorStorageKey(folderColorMenu.path))
          : false
      }
      onClearColor={() => {
        if (!folderColorMenu) return;
        onSetCategoryColor(folderColorMenu.path, null);
        setFolderColorMenu(null);
      }}
    />
  );

  const folderRenameOverlay =
    folderRename && onRenameCategory ? (
      <div
        ref={folderRenameRef}
        className="fixed z-[110] w-[min(90vw,280px)]"
        style={{ left: folderRename.x, top: folderRename.y + 4 }}
      >
        <div
          className="bg-mnemo-panel-elevated border border-mnemo-border rounded-md shadow-lg p-2"
          onContextMenu={e => e.preventDefault()}
        >
          <p className="text-[10px] text-mnemo-dim mb-1.5">Rename category</p>
          <p className="text-[9px] text-mnemo-dim mb-1.5 leading-snug">
            All notes in this folder move to the path you enter. Press Enter to apply.
          </p>
          <CategoryCombobox
            paths={categoryPathsList}
            value={folderRename.path}
            selectionOnFocus="end"
            commitBehavior="typed"
            newPathLabel="renameDestination"
            onChange={path => {
              const dest =
                path === '' || path === GENERAL_PATH
                  ? GENERAL_PATH
                  : normalizePath(path) || GENERAL_PATH;
              void onRenameCategory(folderRename.path, dest);
              setFolderRename(null);
            }}
            placeholder="New path (e.g. Work/Meetings)"
          />
        </div>
      </div>
    ) : null;

  const folderDemoteOverlay =
    folderDemote && onDemoteCategory ? (
      <div
        ref={folderDemoteRef}
        className="fixed z-[110] w-[min(90vw,280px)]"
        style={{ left: folderDemote.x, top: folderDemote.y + 4 }}
      >
        <div
          className="bg-mnemo-panel-elevated border border-mnemo-border rounded-md shadow-lg p-2"
          onContextMenu={e => e.preventDefault()}
        >
          <p className="text-[10px] text-mnemo-dim mb-1.5">Nest category under</p>
          <CategoryCombobox
            key={folderDemote.path}
            paths={demoteParentPaths}
            value=""
            onChange={path => {
              if (!onDemoteCategory || !folderDemote) return;
              if (path === '' || path === GENERAL_PATH) {
                setFolderDemote(null);
                return;
              }
              const parent = normalizePath(path) || GENERAL_PATH;
              if (!isValidDemoteParent(folderDemote.path, parent)) {
                setFolderDemote(null);
                return;
              }
              void onDemoteCategory(folderDemote.path, parent);
              setFolderDemote(null);
            }}
            placeholder="Parent folder (e.g. Archive)"
          />
        </div>
      </div>
    ) : null;

  if (layout === 'top') {
    return (
      <div className="flex flex-col flex-1 min-h-0 min-w-0 overflow-hidden bg-mnemo-panel">
        <div className="shrink-0">
          {header}
          {showJumpSection && categoryStrip}
          {searchBar}
        </div>
        {navColumnVisible && (
          <div className="flex flex-col shrink-0 h-[min(40vh,320px)] min-h-[104px] border-b-2 border-mnemo-accent/40 bg-mnemo-panel-elevated/90">
            <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-mnemo-border bg-mnemo-category-bar shrink-0">
              <span
                className="text-[10px] font-semibold uppercase tracking-wider text-mnemo-muted"
                title="Top layout: notes are full width above the editor (not a side column)"
              >
                Notes
              </span>
              <span className="text-[10px] text-mnemo-dim tabular-nums shrink-0">
                {displayedNotes.length} shown
              </span>
            </div>
            <div className="mnemo-scrollbar-hover flex-1 min-h-0 overflow-y-auto px-1 py-1">{noteListBody}</div>
            <div className="shrink-0 px-3 py-1.5 border-t border-mnemo-border text-[10px] text-mnemo-dim flex flex-wrap gap-x-2 gap-y-0.5">
              <span>
                {displayedNotes.length} note{displayedNotes.length !== 1 ? 's' : ''}
              </span>
              {selectedFolder && !searchQuery && (
                <span className="text-mnemo-muted">· {selectedFolder}</span>
              )}
            </div>
          </div>
        )}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-mnemo-app border-t border-mnemo-border">
          {children}
        </div>
        {folderColorChrome}
        {folderRenameOverlay}
        {folderDemoteOverlay}
      </div>
    );
  }

  return (
    <aside
      className={`h-full flex flex-col min-h-0 border-r border-mnemo-border bg-mnemo-panel ${
        layout === 'ide' ? 'w-72 min-w-[240px]' : 'w-64 min-w-[200px]'
      }`}
    >
      {header}
      {showJumpSection && categoryStrip}
      {searchBar}
      {notesPanel}
      {footer}
      {folderColorChrome}
      {folderRenameOverlay}
      {folderDemoteOverlay}
    </aside>
  );
}
