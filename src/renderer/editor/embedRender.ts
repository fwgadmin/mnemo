/**
 * `![[Note title]]` embeds (one level deep): a Markdown note renders read-only, a spreadsheet note renders a
 * table of computed values, optionally limited to `#A1:D10` or `#Sheet2!A1:D10`.
 */
import type { Note } from '../../shared/types';
import { parseSheetDoc } from '../../shared/sheet';
import { sheetRows } from '../../shared/sheetFormula';
import { markdownBlockToHtml } from './richClipboard';

export interface EmbedTarget {
  title: string;
  sheet?: string;
  range?: string;
}

/** A line that is only `![[...]]` (optional surrounding whitespace). */
export const EMBED_LINE = /^\s*!\[\[([^\]\n]+)\]\]\s*$/;

export function parseEmbedTarget(inner: string): EmbedTarget | null {
  const [titlePart, frag] = inner.split('#', 2) as [string, string | undefined];
  const title = titlePart.split('|')[0]!.trim();
  if (!title) return null;
  if (!frag) return { title };
  const f = frag.trim();
  // `#Name!` = whole sheet (lets a sheet be named like a cell, e.g. Q1); cell-shaped text is a range.
  const sheetOnly = /^'?([^'!]+)'?!$/.exec(f);
  if (sheetOnly) return { title, sheet: sheetOnly[1]!.trim() };
  const m = /^(?:'?([^'!]+)'?!)?([A-Za-z]{1,3}\d{1,6}(?::[A-Za-z]{1,3}\d{1,6})?)$/.exec(f);
  if (m) return { title, sheet: m[1]?.trim(), range: m[2]!.toUpperCase() };
  return { title, sheet: f };
}

const MAX_EMBED_ROWS = 200;
const cache = new Map<string, { at: number; note: Note | null }>();

async function loadNote(title: string): Promise<Note | null> {
  const hit = cache.get(title.toLowerCase());
  if (hit && Date.now() - hit.at < 3000) return hit.note;
  const id = await window.mnemo.notes.resolveTitle(title);
  const note = id ? await window.mnemo.notes.read(id) : null;
  cache.set(title.toLowerCase(), { at: Date.now(), note });
  return note;
}

function sheetTableHtml(note: Note, target: EmbedTarget): string {
  const doc = parseSheetDoc(note.body);
  const sheet = target.sheet ? doc.sheets.find(s => s.name.toLowerCase() === target.sheet!.toLowerCase()) : doc.sheets[0];
  if (!sheet) return `<p class="mnemo-embed-missing">No sheet “${escapeHtml(target.sheet ?? '')}” in ${escapeHtml(note.title)}</p>`;
  const rows = sheetRows(doc, sheet, target.range).slice(0, MAX_EMBED_ROWS);
  if (!rows.length) return '<p class="mnemo-embed-missing">Empty sheet</p>';
  const numeric = (v: string) => /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v);
  const body = rows
    .map(r => `<tr>${r.map(v => `<td${numeric(v) ? ' class="num"' : ''}>${escapeHtml(v)}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="mnemo-embed-sheet"><tbody>${body}</tbody></table>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** Fill `container` with the embedded note (async). Nested embeds are shown as links, not expanded. */
export async function renderEmbedInto(container: HTMLElement, target: EmbedTarget): Promise<void> {
  container.classList.add('mnemo-embed');
  const head = document.createElement('div');
  head.className = 'mnemo-embed-title';
  head.textContent = target.title + (target.sheet || target.range ? ` · ${[target.sheet, target.range].filter(Boolean).join('!')}` : '');
  const body = document.createElement('div');
  body.className = 'mnemo-embed-body';
  body.textContent = 'Loading…';
  container.replaceChildren(head, body);
  try {
    const note = await loadNote(target.title);
    if (!note) {
      body.innerHTML = `<p class="mnemo-embed-missing">No note titled “${escapeHtml(target.title)}”.</p>`;
      return;
    }
    if (note.kind === 'sheet') {
      body.innerHTML = sheetTableHtml(note, target);
      return;
    }
    // One level only: nested ![[…]] lines become plain wikilinks.
    const md = note.body.replace(/^(\s*)!\[\[([^\]\n]+)\]\]\s*$/gm, '$1[[$2]]');
    body.innerHTML = markdownBlockToHtml(md); // sanitized by rehype-sanitize
  } catch (e) {
    body.textContent = e instanceof Error ? e.message : String(e);
  }
}
