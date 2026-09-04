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
    '---',
    '',
    note.body,
  ].join('\n');
}
