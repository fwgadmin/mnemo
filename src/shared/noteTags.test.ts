import { describe, expect, it } from 'vitest';
import { parseStoredTags } from './noteTags';

describe('parseStoredTags', () => {
  it('accepts JSON and already-decoded string arrays', () => {
    expect(parseStoredTags('["Work","Work/Meetings"]')).toEqual(['Work', 'Work/Meetings']);
    expect(parseStoredTags(['Personal'])).toEqual(['Personal']);
  });

  it('drops non-string array members', () => {
    expect(parseStoredTags('["Work", 7, null, false, "Ideas"]')).toEqual(['Work', 'Ideas']);
  });

  it.each(['not json', '{"category":"Work"}', 'null', null, undefined, 42])(
    'returns an empty array for malformed or non-array input %#',
    value => {
      expect(parseStoredTags(value)).toEqual([]);
    },
  );
});
