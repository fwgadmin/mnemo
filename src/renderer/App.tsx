import { useState, useEffect, useCallback, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Editor from './components/Editor';
import BacklinksPanel from './components/BacklinksPanel';
import GraphView from './components/GraphView';
import CommandPalette from './components/CommandPalette';
import HelpView from './components/HelpView';
import MenuBar from './components/MenuBar';
import { extractWikilinks } from './components/wikilinkPlugin';
import type { Note, NoteListItem } from '../shared/types';

type RightPanel = 'none' | 'graph';
type ActiveTab = 'note' | 'help';

function loadPref(key: string, def: boolean): boolean {
  const v = localStorage.getItem(`mnemo.${key}`);
  return v === null ? def : v === 'true';
}
function savePref(key: string, val: boolean): void {
  localStorage.setItem(`mnemo.${key}`, String(val));
}

export default function App() {
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [rightPanel, setRightPanel] = useState<RightPanel>('none');
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showSidebar, setShowSidebar] = useState(() => loadPref('showSidebar', true));
  const [showNoteHeader, setShowNoteHeader] = useState(() => loadPref('showNoteHeader', true));
  const [showLineNumbers, setShowLineNumbers] = useState(() => loadPref('showLineNumbers', true));
  const [activeTab, setActiveTab] = useState<ActiveTab>('note');
  const [saveSignal, setSaveSignal] = useState(0);

  // Keep a stable ref to activeNote for use in callbacks/effects
  const activeNoteRef = useRef<Note | null>(null);
  useEffect(() => { activeNoteRef.current = activeNote; }, [activeNote]);

  // Persist UI prefs
  useEffect(() => { savePref('showSidebar', showSidebar); }, [showSidebar]);
  useEffect(() => { savePref('showNoteHeader', showNoteHeader); }, [showNoteHeader]);
  useEffect(() => { savePref('showLineNumbers', showLineNumbers); }, [showLineNumbers]);

  const loadNotes = useCallback(async () => {
    const list = await window.mnemo.notes.list();
    setNotes(list);
  }, []);

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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectNote = useCallback(async (id: string) => {
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
  }, [loadNotes]);

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
      case 'toggle-graph':
        setRightPanel(p => p === 'graph' ? 'none' : 'graph');
        break;
      case 'show-help':
        setActiveTab('help');
        break;
    }
  }, [handleCreateNote, loadNotes]); // eslint-disable-line react-hooks/exhaustive-deps

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
    });
    return () => unsubscribe();
  }, [loadNotes]);

  const handleUpdateNote = useCallback(async (id: string, title: string, body: string) => {
    // Extract wikilinks and resolve to note IDs
    const wikilinkTitles = extractWikilinks(body);
    const targetIds: string[] = [];
    for (const linkTitle of wikilinkTitles) {
      const resolved = await window.mnemo.notes.resolveTitle(linkTitle);
      if (resolved) targetIds.push(resolved);
    }

    const updated = await window.mnemo.notes.update({ id, title, body });
    if (updated) {
      // Update links in the database
      await window.mnemo.notes.updateLinks(id, targetIds);
      setActiveNote({ ...updated, links: targetIds });
      const list = await window.mnemo.notes.list();
      setNotes(list);
    }
  }, []);

  const handleDeleteNote = useCallback(async (id: string) => {
    await window.mnemo.notes.delete(id);
    if (activeNote?.id === id) {
      setActiveNote(null);
    }
    await loadNotes();
  }, [activeNote, loadNotes]);

  const handleSetCategory = useCallback(async (id: string, category: string) => {
    const noteItem = notes.find(n => n.id === id);
    const oldTags = noteItem?.tags ?? [];
    const otherTags = oldTags.slice(1);
    const newTags = category ? [category, ...otherTags] : otherTags;
    await window.mnemo.notes.update({ id, tags: newTags });
    await loadNotes();
  }, [notes, loadNotes]);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      await loadNotes();
      return;
    }
    const results = await window.mnemo.notes.search(query);
    setNotes(results.map(r => ({
      id: r.id,
      title: r.title,
      tags: [],
      modified: '',
      snippet: r.snippet,
    })));
  }, [loadNotes]);

  /** Navigate to a note by title (for wikilink clicks). Creates note if not found. */
  const handleNavigateToTitle = useCallback(async (title: string) => {
    const id = await window.mnemo.notes.resolveTitle(title);
    if (id) {
      handleSelectNote(id);
    } else {
      // Auto-create note with this title
      const newNote = await window.mnemo.notes.create({ title, body: '', tags: [] });
      await loadNotes();
      setActiveNote(newNote);
    }
  }, [handleSelectNote, loadNotes]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f0f0f] text-[#e4e4e7]">
      <MenuBar onCommand={handleMenuCommand} />
      <div className="flex flex-1 overflow-hidden">
      {/* Sidebar */}
      {showSidebar && (
        <Sidebar
          notes={notes}
          activeNoteId={activeNote?.id ?? null}
          searchQuery={searchQuery}
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onDeleteNote={handleDeleteNote}
          onSearch={handleSearch}
          onSetCategory={handleSetCategory}
          onHide={() => setShowSidebar(false)}
        />
      )}


      {/* Editor + backlinks */}
      <main className="flex-1 flex flex-col overflow-hidden min-w-0">
        {activeTab === 'help' ? (
          <HelpView onClose={() => setActiveTab('note')} />
        ) : activeNote ? (
          <>
            <Editor
              note={activeNote}
              onUpdate={handleUpdateNote}
              onNavigate={handleNavigateToTitle}
              showHeader={showNoteHeader}
              saveSignal={saveSignal}
              showLineNumbers={showLineNumbers}
            />
            <BacklinksPanel
              noteId={activeNote.id}
              onSelectNote={handleSelectNote}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#555] select-none">
            <div className="text-center">
              <div className="text-5xl mb-4 opacity-20">μ</div>
              <p className="text-sm">Select a note or create a new one</p>
              <p className="text-xs mt-2 text-[#444]">Ctrl+P to search · Ctrl+N to create · Ctrl+G for graph</p>
              <button
                onClick={handleCreateNote}
                className="mt-4 px-4 py-2 text-xs bg-[#1a1a2e] hover:bg-[#252547] rounded-md transition-colors border border-[#333] cursor-pointer"
              >
                New Note
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Right panel (graph view) */}
      {rightPanel === 'graph' && (
        <div className="w-80 min-w-[280px] border-l border-[#1e1e1e] flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e1e]">
            <span className="text-[11px] font-medium tracking-wide text-[#888]">GRAPH</span>
            <button
              onClick={() => setRightPanel('none')}
              className="text-[#555] hover:text-[#aaa] text-xs cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="flex-1">
            <GraphView
              onSelectNote={handleSelectNote}
              activeNoteId={activeNote?.id ?? null}
            />
          </div>
        </div>
      )}

      {/* Command palette overlay */}
      {showCommandPalette && (
        <CommandPalette
          onSelectNote={handleSelectNote}
          onCreateNote={handleCreateNote}
          onClose={() => setShowCommandPalette(false)}
        />
      )}
      </div>
    </div>
  );
}
