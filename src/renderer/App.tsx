import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import Sidebar from './components/Sidebar';
import Editor, { type EditorHandle } from './components/Editor';
import MarkdownPreviewPanel from './components/MarkdownPreviewPanel';
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
import SidebarEdgePeek from './components/SidebarEdgePeek';
import EditorTabBar from './components/EditorTabBar';
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
import { applyMarkdownOverridesToDocument, mergeMarkdownLayers } from './editor/markdownOverrides';
import type { Note, NoteListItem } from '../shared/types';
import { vaultFingerprint } from '../shared/types';

type RightPanel = 'none' | 'graph' | 'markdown-help' | 'markdown-preview';

/** IDE tab strip: leftmost = most recently *opened* (new tab or note opened from list). Selecting an already-open tab does not reorder. */
function mruOpenTabIds(prev: string[], id: string): string[] {
  const rest = prev.filter(x => x !== id);
  return [id, ...rest];
}
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
  const [sidebarGrouped, setSidebarGrouped] = useState(() => localStorage.getItem('mnemo.grouped') !== 'false');
  const [sidebarIncludeSubfolders, setSidebarIncludeSubfolders] = useState(
    () => localStorage.getItem('mnemo.categoryScopeSubtree') !== 'false',
  );
  const [prefsReady, setPrefsReady] = useState(false);
  const [markdownGlobal, setMarkdownGlobal] = useState<Record<string, string>>({});
  const [markdownByTheme, setMarkdownByTheme] = useState<Record<string, Record<string, string>>>({});

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

  /** Stable fingerprint so the editor can repaint when Markdown CSS vars on :root change. */
  const markdownPaintKey = useMemo(
    () => JSON.stringify(mergeMarkdownLayers(themeId, markdownGlobal, markdownByTheme)),
    [themeId, markdownGlobal, markdownByTheme],
  );

  // Keep a stable ref to activeNote for use in callbacks/effects
  const activeNoteRef = useRef<Note | null>(null);
  useEffect(() => { activeNoteRef.current = activeNote; }, [activeNote]);
  const effectiveLayoutRef = useRef(effectiveLayout);
  useEffect(() => { effectiveLayoutRef.current = effectiveLayout; }, [effectiveLayout]);
  const searchQueryRef = useRef(searchQuery);
  useEffect(() => { searchQueryRef.current = searchQuery; }, [searchQuery]);
  const vaultNotesRef = useRef(vaultNotes);
  useEffect(() => { vaultNotesRef.current = vaultNotes; }, [vaultNotes]);
  const notesRef = useRef(notes);
  useEffect(() => { notesRef.current = notes; }, [notes]);
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const openTabIdsRef = useRef(openTabIds);
  useEffect(() => { openTabIdsRef.current = openTabIds; }, [openTabIds]);

  /** Last seen DB fingerprint — updated after list sync so polling can detect remote/Turso changes. */
  const lastVaultFingerprintRef = useRef<string>('');

  const editorRef = useRef<EditorHandle | null>(null);
  const [previewBody, setPreviewBody] = useState('');
  const handleEditorLiveBody = useCallback((body: string) => {
    setPreviewBody(body);
  }, []);

  useEffect(() => {
    if (!activeNote) {
      setPreviewBody('');
      return;
    }
    setPreviewBody(activeNote.body);
  }, [activeNote?.id]);

  useLayoutEffect(() => {
    applyThemeToDocument(themeDef);
    document.documentElement.setAttribute('data-layout', effectiveLayout);
    applyMarkdownOverridesToDocument(
      mergeMarkdownLayers(themeId, markdownGlobal, markdownByTheme),
    );
  }, [themeDef, effectiveLayout, themeId, markdownGlobal, markdownByTheme]);

  useEffect(() => {
    localStorage.setItem('mnemo.themeId', themeId);
  }, [themeId]);

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

  useEffect(() => {
    try {
      localStorage.setItem('mnemo.ideTabIds', JSON.stringify(openTabIds));
    } catch {
      /* quota */
    }
  }, [openTabIds]);

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
          if (file.markdownGlobal !== undefined) setMarkdownGlobal(file.markdownGlobal);
          if (file.markdownByTheme !== undefined) setMarkdownByTheme(file.markdownByTheme);
          if (file.ideTabIds !== undefined && file.ideTabIds.length > 0) setOpenTabIds(file.ideTabIds);
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
        markdownGlobal,
        markdownByTheme,
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
    markdownGlobal,
    markdownByTheme,
    openTabIds,
  ]);

  const handleMarkdownThemeChange = useCallback((tid: string, v: Record<string, string>) => {
    setMarkdownByTheme(prev => {
      const next = { ...prev };
      if (Object.keys(v).length === 0) delete next[tid];
      else next[tid] = v;
      return next;
    });
  }, []);

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

  const captureVaultFingerprint = useCallback(async () => {
    try {
      const snap = await window.mnemo.notes.vaultSnapshot();
      lastVaultFingerprintRef.current = vaultFingerprint(snap);
    } catch {
      /* ignore */
    }
  }, []);

  const loadNotes = useCallback(async () => {
    const list = await window.mnemo.notes.list();
    setVaultNotes(list);
    setNotes(list);
    await captureVaultFingerprint();
  }, [captureVaultFingerprint]);

  /**
   * Reload sidebar/search lists from DB. Auto-refresh does not reload the open note body (avoids clobbering unsaved edits).
   * Manual refresh passes `reloadActiveNote` to pull the current note from Turso/DB.
   */
  const syncNotesFromStore = useCallback(
    async (opts?: { reloadActiveNote?: boolean }) => {
      const list = await window.mnemo.notes.list();
      setVaultNotes(list);
      const q = searchQueryRef.current.trim();
      if (q) {
        const results = await window.mnemo.notes.search(q);
        setNotes(
          results.map(r => ({
            ref: r.ref,
            id: r.id,
            title: r.title,
            tags: [],
            modified: '',
            snippet: r.snippet,
            hideHeader: r.hideHeader,
          })),
        );
      } else {
        setNotes(list);
      }
      await captureVaultFingerprint();
      if (opts?.reloadActiveNote) {
        const cur = activeNoteRef.current;
        if (cur) {
          const n = await window.mnemo.notes.read(cur.id);
          if (n) setActiveNote(n);
          else setActiveNote(null);
        }
      }
    },
    [captureVaultFingerprint],
  );

  /** Poll DB for changes (e.g. another device or MCP) and refresh lists without touching the editor buffer. */
  useEffect(() => {
    const tick = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const snap = await window.mnemo.notes.vaultSnapshot();
        const fp = vaultFingerprint(snap);
        if (fp !== lastVaultFingerprintRef.current) {
          await syncNotesFromStore();
        }
      } catch {
        /* offline / transient */
      }
    };
    const id = window.setInterval(tick, 12000);
    const onVis = () => {
      void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [syncNotesFromStore]);

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

  const handleSelectNote = useCallback(async (id: string) => {
    const note = await window.mnemo.notes.read(id);
    setActiveNote(note);
    if (effectiveLayoutRef.current === 'ide') {
      setOpenTabIds(prev => {
        if (prev.includes(id)) return prev;
        return mruOpenTabIds(prev, id);
      });
    }
  }, []);

  const navigateNoteByDelta = useCallback(async (delta: number) => {
    const q = searchQueryRef.current.trim();
    const ide = effectiveLayoutRef.current === 'ide';
    let list: NoteListItem[];
    if (ide) {
      const ids = openTabIdsRef.current;
      if (ids.length === 0) return;
      const byId = new Map(vaultNotesRef.current.map(n => [n.id, n]));
      list = ids.map(oid => byId.get(oid)).filter((n): n is NoteListItem => n != null);
      if (list.length === 0) return;
    } else {
      list = q ? notesRef.current : vaultNotesRef.current;
    }
    if (list.length === 0) return;
    const curId = activeNoteRef.current?.id;
    let idx = curId ? list.findIndex(n => n.id === curId) : -1;
    if (idx < 0) idx = delta > 0 ? -1 : 0;
    const nextIdx = (idx + delta + list.length) % list.length;
    const id = list[nextIdx]!.id;
    const note = await window.mnemo.notes.read(id);
    setActiveNote(note);
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
      setOpenTabIds(prev => mruOpenTabIds(prev, note.id));
    }
  }, [loadNotes]);

  const handleCloseAllTabs = useCallback(() => {
    setOpenTabIds([]);
    setActiveNote(null);
  }, []);

  const handleCloseTabsToRight = useCallback(async (fromId: string) => {
    const cur = openTabIdsRef.current;
    const idx = cur.indexOf(fromId);
    if (idx < 0) return;
    const nextIds = cur.slice(0, idx + 1);
    if (nextIds.length === cur.length) return;
    setOpenTabIds(nextIds);
    const activeId = activeNoteRef.current?.id;
    if (activeId && !nextIds.includes(activeId)) {
      const note = await window.mnemo.notes.read(fromId);
      setActiveNote(note);
    }
  }, []);

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

  // Global keyboard shortcuts (after navigate helper). Capture phase so CodeMirror doesn't eat Ctrl+, / Alt+Shift+F first.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F11') {
        e.preventDefault();
        void window.mnemo.toggleFullscreen();
        return;
      }
      if (showCommandPalette || showSettings || activeTab === 'help') {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Tab') {
        e.preventDefault();
        void navigateNoteByDelta(e.shiftKey ? -1 : 1);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'PageDown' || e.key === 'PageUp')) {
        e.preventDefault();
        void navigateNoteByDelta(e.key === 'PageDown' ? 1 : -1);
        return;
      }
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('input, textarea, [contenteditable=true]')) return;
        e.preventDefault();
        void navigateNoteByDelta(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
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
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
        e.preventDefault();
        setRightPanel(p => p === 'markdown-preview' ? 'none' : 'markdown-preview');
      }
      if (e.altKey && e.shiftKey && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
        e.preventDefault();
        void editorRef.current?.formatDocument();
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === ',' || e.code === 'Comma')) {
        e.preventDefault();
        setShowSettings(true);
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
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [
    showCommandPalette,
    showSettings,
    activeTab,
    navigateNoteByDelta,
    handleCreateNote,
  ]);

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
      case 'toggle-markdown-preview':
        setRightPanel(p => p === 'markdown-preview' ? 'none' : 'markdown-preview');
        break;
      case 'format-markdown':
        void editorRef.current?.formatDocument();
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
        await syncNotesFromStore({ reloadActiveNote: true });
        break;
      case 'toggle-fullscreen':
        void window.mnemo.toggleFullscreen();
        break;
      case 'note-next':
        void navigateNoteByDelta(1);
        break;
      case 'note-prev':
        void navigateNoteByDelta(-1);
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
  }, [handleCreateNote, loadNotes, navigateNoteByDelta, syncNotesFromStore]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setOpenTabIds(prev => mruOpenTabIds(prev, note.id));
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
    const q = searchQuery.trim();
    const listBefore = q ? notes : vaultNotes;
    const idx = listBefore.findIndex(n => n.id === id);
    const ide = effectiveLayoutRef.current === 'ide';
    const beforeTabs = openTabIdsRef.current;
    const nextTabIds = beforeTabs.filter(x => x !== id);

    await window.mnemo.notes.delete(id);
    setOpenTabIds(nextTabIds);
    await loadNotes();

    if (activeNoteRef.current?.id !== id) return;

    if (ide) {
      if (nextTabIds.length === 0) {
        setActiveNote(null);
        return;
      }
      const tidx = beforeTabs.indexOf(id);
      const pickIdx = Math.min(Math.max(0, tidx <= 0 ? 0 : tidx - 1), nextTabIds.length - 1);
      const nextId = nextTabIds[pickIdx]!;
      const note = await window.mnemo.notes.read(nextId);
      setActiveNote(note);
      return;
    }

    const remaining = listBefore.filter(n => n.id !== id);
    if (remaining.length === 0) {
      setActiveNote(null);
      return;
    }
    const pickIdx = Math.min(idx === 0 ? 0 : idx - 1, remaining.length - 1);
    const nextId = remaining[pickIdx]!.id;
    const note = await window.mnemo.notes.read(nextId);
    setActiveNote(note);
  }, [searchQuery, notes, vaultNotes, loadNotes]);

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
        setOpenTabIds(prev => mruOpenTabIds(prev, newNote.id));
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
    void (async () => {
      try {
        const note = await window.mnemo.notes.read(id);
        if (!cancelled) setActiveNote(note);
      } catch {
        setOpenTabIds(prev => prev.filter(x => x !== id));
      }
    })();
    return () => {
      cancelled = true;
    };
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
    onRefreshVault: () => {
      void syncNotesFromStore({ reloadActiveNote: true });
    },
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
            ref={editorRef}
            note={activeNote}
            onUpdate={handleUpdateNote}
            onNavigate={handleNavigateToTitle}
            showHeader={showNoteHeader && !activeNote.hideHeader}
            saveSignal={saveSignal}
            showLineNumbers={showLineNumbers}
            markdownPaintKey={markdownPaintKey}
            onEditorLiveBody={handleEditorLiveBody}
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
            <p className="text-xs mt-2 text-mnemo-dim">
              Ctrl+P search · Ctrl+N new · Ctrl+Tab / Ctrl+Page Up/Down switch notes · Alt+↑/↓ outside inputs · Ctrl+G graph · Ctrl+M reference
            </p>
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
      {rightPanel === 'markdown-preview' && activeNote && (
        <MarkdownPreviewPanel
          body={previewBody}
          onScrollToLine={(line) => editorRef.current?.scrollToLine(line)}
          onClose={() => setRightPanel('none')}
        />
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
        markdownGlobal={markdownGlobal}
        markdownByTheme={markdownByTheme}
        onMarkdownGlobalChange={setMarkdownGlobal}
        onMarkdownThemeChange={handleMarkdownThemeChange}
        onSaved={() => {
          setActiveNote(null);
          loadNotes();
          void window.mnemo.preferences.save({});
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
                onCloseAllTabs={handleCloseAllTabs}
                onCloseTabsToRight={handleCloseTabsToRight}
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
