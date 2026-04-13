import {
  forwardRef,
  useRef,
  useEffect,
  useCallback,
  useImperativeHandle,
  useState,
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
import { clampFixedContextMenu } from '../fixedMenuPosition';
import type { Note } from '../../shared/types';
import MarkdownNoteBody from './MarkdownNoteBody';

function readNoteBodyMode(): 'edit' | 'preview' {
  try {
    const v = localStorage.getItem('mnemo.noteBodyMode');
    if (v === 'preview' || v === 'edit') return v;
  } catch {
    /* ignore */
  }
  return 'edit';
}

function saveNoteBodyMode(m: 'edit' | 'preview'): void {
  try {
    localStorage.setItem('mnemo.noteBodyMode', m);
  } catch {
    /* ignore */
  }
}

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

function wrapSelectionMarkdown(view: EditorView, before: string, after: string): void {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  const insert = text ? `${before}${text}${after}` : `${before}${after}`;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert } });
}

async function clipboardWriteText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

async function clipboardReadText(): Promise<string> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return '';
  }
}

function editorCopy(view: EditorView): void {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  void clipboardWriteText(text);
}

function editorCut(view: EditorView): void {
  const sel = view.state.selection.main;
  const text = view.state.sliceDoc(sel.from, sel.to);
  void clipboardWriteText(text);
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: '' } });
}

async function editorPaste(view: EditorView): Promise<void> {
  const text = normalizeLineSeparators(await clipboardReadText());
  if (!text) return;
  const sel = view.state.selection.main;
  view.dispatch({ changes: { from: sel.from, to: sel.to, insert: text } });
}

