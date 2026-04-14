/**
 * CodeMirror 6: fenced-block language names + [[ wikilink]] completions.
 * Attach with `markdown(...).language.data.of({ autocomplete: createFenceWikiCompletionSource(...) })`
 * so completions apply to the same Language instance the editor uses (not the static `markdownLanguage`).
 * Paired with `autocompletion()` without `override` so nested JS/Python/… completions stay enabled.
 */
import {
  autocompletion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete';
import { LanguageDescription } from '@codemirror/language';
import { languages as languageDataLanguages } from '@codemirror/language-data';
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

/** Pass to `markdown({ base: markdownLanguage, codeLanguages: mnemoMarkdownCodeLanguages })`. */
export const mnemoMarkdownCodeLanguages = [...syncCodeLanguages, ...languageDataLanguages];

const allDescriptions = mnemoMarkdownCodeLanguages;

function collectLanguageLabels(): string[] {
  const out = new Set<string>();
  for (const ld of allDescriptions) {
    out.add(ld.name.toLowerCase());
    for (const a of ld.alias) out.add(a.toLowerCase());
    for (const e of ld.extensions) out.add(e.toLowerCase());
  }
  return [...out].sort((a, b) => a.localeCompare(b));
}

const FENCE_LANG_LABELS = collectLanguageLabels();

function fenceLanguageCompletions(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = line.text.slice(0, context.pos - line.from);
  const m = before.match(/^(\s*)(```+)([\w+#.\-]*)$/);
  if (!m) return null;
  const tickCount = m[2]!.length;
  if (tickCount < 3) return null;
  const partial = (m[3] ?? '').toLowerCase();
  const from = line.from + m[1]!.length + m[2]!.length;
  const opts = FENCE_LANG_LABELS.filter(l => !partial || l.startsWith(partial)).slice(0, 50);
  if (!opts.length) return null;
  return {
    from,
    options: opts.map(label => ({ label, type: 'keyword' })),
  };
}

function wikilinkCompletions(
  context: CompletionContext,
  getTitles: () => Promise<string[]>,
): Promise<CompletionResult | null> {
  const m = context.matchBefore(/\[\[([^\]]*)$/);
  if (!m) return Promise.resolve(null);
  const started = m.from;
  return getTitles().then(titles => {
    const partial = m.text.slice(2);
    const q = partial.trim().toLowerCase();
    const matches = titles.filter(t => !q || t.toLowerCase().includes(q) || t.toLowerCase().startsWith(q)).slice(0, 40);
    if (!matches.length) return null;
    return {
      from: started + 2,
      filter: false,
      options: matches.map(title => ({
        label: title,
        type: 'text' as const,
        apply: `${title}]]`,
      })),
    };
  });
}

function mnemoCompletions(
  context: CompletionContext,
  getTitles: () => Promise<string[]>,
): CompletionResult | Promise<CompletionResult | null> | null {
  const fence = fenceLanguageCompletions(context);
  if (fence) return fence;
  return wikilinkCompletions(context, getTitles);
}

/** Completion source for `language.data.of({ autocomplete: … })` on the configured markdown LanguageSupport. */
export function createFenceWikiCompletionSource(getTitles: () => Promise<string[]>): CompletionSource {
  return ctx => mnemoCompletions(ctx, getTitles);
}

/** Default autocompletion only — do not set `override` or nested language completions are disabled. */
export function mnemoBaseAutocompletionExtensions() {
  return [autocompletion()];
}
