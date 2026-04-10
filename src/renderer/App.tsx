import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import BacklinksPanel from './components/BacklinksPanel';
import GraphView from './components/GraphView';
import CommandPalette from './components/CommandPalette';
import HelpView from './components/HelpView';
import MenuBar from './components/MenuBar';
import MarkdownHelper from './components/MarkdownHelper';
import SettingsView from './components/SettingsView';
import { extractWikilinks } from '../shared/wikilinks';
import { inferLinkTargetIds, mergeOutgoingLinkTargets } from '../shared/linkInference';
import { ClassicSidebarLayout } from './layouts/ClassicSidebarLayout';
import { IdeLayout } from './layouts/IdeLayout';
import { TopNavLayout } from './layouts/TopNavLayout';
import EditorTabBar from './components/EditorTabBar';
import SidebarEdgePeek from './components/SidebarEdgePeek';
import {
  categoryColorStorageKey,
  categoryPathFromTags,
  GENERAL_PATH,
  isValidDemoteParent,
  normalizePath,
  pathNestedUnderParent,
  promoteCategoryPath,
  UNASSIGNED_PATH,
} from './categoryPath';
import { colorForCategoryPath, readCategoryColors } from './categoryColors';
import { buildEffectiveCategoryColors, getSuggestedCategorySwatches } from './categoryColorPalette';
import { gatherLocalStoragePreferences } from './uiPreferencesSync';
import { applyThemeToDocument, getTheme } from './theme/themes';
import type { Note, NoteListItem } from '../shared/types';

type RightPanel = 'none' | 'graph' | 'markdown-help';
type ActiveTab = 'note' | 'help';
type LayoutOverride = 'inherit' | 'sidebar' | 'top' | 'ide';

function loadPref(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`mnemo.${key}`);
  return v === null ? def : v === 'true';
}
function savePref(key: string, val: boolean): void {
  localStorage.setItem(`mnemo.${key}`, String(val));
}

function readThemeId(): string {
  return localStorage.getItem('mnemo.themeId') ?? 'dark-default';
}

function readLayoutOverride(): LayoutOverride {
  const v = localStorage.getItem('mnemo.layoutOverride');
  if (v === 'sidebar' || v === 'top' || v === 'ide') return v;
  return 'inherit';
}

