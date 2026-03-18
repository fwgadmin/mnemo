import { useRef, useEffect, useCallback } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, drawSelection, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { sql } from '@codemirror/lang-sql';
import { rust } from '@codemirror/lang-rust';
import { cpp } from '@codemirror/lang-cpp';
import { java } from '@codemirror/lang-java';
import { xml } from '@codemirror/lang-xml';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, LanguageDescription } from '@codemirror/language';

// Synchronously available languages — avoids async lezer mixed-tree issues
const codeLanguages = [
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'javascript'], extensions: ['js', 'mjs', 'jsx'], support: javascript() }),
  LanguageDescription.of({ name: 'TypeScript', alias: ['ts', 'typescript'], extensions: ['ts', 'tsx'], support: javascript({ typescript: true }) }),
  LanguageDescription.of({ name: 'Python',     alias: ['py', 'python'],     extensions: ['py'],           support: python() }),
  LanguageDescription.of({ name: 'JSON',        alias: ['json'],             extensions: ['json'],          support: json() }),
  LanguageDescription.of({ name: 'HTML',        alias: ['html'],             extensions: ['html', 'htm'],   support: html() }),
  LanguageDescription.of({ name: 'CSS',         alias: ['css'],              extensions: ['css'],           support: css() }),
  LanguageDescription.of({ name: 'SQL',         alias: ['sql'],              extensions: ['sql'],           support: sql() }),
  LanguageDescription.of({ name: 'Rust',        alias: ['rust', 'rs'],       extensions: ['rs'],            support: rust() }),
  LanguageDescription.of({ name: 'C++',         alias: ['cpp', 'c', 'cc'],  extensions: ['cpp', 'c', 'h'], support: cpp() }),
  LanguageDescription.of({ name: 'Java',        alias: ['java'],             extensions: ['java'],          support: java() }),
  LanguageDescription.of({ name: 'XML',         alias: ['xml', 'svg'],       extensions: ['xml', 'svg'],    support: xml() }),
];
import { oneDark } from '@codemirror/theme-one-dark';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { wikilinkDecorations } from './wikilinkPlugin';
import type { Note } from '../../shared/types';

interface EditorProps {
  note: Note;
  onUpdate: (id: string, title: string, body: string) => void;
  onNavigate: (title: string) => void;
  showHeader?: boolean;
  saveSignal?: number;
  showLineNumbers?: boolean;
}

/** Custom dark theme matching Mnemo's aesthetic */
const mnemoTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#ccc',
    fontSize: '14px',
    height: '100%',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    lineHeight: '1.7',
    padding: '0',
    paddingLeft: '6px',
    caretColor: '#7c7cff',
  },
  '.cm-cursor': {
    borderLeftColor: '#7c7cff',
    borderLeftWidth: '2px',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    color: '#333',
    border: 'none',
    paddingRight: '8px',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
    color: '#555',
  },
  '.cm-activeLine': {
    backgroundColor: '#ffffff06',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#264f78 !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#264f78 !important',
  },
  '.cm-line': {
    padding: '0 0',
  },
  '.cm-wikilink': {
    color: '#7c7cff',
    textDecoration: 'underline',
    textDecorationColor: '#7c7cff44',
    textUnderlineOffset: '3px',
    cursor: 'pointer',
  },
  '.cm-wikilink:hover': {
    textDecorationColor: '#7c7cff',
  },
  '.cm-wikilink-bracket': {
    color: '#555',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-scroller::-webkit-scrollbar': { width: '6px' },
  '.cm-scroller::-webkit-scrollbar-track': { background: 'transparent' },
  '.cm-scroller::-webkit-scrollbar-thumb': { background: '#333', borderRadius: '3px' },
  '.cm-scroller::-webkit-scrollbar-thumb:hover': { background: '#555' },
  '.cm-selectionMatch': {
    backgroundColor: '#ffffff15',
  },
}, { dark: true });

export default function Editor({ note, onUpdate, onNavigate, showHeader = true, saveSignal, showLineNumbers = true }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteIdRef = useRef(note.id);
  const titleValueRef = useRef(note.title);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const lineNumbersCompartment = useRef(new Compartment());
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onUpdateRef.current(
      noteIdRef.current,
      titleValueRef.current,
      viewRef.current?.state.doc.toString() ?? note.body,
    );
  }, [note.body]);

  // External save signal (e.g. File › Save menu command)
  useEffect(() => {
    if (saveSignal === undefined || saveSignal === 0) return;
    saveNow();
  }, [saveSignal, saveNow]);

  const debouncedSave = useCallback((title: string, body: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onUpdateRef.current(noteIdRef.current, title, body);
    }, 500);
  }, []);

  const handleClick = useCallback((_e: MouseEvent, _view: EditorView) => {
    const target = _e.target as HTMLElement;
    if (target.classList.contains('cm-wikilink')) {
      _e.preventDefault();
      const text = target.textContent;
      if (text) onNavigate(text);
    }
    return false;
  }, [onNavigate]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewRef.current) viewRef.current.destroy();

    noteIdRef.current = note.id;
    titleValueRef.current = note.title;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        debouncedSave(titleValueRef.current, update.state.doc.toString());
      }
    });

    const clickHandler = EditorView.domEventHandlers({
      click: (e, view) => handleClick(e, view),
    });

    const state = EditorState.create({
      doc: note.body,
      extensions: [
        lineNumbersCompartment.current.of(showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
        history(),
        drawSelection(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage, codeLanguages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        mnemoTheme,
        oneDark,
        keymap.of([
          { key: 'Mod-s', run: () => { saveNow(); return true; } },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        updateListener,
        clickHandler,
        wikilinkDecorations(),
        EditorView.lineWrapping,
      ],
    });

    viewRef.current = new EditorView({ state, parent: containerRef.current });

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      viewRef.current?.destroy();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  // Dynamically reconfigure line numbers without rebuilding the editor
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: lineNumbersCompartment.current.reconfigure(
        showLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []
      ),
    });
  }, [showLineNumbers]);

  const handleTitleChange = (newTitle: string) => {
    titleValueRef.current = newTitle;
    debouncedSave(newTitle, viewRef.current?.state.doc.toString() ?? note.body);
  };

  const wordCount = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const editorPx = showHeader ? 'pl-4 pr-2' : 'pl-3 pr-1';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showHeader && (
        <>
          <div className="px-4 pt-3 pb-1">
            <input
              ref={titleRef}
              type="text"
              defaultValue={note.title}
              key={note.id}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full text-2xl font-semibold bg-transparent border-none outline-none text-[#e4e4e7] placeholder-[#444]"
              placeholder="Untitled"
            />
            <div className="flex items-center gap-3 mt-2 text-[10px] text-[#555]">
              <span>{new Date(note.modified).toLocaleDateString()}</span>
              <span>·</span>
              <span>{wordCount} word{wordCount !== 1 ? 's' : ''}</span>
              {note.tags.length > 0 && (
                <>
                  <span>·</span>
                  <span>{note.tags.join(', ')}</span>
                </>
              )}
              {note.links.length > 0 && (
                <>
                  <span>·</span>
                  <span>{note.links.length} link{note.links.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          </div>
          <div className="mx-4 border-t border-[#1a1a1a] my-1" />
        </>
      )}
      <div ref={containerRef} className={`flex-1 overflow-hidden ${editorPx} ${showHeader ? 'pb-3' : 'py-3'}`} />
    </div>
  );
}
