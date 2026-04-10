import {
  forwardRef,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
} from 'react';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightActiveLine,
  drawSelection,
  lineNumbers,
  highlightActiveLineGutter,
} from '@codemirror/view';
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
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  LanguageDescription,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import { languages as languageDataLanguages } from '@codemirror/language-data';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { mnemoEditorTheme, mnemoSyntaxHighlighting } from '../editor/mnemoCodeMirror';
import { normalizeLineSeparators } from '../editor/lineSeparators';
import { formatMarkdown } from '../editor/formatMarkdown';
import { wikilinkDecorations } from './wikilinkPlugin';
import type { Note } from '../../shared/types';

/** Sync parsers first (instant highlight); language-data fills in the long tail via async load. */
const syncCodeLanguages: LanguageDescription[] = [
  LanguageDescription.of({
    name: 'XAML',
    alias: ['xaml', 'axaml'],
    extensions: ['xaml', 'axaml'],
    support: xml(),
  }),
  LanguageDescription.of({
    name: 'JavaScript',
    alias: ['js', 'javascript'],
    extensions: ['js', 'mjs', 'jsx'],
    support: javascript(),
  }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'typescript'],
    extensions: ['ts', 'tsx'],
    support: javascript({ typescript: true }),
  }),
  LanguageDescription.of({
    name: 'Python',
    alias: ['py', 'python'],
    extensions: ['py'],
    support: python(),
  }),
  LanguageDescription.of({
    name: 'JSON',
    alias: ['json'],
    extensions: ['json'],
    support: json(),
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html'],
    extensions: ['html', 'htm'],
    support: html(),
  }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css'],
    extensions: ['css'],
    support: css(),
  }),
  LanguageDescription.of({
    name: 'SQL',
    alias: ['sql'],
    extensions: ['sql'],
    support: sql(),
  }),
  LanguageDescription.of({
    name: 'Rust',
    alias: ['rust', 'rs'],
    extensions: ['rs'],
    support: rust(),
  }),
  LanguageDescription.of({
    name: 'C++',
    alias: ['cpp', 'c', 'cc'],
    extensions: ['cpp', 'c', 'h'],
    support: cpp(),
  }),
  LanguageDescription.of({
    name: 'Java',
    alias: ['java'],
    extensions: ['java'],
    support: java(),
  }),
  LanguageDescription.of({
    name: 'XML',
    alias: ['xml', 'svg'],
    extensions: ['xml', 'svg'],
    support: xml(),
  }),
];

const codeLanguages = [...syncCodeLanguages, ...languageDataLanguages];

function insertMarkdownLink(view: EditorView): boolean {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  const insert = text ? `[${text}](url)` : `[text](url)`;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert } });
  return true;
}

function insertMarkdownTable(view: EditorView): boolean {
  const sel = view.state.selection.main;
  const t = '| Col 1 | Col 2 |\n| --- | --- |\n|  |  |\n';
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: t } });
  return true;
}

function insertMarkdownImage(view: EditorView): boolean {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  const insert = text ? `![${text}](url)` : `![alt](url)`;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert } });
  return true;
}

export interface EditorHandle {
  formatDocument: () => Promise<void>;
  getBody: () => string;
  scrollToLine: (line: number) => void;
  focus: () => void;
}

interface EditorProps {
  note: Note;
  onUpdate: (id: string, title: string, body: string) => void;
  onNavigate: (title: string) => void;
  showHeader?: boolean;
  saveSignal?: number;
  showLineNumbers?: boolean;
  /** Bump when Markdown CSS variables on :root change so CodeMirror re-evaluates var() in highlight styles. */
  markdownPaintKey?: string;
  /** Throttled (~120ms) live body for preview / outline panels. */
  onEditorLiveBody?: (body: string) => void;
}

