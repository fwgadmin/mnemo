import { useRef, useEffect, useCallback } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, drawSelection, lineNumbers, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { wikilinkDecorations } from './wikilinkPlugin';
import type { Note } from '../../shared/types';

interface EditorProps {
  note: Note;
  onUpdate: (id: string, title: string, body: string) => void;
  onNavigate: (title: string) => void;
  showHeader?: boolean;
  saveSignal?: number;
}

/** Custom dark theme matching Mnemo's aesthetic */
const mnemoTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
    color: '#ccc',
    fontSize: '14px',
    height: '100%',
  },
  '.cm-content': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
    lineHeight: '1.7',
    padding: '0',
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
  '.cm-selectionMatch': {
    backgroundColor: '#ffffff15',
  },
}, { dark: true });

export default function Editor({ note, onUpdate, onNavigate, showHeader = true, saveSignal }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteIdRef = useRef(note.id);
  const titleValueRef = useRef(note.title);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
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
        lineNumbers(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        mnemoTheme,
        oneDark,
        keymap.of([
          { key: 'Mod-s', run: () => { saveNow(); return true; } },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          ...closeBracketsKeymap,
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

  const handleTitleChange = (newTitle: string) => {
    titleValueRef.current = newTitle;
    debouncedSave(newTitle, viewRef.current?.state.doc.toString() ?? note.body);
  };

  const wordCount = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const editorPx = showHeader ? 'px-8' : 'px-6';

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showHeader && (
        <>
          <div className="px-8 pt-6 pb-2">
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
          <div className="mx-8 border-t border-[#1a1a1a] my-2" />
        </>
      )}
      <div ref={containerRef} className={`flex-1 overflow-hidden ${editorPx} ${showHeader ? 'pb-6' : 'py-5'}`} />
    </div>
  );
}
