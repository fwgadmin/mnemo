/**
 * Human-readable CLI output (elite-style compact lines).
 */
import type { Note } from '../shared/types';

/** One line: `[42] Title` (ref may be null for legacy rows). */
export function formatListLine(ref: number | null, title: string): string {
  const r = ref != null ? String(ref) : '?';
  const t = (title || 'Untitled').replace(/\s+/g, ' ').trim();
  return `[${r}] ${t}`;
}

/** Full note for terminal: ref banner, title, body, minimal dates. */
export function formatShowHuman(note: Note): string {
  const refLine = note.ref != null ? `[${note.ref}]` : '[?]';
  const parts = [refLine, '', note.title, '', note.body];
  if (note.created || note.modified) {
    parts.push('', `created: ${note.created}`, `modified: ${note.modified}`);
  }
  return parts.join('\n');
}