const Editor = forwardRef<EditorHandle, EditorProps>(function Editor(
  {
    note,
    onUpdate,
    onNavigate,
    showHeader = true,
    saveSignal,
    showLineNumbers = true,
    markdownPaintKey,
    onEditorLiveBody,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteIdRef = useRef(note.id);
  const titleValueRef = useRef(note.title);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const onEditorLiveBodyRef = useRef(onEditorLiveBody);
  const lineNumbersCompartment = useRef(new Compartment());

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    onEditorLiveBodyRef.current = onEditorLiveBody;
  }, [onEditorLiveBody]);

  const saveNow = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    onUpdateRef.current(
      noteIdRef.current,
      titleValueRef.current,
      viewRef.current?.state.doc.toString() ?? note.body,
    );
  }, [note.body]);

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
    const link = target.closest('[data-wikilink-target]') as HTMLElement | null;
    const title = link?.dataset?.wikilinkTarget?.trim();
    if (title) {
      _e.preventDefault();
      onNavigate(title);
    }
    return false;
  }, [onNavigate]);

  useImperativeHandle(
    ref,
    () => ({
      formatDocument: async () => {
        const v = viewRef.current;
        if (!v) return;
        const doc = v.state.doc.toString();
        try {
          const formatted = await formatMarkdown(doc);
          if (formatted === doc) return;
          v.dispatch({ changes: { from: 0, to: doc.length, insert: formatted } });
          saveNow();
        } catch (e) {
          console.error('Format markdown failed', e);
        }
      },
      getBody: () => viewRef.current?.state.doc.toString() ?? '',
      scrollToLine: (line: number) => {
        const v = viewRef.current;
        if (!v) return;
        const doc = v.state.doc;
        const ln = Math.max(1, Math.min(line, doc.lines));
        const lineObj = doc.line(ln);
        v.dispatch({
          selection: { anchor: lineObj.from },
          scrollIntoView: true,
        });
        v.focus();
      },
      focus: () => {
        viewRef.current?.focus();
      },
    }),
    [saveNow],
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (viewRef.current) viewRef.current.destroy();

    noteIdRef.current = note.id;
    titleValueRef.current = note.title;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        debouncedSave(titleValueRef.current, update.state.doc.toString());
        const cb = onEditorLiveBodyRef.current;
        if (cb) {
          if (previewThrottleRef.current) clearTimeout(previewThrottleRef.current);
          previewThrottleRef.current = setTimeout(() => {
            previewThrottleRef.current = null;
            cb(update.state.doc.toString());
          }, 120);
        }
      }
    });

    const clickHandler = EditorView.domEventHandlers({
      click: (e, view) => handleClick(e, view),
    });

    const gutterExtensions = showLineNumbers
      ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()]
      : [foldGutter()];

    const state = EditorState.create({
      doc: normalizeLineSeparators(note.body),
      extensions: [
        lineNumbersCompartment.current.of(gutterExtensions),
        history(),
        drawSelection(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdown({ base: markdownLanguage, codeLanguages }),
        mnemoSyntaxHighlighting,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        mnemoEditorTheme,
        Prec.highest(
          keymap.of([
            { key: 'Mod-k', run: insertMarkdownLink },
            { key: 'Mod-Shift-t', run: insertMarkdownTable },
            { key: 'Mod-Shift-i', run: insertMarkdownImage },
          ]),
        ),
        keymap.of([
          { key: 'Mod-s', run: () => { saveNow(); return true; } },
          ...foldKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        updateListener,
        clickHandler,
        wikilinkDecorations(),
        EditorView.lineWrapping,
        EditorView.clipboardInputFilter.of((text) => normalizeLineSeparators(text)),
      ],
    });

    viewRef.current = new EditorView({ state, parent: containerRef.current });
    onEditorLiveBodyRef.current?.(normalizeLineSeparators(note.body));

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (previewThrottleRef.current) clearTimeout(previewThrottleRef.current);
      viewRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: lineNumbersCompartment.current.reconfigure(
        showLineNumbers ? [lineNumbers(), highlightActiveLineGutter(), foldGutter()] : [foldGutter()],
      ),
    });
  }, [showLineNumbers]);

  useEffect(() => {
    if (markdownPaintKey === undefined) return;
    const v = viewRef.current;
    if (!v) return;
    v.requestMeasure();
    requestAnimationFrame(() => {
      v.dispatch({});
    });
  }, [markdownPaintKey]);

  const handleTitleChange = (newTitle: string) => {
    titleValueRef.current = newTitle;
    debouncedSave(newTitle, viewRef.current?.state.doc.toString() ?? note.body);
  };

  const wordCount = note.body.trim() ? note.body.trim().split(/\s+/).length : 0;
  const editorPx = showHeader ? 'pl-4 pr-2' : 'pl-3 pr-1';

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
      {showHeader && (
        <>
          <div className="px-4 pt-3 pb-1">
            <input
              ref={titleRef}
              type="text"
              defaultValue={note.title}
              key={note.id}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="w-full text-2xl font-semibold bg-transparent border-none outline-none text-mnemo-text placeholder-mnemo-dim"
              placeholder="Untitled"
            />
            <div className="flex items-center gap-3 mt-2 text-[10px] text-mnemo-dim">
              <span>{new Date(note.modified).toLocaleDateString()}</span>
              <span>·</span>
              <span>
                {wordCount} word{wordCount !== 1 ? 's' : ''}
              </span>
              {note.tags.length > 0 && (
                <>
                  <span>·</span>
                  <span>{note.tags.join(', ')}</span>
                </>
              )}
              {note.links.length > 0 && (
                <>
                  <span>·</span>
                  <span>
                    {note.links.length} link{note.links.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="mx-4 border-t border-mnemo-border my-1" />
        </>
      )}
      <div
        ref={containerRef}
        className={`flex-1 min-h-0 min-w-0 overflow-hidden ${editorPx} ${showHeader ? 'pb-3' : 'py-3'}`}
      />
    </div>
  );
});

export default Editor;
