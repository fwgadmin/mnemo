import { describe, expect, it } from 'vitest';
import type { Note } from '../../shared/types';
import { serializeNoteMarkdown } from './noteMarkdown';

describe('serializeNoteMarkdown', () => {
  it('writes the complete canonical frontmatter and body', () => {
    const note: Note = {
      id: 'note-1',
      ref: 7,
      title: 'A "quoted" title',
      body: '# Body\n\nText',
      tags: ['Work', 'A "tag"'],
      created: '2026-01-02T03:04:05.000Z',
      modified: '2026-02-03T04:05:06.000Z',
      tenantId: 'team-a',
      links: [],
      hideHeader: true,
    };

    expect(serializeNoteMarkdown(note)).toBe([
      '---',
      'id: "note-1"',
      'ref: 7',
      'title: "A \\"quoted\\" title"',
      'tags: ["Work", "A \\"tag\\""]',
      'created: "2026-01-02T03:04:05.000Z"',
      'modified: "2026-02-03T04:05:06.000Z"',
      'tenantId: "team-a"',
      'hideHeader: true',
      '---',
      '',
      '# Body',
      '',
      'Text',
    ].join('\n'));
  });
});