export interface EditorHandle {
  formatDocument: () => Promise<void>;
  getBody: () => string;
  /** True when the buffer differs from the last server body applied (unsaved local edits). */
  isDirty: () => boolean;
  scrollToLine: (line: number) => void;
  focus: () => void;
  /** When the title header is shown, move focus to the title field (e.g. after New Note). */
  focusTitle: () => void;
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
  /** Increment after explicit "reload from DB" so the buffer is replaced even when the note id is unchanged. */
  reloadNonce?: number;
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
    reloadNonce = 0,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const noteIdRef = useRef(note.id);
  const titleValueRef = useRef(note.title);
  /** Last server body applied to the editor (normalized); used for dirty checks + remote sync. */
  const syncedBodyRef = useRef(normalizeLineSeparators(note.body));
  /** Last reloadNonce seen for the current note id — avoids re-applying when only `note` updates. */
  const reloadNonceSeenRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateRef = useRef(onUpdate);
  const onEditorLiveBodyRef = useRef(onEditorLiveBody);
  const lineNumbersCompartment = useRef(new Compartment());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const setCtxMenuRef = useRef(setCtxMenu);
  setCtxMenuRef.current = setCtxMenu;
  const [bodyMode, setBodyMode] = useState<'edit' | 'preview'>(() => readNoteBodyMode());
  const [previewLiveBody, setPreviewLiveBody] = useState(() => normalizeLineSeparators(note.body));

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => {
    onEditorLiveBodyRef.current = onEditorLiveBody;
  }, [onEditorLiveBody]);

  useEffect(() => {
    setPreviewLiveBody(normalizeLineSeparators(note.body));
  }, [note.id, note.body]);

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

  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);

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
      isDirty: () => {
        const v = viewRef.current;
        if (!v) return false;
        return (
          normalizeLineSeparators(v.state.doc.toString()) !==
          normalizeLineSeparators(syncedBodyRef.current)
        );
      },
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
      focusTitle: () => {
        const t = titleRef.current;
        if (!t) return;
        t.focus();
        t.select();
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
            const doc = update.state.doc.toString();
            cb(doc);
            setPreviewLiveBody(doc);
          }, 120);
        }
      }
    });

    const clickHandler = EditorView.domEventHandlers({
      click: (e, view) => handleClick(e, view),
      contextmenu: (e) => {
        e.preventDefault();
        setCtxMenuRef.current({ x: e.clientX, y: e.clientY });
        return true;
      },
    });

    /** Fold gutter left of line numbers so folding sits outside the number column. */
    const gutterExtensions = showLineNumbers
      ? [foldGutter(), lineNumbers(), highlightActiveLineGutter()]
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
    syncedBodyRef.current = normalizeLineSeparators(note.body);
    onEditorLiveBodyRef.current?.(normalizeLineSeparators(note.body));

    // Defer focus past the current event turn so it wins over sidebar/list focus after a click (Windows).
    const focusTimer = window.setTimeout(() => {
      viewRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (previewThrottleRef.current) clearTimeout(previewThrottleRef.current);
      viewRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  /** Same note id: apply remote title/body when the buffer still matches the last server snapshot (no local edits). */
  useEffect(() => {
    const v = viewRef.current;
    if (!v || note.id !== noteIdRef.current) return;
    const doc = normalizeLineSeparators(v.state.doc.toString());
    const server = normalizeLineSeparators(note.body);
    if (doc === server) {
      syncedBodyRef.current = server;
      return;
    }
    if (doc === normalizeLineSeparators(syncedBodyRef.current)) {
      v.dispatch({
        changes: { from: 0, to: v.state.doc.length, insert: server },
      });
      syncedBodyRef.current = server;
      onEditorLiveBodyRef.current?.(server);
    }
  }, [note.id, note.body, note.modified]);

  useEffect(() => {
    reloadNonceSeenRef.current = reloadNonce;
  }, [note.id]);

  /** Explicit reload from DB: replace buffer when reloadNonce bumps (user asked to sync). */
  useEffect(() => {
    if (reloadNonce === 0 || reloadNonce === reloadNonceSeenRef.current) return;
    const v = viewRef.current;
    if (!v || note.id !== noteIdRef.current) return;
    const server = normalizeLineSeparators(note.body);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (previewThrottleRef.current) clearTimeout(previewThrottleRef.current);
    v.dispatch({
      changes: { from: 0, to: v.state.doc.length, insert: server },
    });
    syncedBodyRef.current = server;
    titleValueRef.current = note.title;
    const t = titleRef.current;
    if (t && document.activeElement !== t) {
      t.value = note.title;
    }
    onEditorLiveBodyRef.current?.(server);
    setPreviewLiveBody(server);
    reloadNonceSeenRef.current = reloadNonce;
  }, [reloadNonce, note.id, note.body, note.title]);

  /** Remote title change (same id) when the title field is not focused. */
  useEffect(() => {
    const t = titleRef.current;
    if (!t || document.activeElement === t) return;
    if (t.value !== note.title) {
      t.value = note.title;
      titleValueRef.current = note.title;
    }
  }, [note.id, note.title, note.modified]);

  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: lineNumbersCompartment.current.reconfigure(
        showLineNumbers ? [foldGutter(), lineNumbers(), highlightActiveLineGutter()] : [foldGutter()],
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

  const wordCount = previewLiveBody.trim() ? previewLiveBody.trim().split(/\s+/).length : 0;
  const editorPx = showHeader ? 'pl-4 pr-2' : 'pl-3 pr-1';

  const ctxPos = ctxMenu
    ? clampFixedContextMenu(ctxMenu.x, ctxMenu.y, 200, 220)
    : { left: 0, top: 0 };

  const closeCtx = () => setCtxMenu(null);

  const runWithView = (fn: (v: EditorView) => void) => {
    const v = viewRef.current;
    if (!v) return;
    v.focus();
    fn(v);
    saveNow();
    closeCtx();
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0 relative">
      {showHeader && (
        <>
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <input
                  ref={titleRef}
                  type="text"
                  defaultValue={note.title}
                  key={note.id}
                  readOnly={!!note.filePath}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  className={`w-full text-2xl font-semibold bg-transparent border-none outline-none text-mnemo-text placeholder-mnemo-dim ${
                    note.filePath ? 'cursor-default opacity-90' : ''
                  }`}
                  placeholder="Untitled"
                  title={note.filePath ?? undefined}
                />
                {note.filePath && (
                  <div className="mt-1 text-[11px] text-mnemo-dim truncate font-normal" title={note.filePath}>
                    {note.filePath}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                <button
                  type="button"
                  aria-label="Edit markdown source"
                  onClick={() => {
                    setBodyMode('edit');
                    saveNoteBodyMode('edit');
                    requestAnimationFrame(() => viewRef.current?.focus());
                  }}
                  className={`text-[9px] leading-tight px-1.5 py-px rounded border cursor-pointer transition-colors whitespace-nowrap ${
                    bodyMode === 'edit'
                      ? 'border-mnemo-accent text-mnemo-text bg-mnemo-active'
                      : 'border-mnemo-border/70 text-mnemo-muted hover:bg-mnemo-hover'
                  }`}
                >
                  Markdown
                </button>
                <button
                  type="button"
                  aria-label="Preview rendered markdown"
                  onClick={() => {
                    setBodyMode('preview');
                    saveNoteBodyMode('preview');
                  }}
                  className={`text-[9px] leading-tight px-1.5 py-px rounded border cursor-pointer transition-colors whitespace-nowrap ${
                    bodyMode === 'preview'
                      ? 'border-mnemo-accent text-mnemo-text bg-mnemo-active'
                      : 'border-mnemo-border/70 text-mnemo-muted hover:bg-mnemo-hover'
                  }`}
                >
                  Preview
                </button>
              </div>
            </div>
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
      {!showHeader && (
        <div className={`flex items-center justify-end gap-0.5 px-3 pt-2 pb-1 ${editorPx}`}>
          <button
            type="button"
            aria-label="Edit markdown source"
            onClick={() => {
              setBodyMode('edit');
              saveNoteBodyMode('edit');
              requestAnimationFrame(() => viewRef.current?.focus());
            }}
            className={`text-[9px] leading-tight px-1.5 py-px rounded border cursor-pointer transition-colors whitespace-nowrap ${
              bodyMode === 'edit'
                ? 'border-mnemo-accent text-mnemo-text bg-mnemo-active'
                : 'border-mnemo-border/70 text-mnemo-muted hover:bg-mnemo-hover'
            }`}
          >
            Markdown
          </button>
          <button
            type="button"
            aria-label="Preview rendered markdown"
            onClick={() => {
              setBodyMode('preview');
              saveNoteBodyMode('preview');
            }}
            className={`text-[9px] leading-tight px-1.5 py-px rounded border cursor-pointer transition-colors whitespace-nowrap ${
              bodyMode === 'preview'
                ? 'border-mnemo-accent text-mnemo-text bg-mnemo-active'
                : 'border-mnemo-border/70 text-mnemo-muted hover:bg-mnemo-hover'
            }`}
          >
            Preview
          </button>
        </div>
      )}
      <div
        className={`flex-1 flex flex-col min-h-0 min-w-0 relative overflow-hidden ${editorPx} ${showHeader ? 'pb-3' : 'py-3'}`}
      >
        {bodyMode === 'preview' && (
          <div className="absolute inset-0 z-10 flex flex-col min-h-0 bg-mnemo-app overflow-hidden">
            <MarkdownNoteBody body={previewLiveBody} />
          </div>
        )}
        <div
          ref={containerRef}
          className={`flex-1 min-h-0 min-w-0 overflow-hidden ${bodyMode === 'preview' ? 'hidden' : ''}`}
        />
      </div>
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[199]" aria-hidden onMouseDown={closeCtx} />
          <div
            role="menu"
            className="fixed z-[200] min-w-[180px] rounded border border-mnemo-border bg-mnemo-panel-elevated shadow-lg py-1 text-xs text-mnemo-muted"
            style={{ left: ctxPos.left, top: ctxPos.top }}
            onMouseDown={e => e.preventDefault()}
          >
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover"
              onClick={() => runWithView(v => editorCut(v))}
            >
              Cut
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover"
              onClick={() => runWithView(v => editorCopy(v))}
            >
              Copy
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover"
              onClick={() => {
                const v = viewRef.current;
                if (!v) return;
                v.focus();
                void editorPaste(v).then(() => {
                  saveNow();
                  closeCtx();
                });
              }}
            >
              Paste
            </button>
            <div className="border-t border-mnemo-border my-1" />
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover"
              onClick={() => runWithView(v => wrapSelectionMarkdown(v, '**', '**'))}
            >
              Bold
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover"
              onClick={() => runWithView(v => wrapSelectionMarkdown(v, '*', '*'))}
            >
              Italic
            </button>
            <button
              type="button"
              role="menuitem"
              className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover"
              onClick={() => runWithView(v => void insertMarkdownLink(v))}
            >
              Link…
            </button>
          </div>
        </>
      )}
    </div>
  );
});

export default Editor;
