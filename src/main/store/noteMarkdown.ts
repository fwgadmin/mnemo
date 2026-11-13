import type { Note } from '../../shared/types';
import { escapeYamlDoubleQuotedString } from '../../shared/yamlEscape';

function quoted(value: string): string {
  return `"${escapeYamlDoubleQuotedString(value)}"`;
}

/** Canonical vault representation used by every desktop note store. */
export function serializeNoteMarkdown(note: Note): string {
  return [
    '---',
    `id: ${quoted(note.id)}`,
    `ref: ${note.ref}`,
    `title: ${quoted(note.title)}`,
    `tags: [${note.tags.map(quoted).join(', ')}]`,
    `created: ${quoted(note.created)}`,
    `modified: ${quoted(note.modified)}`,
    `tenantId: ${quoted(note.tenantId)}`,
    `hideHeader: ${note.hideHeader}`,
    // Sheet notes: the body is the spreadsheet document (JSON); kept in a fence so the file stays valid Markdown.
    ...(note.kind === 'sheet' ? ['kind: "sheet"', '---', '', '```mnemo-sheet', note.body, '```'] : ['---', '', note.body]),
  ].join('\n');
}
