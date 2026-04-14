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
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import {
  acceptCompletion,
  completionStatus,
  hasNextSnippetField,
  nextSnippetField,
} from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { mnemoEditorTheme, mnemoSyntaxHighlighting } from '../editor/mnemoCodeMirror';
import { normalizeLineSeparators } from '../editor/lineSeparators';
import { formatMarkdown } from '../editor/formatMarkdown';
import {
  createFenceWikiCompletionSource,
  mnemoBaseAutocompletionExtensions,
  mnemoMarkdownCodeLanguages,
} from '../editor/mnemoAutocomplete';
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

/** Inline note body: preview (eye) vs source (pencil) — small outline icons, currentColor. */
function IconMarkdownPreview() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function IconMarkdownSource() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden
    >
      <path d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

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
  /** Summarize selection to clipboard (plain or Markdown-formatted). */
  copyAsSummary: (formattedMarkdown?: boolean) => Promise<void>;
  /** Summarize clipboard and insert at selection. */
  pasteAsSummary: (formattedMarkdown?: boolean) => Promise<void>;
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
  editorSpellcheck?: boolean;
  editorAutocomplete?: boolean;
  /** When false, context menu omits Copy/Paste as summary. */
  showSummaryMenuItems?: boolean;
  tenantId?: string;
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
    editorSpellcheck = true,
    editorAutocomplete = true,
    showSummaryMenuItems = false,
    tenantId = 'default',
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
  const spellcheckCompartment = useRef(new Compartment());
  const autocompleteCompartment = useRef(new Compartment());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [summarizing, setSummarizing] = useState(false);
  const summarizingRef = useRef(false);
  summarizingRef.current = summarizing;
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

  const getWikiTitles = useCallback(async () => {
    const list = await window.mnemo.notes.list(tenantId);
    return list.map(n => n.title).filter(Boolean);
  }, [tenantId]);
  const getWikiTitlesRef = useRef(getWikiTitles);
  getWikiTitlesRef.current = getWikiTitles;

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
      copyAsSummary: async (formattedMarkdown = false) => {
        const v = viewRef.current;
        if (!v || summarizingRef.current) return;
        const sel = v.state.selection.main;
        const text = v.state.sliceDoc(sel.from, sel.to);
        if (!text.trim()) return;
        setSummarizing(true);
        v.focus();
        try {
          const r = await window.mnemo.llm.summarize(text, { formattedMarkdown });
          if (r.ok) await clipboardWriteText(r.summary);
          else window.alert(r.error);
        } finally {
          setSummarizing(false);
        }
      },
      pasteAsSummary: async (formattedMarkdown = false) => {
        const v = viewRef.current;
        if (!v || summarizingRef.current) return;
        const clip = normalizeLineSeparators(await clipboardReadText());
        if (!clip.trim()) return;
        setSummarizing(true);
        v.focus();
        try {
          const r = await window.mnemo.llm.summarize(clip, { formattedMarkdown });
          if (r.ok) {
            const sel = v.state.selection.main;
            v.dispatch({ changes: { from: sel.from, to: sel.to, insert: r.summary } });
            saveNow();
          } else {
            window.alert(r.error);
          }
        } finally {
          setSummarizing(false);
        }
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

    const markdownSupport = markdown({ base: markdownLanguage, codeLanguages: mnemoMarkdownCodeLanguages });

    /** Fold gutter left of line numbers so folding sits outside the number column. */
    const gutterExtensions = showLineNumbers
      ? [foldGutter(), lineNumbers(), highlightActiveLineGutter()]
      : [foldGutter()];

    const state = EditorState.create({
      doc: normalizeLineSeparators(note.body),
      extensions: [
        lineNumbersCompartment.current.of(gutterExtensions),
        spellcheckCompartment.current.of(
          EditorView.contentAttributes.of({ spellcheck: editorSpellcheck !== false ? 'true' : 'false' }),
        ),
        autocompleteCompartment.current.of(
          editorAutocomplete !== false ? [...mnemoBaseAutocompletionExtensions()] : [],
        ),
        history(),
        drawSelection(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        markdownSupport.language.data.of({
          autocomplete: createFenceWikiCompletionSource(() => getWikiTitlesRef.current()),
        }),
        markdownSupport,
        mnemoSyntaxHighlighting,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        mnemoEditorTheme,
        Prec.highest(
          keymap.of([
            {
              key: 'Tab',
              run: (view) => {
                if (hasNextSnippetField(view.state)) return nextSnippetField(view);
                if (completionStatus(view.state) === 'active') return acceptCompletion(view);
                return false;
              },
            },
            {
              key: 'Enter',
              run: (view) => {
                const { state } = view;
                const pos = state.selection.main.head;
                if (pos !== state.selection.main.to) return false;
                const line = state.doc.lineAt(pos);
                if (pos !== line.to) return false;
                const m = /^(\s*)(```+)([\w+#.\-]+)\s*$/.exec(line.text);
                if (!m || m[2]!.length < 3) return false;
                const indent = m[1] ?? '';
                const lb = state.lineBreak;
                const insert = lb + lb + indent + '```';
                view.dispatch({
                  changes: { from: pos, insert },
                  selection: { anchor: pos + lb.length },
                });
                return true;
              },
            },
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

  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({
      effects: spellcheckCompartment.current.reconfigure(
        EditorView.contentAttributes.of({ spellcheck: editorSpellcheck !== false ? 'true' : 'false' }),
      ),
    });
  }, [editorSpellcheck]);

  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({
      effects: autocompleteCompartment.current.reconfigure(
        editorAutocomplete !== false ? [...mnemoBaseAutocompletionExtensions()] : [],
      ),
    });
  }, [editorAutocomplete]);

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

  const ctxMenuHeight = showSummaryMenuItems ? 420 : 220;
  const ctxPos = ctxMenu
    ? clampFixedContextMenu(ctxMenu.x, ctxMenu.y, 200, ctxMenuHeight)
    : { left: 0, top: 0 };

  const closeCtx = () => setCtxMenu(null);

  const runCopyAsSummary = async (formattedMarkdown: boolean) => {
    const v = viewRef.current;
    if (!v || summarizing) return;
    const sel = v.state.selection.main;
    const text = v.state.sliceDoc(sel.from, sel.to);
    if (!text.trim()) {
      closeCtx();
      return;
    }
    setSummarizing(true);
    closeCtx();
    v.focus();
    try {
      const r = await window.mnemo.llm.summarize(text, { formattedMarkdown });
      if (r.ok) await clipboardWriteText(r.summary);
      else window.alert(r.error);
    } finally {
      setSummarizing(false);
    }
  };

  const runPasteAsSummary = async (formattedMarkdown: boolean) => {
    const v = viewRef.current;
    if (!v || summarizing) return;
    const clip = normalizeLineSeparators(await clipboardReadText());
    if (!clip.trim()) {
      closeCtx();
      return;
    }
    setSummarizing(true);
    closeCtx();
    v.focus();
    try {
      const r = await window.mnemo.llm.summarize(clip, { formattedMarkdown });
      if (r.ok) {
        const sel = v.state.selection.main;
        v.dispatch({ changes: { from: sel.from, to: sel.to, insert: r.summary } });
        saveNow();
      } else {
        window.alert(r.error);
      }
    } finally {
      setSummarizing(false);
    }
  };

  const runWithView = (fn: (v: EditorView) => void) => {
    const v = viewRef.current;
    if (!v) return;
    v.focus();
    fn(v);
    saveNow();
    closeCtx();
  };

  const toggleBodyMode = useCallback(() => {
    setBodyMode(prev => {
      const next = prev === 'edit' ? 'preview' : 'edit';
      saveNoteBodyMode(next);
      if (next === 'edit') {
        requestAnimationFrame(() => viewRef.current?.focus());
      }
      return next;
    });
  }, []);

  const noteBodyModeToggleBtn = (
    <button
      type="button"
      onClick={toggleBodyMode}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-mnemo-muted/70 hover:bg-mnemo-hover/60 hover:text-mnemo-text transition-colors"
      aria-label={bodyMode === 'edit' ? 'Show rendered preview' : 'Edit markdown source'}
      title={bodyMode === 'edit' ? 'Preview' : 'Edit source'}
    >
      {bodyMode === 'edit' ? <IconMarkdownPreview /> : <IconMarkdownSource />}
    </button>
  );

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
              <div className="flex shrink-0 items-center pt-0.5">{noteBodyModeToggleBtn}</div>
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
        <div className={`flex items-center justify-end px-3 pt-2 pb-1 ${editorPx}`}>{noteBodyModeToggleBtn}</div>
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
        {summarizing && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center bg-mnemo-app/60 pointer-events-none">
            <span className="rounded-md border border-mnemo-border bg-mnemo-panel-elevated px-4 py-2 text-xs text-mnemo-muted shadow">
              Summarizing…
            </span>
          </div>
        )}
      </div>
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-[199]" aria-hidden onMouseDown={closeCtx} />
          <div
            role="menu"
            className="fixed z-[200] min-w-[240px] rounded border border-mnemo-border bg-mnemo-panel-elevated shadow-lg py-1 text-xs text-mnemo-muted"
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
            {showSummaryMenuItems && (
              <>
                <div className="border-t border-mnemo-border my-1" />
                <button
                  type="button"
                  role="menuitem"
                  disabled={summarizing}
                  title="Shortcut: Ctrl+Shift+C (Linux/Windows) or ⌘⇧C (macOS)"
                  className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover disabled:opacity-50"
                  onClick={() => void runCopyAsSummary(false)}
                >
                  Copy as summary
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={summarizing}
                  title="Shortcut: Ctrl+Shift+V when editor focused — overrides Markdown preview for this chord"
                  className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover disabled:opacity-50"
                  onClick={() => void runPasteAsSummary(false)}
                >
                  Paste as summary
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={summarizing}
                  title="Shortcut: Ctrl+Alt+C / ⌥⌘C"
                  className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover disabled:opacity-50"
                  onClick={() => void runCopyAsSummary(true)}
                >
                  Copy as formatted summary (Markdown)
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={summarizing}
                  title="Shortcut: Ctrl+Alt+V / ⌥⌘V"
                  className="w-full px-3 py-1.5 text-left hover:bg-mnemo-hover disabled:opacity-50"
                  onClick={() => void runPasteAsSummary(true)}
                >
                  Paste as formatted summary (Markdown)
                </button>
              </>
            )}
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