function readIdeTabIds(): string[] {
  try {
    const raw = localStorage.getItem('mnemo.ideTabIds');
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [vaultNotes, setVaultNotes] = useState<NoteListItem[]>([]);
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSidebar, setShowSidebar] = useState(() => loadPref('showSidebar', true));
  const [showNoteHeader, setShowNoteHeader] = useState(() => loadPref('showNoteHeader', true));
  const [showLineNumbers, setShowLineNumbers] = useState(() => loadPref('showLineNumbers', true));
  /** Stable #ref in sidebar / graph — off by default (CLI-oriented) */
  const [showNoteRefs, setShowNoteRefs] = useState(() => loadPref('showNoteRefs', false));
  const [categoryColors, setCategoryColors] = useState<Record<string, string>>(readCategoryColors);
  const [activeTab, setActiveTab] = useState<ActiveTab>('note');
  const [saveSignal, setSaveSignal] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [themeId, setThemeId] = useState(readThemeId);
  const [layoutOverride, setLayoutOverride] = useState<LayoutOverride>(readLayoutOverride);
  const [openTabIds, setOpenTabIds] = useState<string[]>(readIdeTabIds);
  const [sidebarGrouped, setSidebarGrouped] = useState(() => localStorage.getItem('mnemo.grouped') !== 'false');
  const [sidebarIncludeSubfolders, setSidebarIncludeSubfolders] = useState(
    () => localStorage.getItem('mnemo.categoryScopeSubtree') !== 'false',
  );
  const [prefsReady, setPrefsReady] = useState(false);

  const themeDef = useMemo(() => getTheme(themeId), [themeId]);

  const effectiveLayout = useMemo(() => {
    if (layoutOverride === 'inherit') return themeDef.layout;
    return layoutOverride;
  }, [layoutOverride, themeDef.layout]);

  const resolvedCategoryColors = useMemo(
    () => buildEffectiveCategoryColors(categoryColors, themeDef),
    [categoryColors, themeDef],
  );

  const categoryColorSwatches = useMemo(() => getSuggestedCategorySwatches(themeDef), [themeDef]);

  // Keep a stable ref to activeNote for use in callbacks/effects
  const activeNoteRef = useRef<Note | null>(null);
  useEffect(() => { activeNoteRef.current = activeNote; }, [activeNote]);
  const effectiveLayoutRef = useRef(effectiveLayout);
  useEffect(() => { effectiveLayoutRef.current = effectiveLayout; }, [effectiveLayout]);
  const openTabIdsRef = useRef(openTabIds);
  useEffect(() => { openTabIdsRef.current = openTabIds; }, [openTabIds]);

  useLayoutEffect(() => {
    applyThemeToDocument(themeDef);
    document.documentElement.setAttribute('data-layout', effectiveLayout);
  }, [themeDef, effectiveLayout]);

  useEffect(() => {
    localStorage.setItem('mnemo.themeId', themeId);
  }, [themeId]);

  useEffect(() => {
    if (openTabIds.length) localStorage.setItem('mnemo.ideTabIds', JSON.stringify(openTabIds));
    else localStorage.removeItem('mnemo.ideTabIds');
  }, [openTabIds]);

  useEffect(() => {
    if (layoutOverride === 'inherit') {
      localStorage.removeItem('mnemo.layoutOverride');
    } else {
      localStorage.setItem('mnemo.layoutOverride', layoutOverride);
    }
  }, [layoutOverride]);

  // Persist UI prefs
  useEffect(() => { savePref('showSidebar', showSidebar); }, [showSidebar]);
  useEffect(() => { savePref('showNoteHeader', showNoteHeader); }, [showNoteHeader]);
  useEffect(() => { savePref('showLineNumbers', showLineNumbers); }, [showLineNumbers]);
  useEffect(() => { savePref('showNoteRefs', showNoteRefs); }, [showNoteRefs]);

  useEffect(() => {
    localStorage.setItem('mnemo.grouped', String(sidebarGrouped));
  }, [sidebarGrouped]);

  useEffect(() => {
    localStorage.setItem('mnemo.categoryScopeSubtree', String(sidebarIncludeSubfolders));
  }, [sidebarIncludeSubfolders]);

  /** Load ui-preferences.json (MCP + disk); bootstrap file from localStorage if missing. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const file = await window.mnemo.preferences.read();
        if (cancelled) return;
        if (Object.keys(file).length > 0) {
          if (file.themeId !== undefined) setThemeId(file.themeId);
          if (file.layoutOverride !== undefined) setLayoutOverride(file.layoutOverride);
          if (file.showSidebar !== undefined) setShowSidebar(file.showSidebar);
          if (file.showNoteHeader !== undefined) setShowNoteHeader(file.showNoteHeader);
          if (file.showLineNumbers !== undefined) setShowLineNumbers(file.showLineNumbers);
          if (file.showNoteRefs !== undefined) setShowNoteRefs(file.showNoteRefs);
          if (file.grouped !== undefined) setSidebarGrouped(file.grouped);
          if (file.categoryScopeSubtree !== undefined) setSidebarIncludeSubfolders(file.categoryScopeSubtree);
          if (file.categoryColors !== undefined) {
            try {
              localStorage.setItem('mnemo.categoryColors', JSON.stringify(file.categoryColors));
            } catch {
              /* quota */
            }
            setCategoryColors(file.categoryColors);
          }
          if (file.ideTabIds !== undefined) setOpenTabIds(file.ideTabIds);
        } else {
          await window.mnemo.preferences.save(gatherLocalStoragePreferences());
        }
      } finally {
        if (!cancelled) setPrefsReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Sync full snapshot to disk for MCP / CLI (same as mnemo://preferences). */
  useEffect(() => {
    if (!prefsReady) return;
    const t = setTimeout(() => {
      void window.mnemo.preferences.save({
        themeId,
        layoutOverride,
        showSidebar,
        showNoteHeader,
        showLineNumbers,
        showNoteRefs,
        grouped: sidebarGrouped,
        categoryScopeSubtree: sidebarIncludeSubfolders,
        categoryColors,
        ideTabIds: openTabIds,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    prefsReady,
    themeId,
    layoutOverride,
    showSidebar,
    showNoteHeader,
    showLineNumbers,
    showNoteRefs,
    sidebarGrouped,
    sidebarIncludeSubfolders,
    categoryColors,
    openTabIds,
  ]);

  const handleSetCategoryColor = useCallback((path: string, color: string | null) => {
    const key = categoryColorStorageKey(path);
    setCategoryColors(prev => {
      const next = { ...prev };
      if (color == null) {
        delete next[key];
      } else {
        next[key] = color;
      }
      try {
        localStorage.setItem('mnemo.categoryColors', JSON.stringify(next));
      } catch {
        /* ignore quota */
      }
      return next;
    });
  }, []);

  const loadNotes = useCallback(async () => {
    const list = await window.mnemo.notes.list();
    setVaultNotes(list);
    setNotes(list);
  }, []);

  const handleRenameCategory = useCallback(
    async (oldPath: string, newPath: string) => {
      const oldKey = categoryColorStorageKey(oldPath);
      const newKey = categoryColorStorageKey(newPath);
      if (oldKey === newKey) return;

      const list = await window.mnemo.notes.list();
      for (const n of list) {
        if (categoryPathFromTags(n.tags, list) !== oldPath) continue;
        const otherTags = n.tags.slice(1);
        let newTags: string[];
        if (newKey === UNASSIGNED_PATH) {
          newTags = otherTags;
        } else if (newKey === GENERAL_PATH) {
          newTags = [GENERAL_PATH, ...otherTags];
        } else {
          newTags = [newKey, ...otherTags];
        }
        await window.mnemo.notes.update({ id: n.id, tags: newTags });
      }

      setCategoryColors(prev => {
        const next = { ...prev };
        const c = next[oldKey];
        if (c && oldKey !== newKey) {
          delete next[oldKey];
          next[newKey] = c;
        }
        try {
          localStorage.setItem('mnemo.categoryColors', JSON.stringify(next));
        } catch {
          /* ignore quota */
        }
        return next;
      });

      await loadNotes();
      if (activeNote) {
        const n = await window.mnemo.notes.read(activeNote.id);
        if (n) setActiveNote(n);
      }
    },
    [loadNotes, activeNote],
  );

  const handlePromoteCategory = useCallback(
    async (path: string) => {
      const next = promoteCategoryPath(path);
      if (next === null) return;
      await handleRenameCategory(path, next);
    },
    [handleRenameCategory],
  );

  const handleDemoteCategory = useCallback(
    async (path: string, parentPath: string) => {
      if (!isValidDemoteParent(path, parentPath)) return;
      const next = pathNestedUnderParent(path, parentPath);
      if (categoryColorStorageKey(path) === categoryColorStorageKey(next)) return;
      await handleRenameCategory(path, next);
    },
    [handleRenameCategory],
  );

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setShowCommandPalette(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        setRightPanel(p => p === 'graph' ? 'none' : 'graph');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
        e.preventDefault();
        setRightPanel(p => p === 'markdown-help' ? 'none' : 'markdown-help');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateNote();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setShowSidebar(s => !s);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'H') {
        e.preventDefault();
        setShowNoteHeader(h => !h);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        setShowLineNumbers(l => !l);
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n' && e.key !== 'n') {
        e.preventDefault();
        setShowNoteRefs(r => !r);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectNote = useCallback(async (id: string) => {
    const note = await window.mnemo.notes.read(id);
    setActiveNote(note);
    if (effectiveLayoutRef.current === 'ide') {
      setOpenTabIds(prev => (prev.includes(id) ? prev : [...prev, id]));
    }
  }, []);

  const handleCreateNote = useCallback(async () => {
    const note = await window.mnemo.notes.create({
      title: 'Untitled',
      body: '',
      tags: [],
    });
    await loadNotes();
    setActiveNote(note);
    if (effectiveLayoutRef.current === 'ide') {
      setOpenTabIds(prev => [...prev, note.id]);
    }
  }, [loadNotes]);

  const handleCloseTab = useCallback(async (id: string) => {
    const cur = openTabIdsRef.current;
    const nextIds = cur.filter(x => x !== id);
    setOpenTabIds(nextIds);
    if (activeNoteRef.current?.id !== id) return;
    if (nextIds.length === 0) {
      setActiveNote(null);
      return;
    }
    const idx = cur.indexOf(id);
    const pick = idx <= 0 ? 0 : idx - 1;
    const nextId = nextIds[Math.min(pick, nextIds.length - 1)]!;
    const note = await window.mnemo.notes.read(nextId);
    setActiveNote(note);
  }, []);

  // Menu command handler (used by both native menu IPC and custom MenuBar)
  const handleMenuCommand = useCallback(async (command: string) => {
    const note = activeNoteRef.current;
    switch (command) {
      case 'new-note':
        handleCreateNote();
        break;
      case 'save':
        setSaveSignal(s => s + 1);
        break;
      case 'save-as':
        if (note) {
          await window.mnemo.file.saveAs({ title: note.title, body: note.body });
        }
        break;
      case 'open': {
        const files = await window.mnemo.file.open();
        if (files && files.length > 0) {
          for (const f of files) {
            await window.mnemo.notes.create({ title: f.title, body: f.body, tags: [] });
          }
          await loadNotes();
        }
        break;
      }
      case 'toggle-sidebar':
        setShowSidebar(s => !s);
        break;
      case 'toggle-header':
        setShowNoteHeader(h => !h);
        break;
      case 'toggle-line-numbers':
        setShowLineNumbers(l => !l);
        break;
      case 'toggle-note-refs':
        setShowNoteRefs(r => !r);
        break;
      case 'toggle-graph':
        setRightPanel(p => p === 'graph' ? 'none' : 'graph');
        break;
      case 'toggle-markdown-help':
        setRightPanel(p => p === 'markdown-help' ? 'none' : 'markdown-help');
        break;
      case 'show-help':
        setActiveTab('help');
        break;
      case 'settings':
        setShowSettings(true);
        break;
      case 'toggle-grouped':
        setSidebarGrouped(g => !g);
        break;
      case 'toggle-category-subtree':
        setSidebarIncludeSubfolders(v => !v);
        break;
      case 'close-right-panel':
        setRightPanel('none');
        break;
      case 'refresh-notes':
        await loadNotes();
        break;
      case 'layout-sidebar':
        setLayoutOverride('sidebar');
        break;
      case 'layout-top':
        setLayoutOverride('top');
        break;
      case 'layout-ide':
        setLayoutOverride('ide');
        break;
      case 'layout-inherit':
        setLayoutOverride('inherit');
        break;
      case 'quit':
        window.close();
        break;
    }
  }, [handleCreateNote, loadNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  const runPaletteCommand = useCallback(
    (command: string) => {
      setShowCommandPalette(false);
      void handleMenuCommand(command);
    },
    [handleMenuCommand],
  );

  // Renderer-level hotkey: Ctrl+N — new note (works even when focus is inside CodeMirror)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateNote();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleCreateNote]);

  // Native menu commands from main process (accelerators still work via hidden native menu)
  useEffect(() => {
    const unsubscribe = window.mnemo.onMenuCommand(handleMenuCommand);
    return () => unsubscribe();
  }, [handleMenuCommand]);

  // Files opened via OS shell right-click or "Open with" (Windows registry / macOS CFBundleDocumentTypes)
  useEffect(() => {
    const unsubscribe = window.mnemo.onFileOpenedExternally(async ({ title, body }) => {
      const note = await window.mnemo.notes.create({ title, body, tags: [] });
      await loadNotes();
      setActiveNote(note);
      if (effectiveLayoutRef.current === 'ide') {
        setOpenTabIds(prev => [...prev, note.id]);
      }
    });
    return () => unsubscribe();
  }, [loadNotes]);

  const handleUpdateNote = useCallback(async (id: string, title: string, body: string) => {
    const wikilinkTitles = extractWikilinks(body);
    const explicitIds: string[] = [];
    for (const linkTitle of wikilinkTitles) {
      const resolved = await window.mnemo.notes.resolveTitle(linkTitle);
      if (resolved) explicitIds.push(resolved);
    }

    const index = await window.mnemo.notes.list();
    const inferredIds = inferLinkTargetIds(body, id, index.map((n) => ({ id: n.id, title: n.title, ref: n.ref })));
    const targetIds = mergeOutgoingLinkTargets(explicitIds, inferredIds, id);

    const updated = await window.mnemo.notes.update({ id, title, body });
    if (updated) {
      await window.mnemo.notes.updateLinks(id, targetIds);
      setActiveNote({ ...updated, links: targetIds });
      const list = await window.mnemo.notes.list();
      setVaultNotes(list);
      setNotes(list);
    }
  }, []);

  const handleDeleteNote = useCallback(async (id: string) => {
    await window.mnemo.notes.delete(id);
    const cur = openTabIdsRef.current;
    const nextIds = cur.filter(x => x !== id);
    setOpenTabIds(nextIds);
    if (activeNoteRef.current?.id === id) {
      if (nextIds.length === 0) {
        setActiveNote(null);
      } else {
        const idx = cur.indexOf(id);
        const pick = idx <= 0 ? 0 : idx - 1;
        const nextId = nextIds[Math.min(pick, nextIds.length - 1)]!;
        const note = await window.mnemo.notes.read(nextId);
        setActiveNote(note);
      }
    }
    await loadNotes();
  }, [loadNotes]);

  const handleRenameNote = useCallback(async (id: string) => {
    const item = vaultNotes.find(n => n.id === id) ?? notes.find(n => n.id === id);
    if (!item) return;
    const next = window.prompt('Note title', item.title);
    if (next === null) return;
    const trimmed = next.trim() || 'Untitled';
    if (trimmed === item.title) return;
    await window.mnemo.notes.update({ id, title: trimmed });
    await loadNotes();
    if (activeNote?.id === id) {
      const n = await window.mnemo.notes.read(id);
      if (n) setActiveNote(n);
    }
  }, [vaultNotes, notes, activeNote?.id, loadNotes]);

  const handleToggleHideNoteHeader = useCallback(async (id: string) => {
    const item = vaultNotes.find(n => n.id === id) ?? notes.find(n => n.id === id);
    if (!item) return;
    const next = !item.hideHeader;
    await window.mnemo.notes.update({ id, hideHeader: next });
    await loadNotes();
    if (activeNote?.id === id) {
      const n = await window.mnemo.notes.read(id);
      if (n) setActiveNote(n);
    }
  }, [vaultNotes, notes, activeNote?.id, loadNotes]);

  const handleSetCategory = useCallback(async (id: string, category: string) => {
    const noteItem = vaultNotes.find(n => n.id === id);
    const oldTags = noteItem?.tags ?? [];
    const otherTags = oldTags.slice(1);
    let newTags: string[];
    if (category === '' || category === UNASSIGNED_PATH) {
      newTags = otherTags;
    } else if (category === GENERAL_PATH) {
      newTags = [GENERAL_PATH, ...otherTags];
    } else {
      newTags = [category, ...otherTags];
    }
    await window.mnemo.notes.update({ id, tags: newTags });
    await loadNotes();
  }, [vaultNotes, loadNotes]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await loadNotes();
      return;
    }
    const results = await window.mnemo.notes.search(query);
    setNotes(results.map(r => ({
      ref: r.ref,
      id: r.id,
      title: r.title,
      tags: [],
      modified: '',
      snippet: r.snippet,
      hideHeader: r.hideHeader,
    })));
  }, [loadNotes]);

  /** Navigate to a note by title (for wikilink clicks). Creates note if not found. */
  const handleNavigateToTitle = useCallback(async (title: string) => {
    const id = await window.mnemo.notes.resolveTitle(title);
    if (id) {
      handleSelectNote(id);
    } else {
      const newNote = await window.mnemo.notes.create({ title, body: '', tags: [] });
      await loadNotes();
      setActiveNote(newNote);
      if (effectiveLayoutRef.current === 'ide') {
        setOpenTabIds(prev => [...prev, newNote.id]);
      }
    }
  }, [handleSelectNote, loadNotes]);

  const ideTabItems = useMemo(() => {
    const byId = new Map(vaultNotes.map(n => [n.id, n] as const));
    return openTabIds.map(id => {
      const n = byId.get(id);
      const path = n ? categoryPathFromTags(n.tags, vaultNotes) : GENERAL_PATH;
      const accentColor = colorForCategoryPath(path, resolvedCategoryColors);
      return { id, title: n?.title || 'Untitled', accentColor };
    });
  }, [openTabIds, vaultNotes, resolvedCategoryColors]);

  /** Restore editor when IDE layout has tabs but no active note (e.g. fresh load). */
  useEffect(() => {
    if (effectiveLayout !== 'ide') return;
    if (activeNote) return;
    if (openTabIds.length === 0) return;
    const id = openTabIds[0];
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const note = await window.mnemo.notes.read(id);
        if (!cancelled) setActiveNote(note);
      } catch {
        setOpenTabIds(prev => prev.filter(x => x !== id));
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveLayout, activeNote, openTabIds]);

  /** First switch to IDE with a note open: start tab strip with current note. */
  useEffect(() => {
    if (effectiveLayout !== 'ide' || !activeNote?.id) return;
    setOpenTabIds(prev => (prev.length === 0 ? [activeNote.id] : prev));
  }, [effectiveLayout, activeNote?.id]);

  const sidebarProps = {
    vaultNotes,
    notes,
    activeNoteId: activeNote?.id ?? null,
    searchQuery,
    onSelectNote: handleSelectNote,
    onCreateNote: handleCreateNote,
    onDeleteNote: handleDeleteNote,
    onSearch: handleSearch,
    onSetCategory: handleSetCategory,
    onRenameNote: handleRenameNote,
    onToggleHideNoteHeader: handleToggleHideNoteHeader,
    onToggleSidebar: () => setShowSidebar(v => !v),
    showNoteRefs,
    categoryColors,
    resolvedCategoryColors,
    categoryColorSwatches,
    onSetCategoryColor: handleSetCategoryColor,
    onRenameCategory: handleRenameCategory,
    onPromoteCategory: handlePromoteCategory,
    onDemoteCategory: handleDemoteCategory,
    grouped: sidebarGrouped,
    onGroupedChange: setSidebarGrouped,
    includeSubfolders: sidebarIncludeSubfolders,
    onIncludeSubfoldersChange: setSidebarIncludeSubfolders,
  };

  const editorMain = (
    <>
      {activeTab === 'help' ? (
        <HelpView onClose={() => setActiveTab('note')} />
      ) : activeNote ? (
        <>
          <Editor
            note={activeNote}
            onUpdate={handleUpdateNote}
            onNavigate={handleNavigateToTitle}
            showHeader={showNoteHeader && !activeNote.hideHeader}
            saveSignal={saveSignal}
            showLineNumbers={showLineNumbers}
          />
          <BacklinksPanel
            noteId={activeNote.id}
            onSelectNote={handleSelectNote}
          />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-mnemo-dim select-none">
          <div className="text-center">
            <div className="text-5xl mb-4 opacity-20">μ</div>
            <p className="text-sm text-mnemo-muted">Select a note or create a new one</p>
            <p className="text-xs mt-2 text-mnemo-dim">Ctrl+P to search · Ctrl+N to create · Ctrl+G for graph · Ctrl+M for reference</p>
            <button
              type="button"
              onClick={handleCreateNote}
              className="mt-4 px-4 py-2 text-xs bg-mnemo-active hover:bg-mnemo-hover rounded-md transition-colors border border-mnemo-border-strong cursor-pointer text-mnemo-text"
            >
              New Note
            </button>
          </div>
        </div>
      )}
    </>
  );

  const rightRail = (
    <>
      {rightPanel === 'markdown-help' && (
        <MarkdownHelper onClose={() => setRightPanel('none')} />
      )}
      {rightPanel === 'graph' && (
        <div className="w-80 min-w-[280px] border-l border-mnemo-border flex flex-col bg-mnemo-panel shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-mnemo-border">
            <span className="text-[11px] font-medium tracking-wide text-mnemo-muted">GRAPH</span>
            <button
              type="button"
              onClick={() => setRightPanel('none')}
              className="text-mnemo-dim hover:text-mnemo-muted text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <GraphView
              onSelectNote={handleSelectNote}
              activeNoteId={activeNote?.id ?? null}
              showNoteRefs={showNoteRefs}
            />
          </div>
        </div>
      )}
    </>
  );

  const commandPaletteOverlay = showCommandPalette && (
    <CommandPalette
      onSelectNote={handleSelectNote}
      onRunCommand={runPaletteCommand}
      onClose={() => setShowCommandPalette(false)}
    />
  );

  const settingsOverlay = showSettings && (
    <div className="absolute inset-0 z-50 bg-mnemo-app">
      <SettingsView
        onClose={() => setShowSettings(false)}
        themeId={themeId}
        onThemeIdChange={setThemeId}
        layoutOverride={layoutOverride}
        onLayoutOverrideChange={setLayoutOverride}
        showNoteRefs={showNoteRefs}
        onShowNoteRefsChange={setShowNoteRefs}
        onSaved={() => {
          setActiveNote(null);
          loadNotes();
        }}
      />
    </div>
  );

  return (
    <div className="relative flex flex-col h-screen w-screen bg-mnemo-app text-mnemo-text">
      <MenuBar onCommand={handleMenuCommand} />
      <div className="flex flex-1 overflow-hidden min-h-0 min-w-0">
        {effectiveLayout === 'top' ? (
          <TopNavLayout>
            <Sidebar
              {...sidebarProps}
              layout="top"
              navColumnVisible={showSidebar}
            >
              <div className="flex flex-1 flex-row min-h-0 overflow-hidden">
                <main className="flex-1 flex flex-col overflow-hidden min-w-0">
                  {editorMain}
                </main>
                {rightRail}
              </div>
            </Sidebar>
          </TopNavLayout>
        ) : effectiveLayout === 'ide' ? (
          <IdeLayout
            sidebarVisible={showSidebar}
            edgePeek={<SidebarEdgePeek onOpen={() => setShowSidebar(true)} />}
            sidebar={<Sidebar {...sidebarProps} layout="ide" />}
            tabBar={(
              <EditorTabBar
                tabs={ideTabItems}
                activeId={activeNote?.id ?? null}
                onSelect={handleSelectNote}
                onClose={handleCloseTab}
                onNew={handleCreateNote}
              />
            )}
            rail={rightRail}
          >
            {editorMain}
          </IdeLayout>
        ) : (
          <ClassicSidebarLayout
            sidebarVisible={showSidebar}
            edgePeek={<SidebarEdgePeek onOpen={() => setShowSidebar(true)} />}
            sidebar={<Sidebar {...sidebarProps} layout="sidebar" />}
            rail={rightRail}
          >
            {editorMain}
          </ClassicSidebarLayout>
        )}
      </div>
      {commandPaletteOverlay}
      {settingsOverlay}
    </div>
  );
}
