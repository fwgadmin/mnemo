// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  MAX_EMBEDDED_MEDIA_BYTES,
  isEmbeddableFileType,
  markdownForMediaFile,
  mediaTitle,
  parseMediaDataType,
  parseMediaDisplayOptions,
} from './mediaMarkdown';

describe('embedded media Markdown', () => {
  it('parses MIME and clamps display options', () => {
    expect(parseMediaDataType('data:image/png;base64,AA==')).toBe('image/png');
    expect(parseMediaDisplayOptions('mnemo:w=250;align=right')).toEqual({ width: 100, align: 'right' });
    expect(parseMediaDisplayOptions(undefined)).toEqual({ width: 80, align: 'center' });
    expect(mediaTitle({ width: 65, align: 'left' })).toBe('mnemo:w=65;align=left');
  });

  it('distinguishes supported and unsupported file types', () => {
    expect(isEmbeddableFileType('image/png')).toBe(true);
    expect(isEmbeddableFileType('application/pdf')).toBe(true);
    expect(isEmbeddableFileType('application/zip')).toBe(false);
  });

  it('encodes an image as editable Markdown', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'diagram.png', { type: 'image/png' });
    const markdown = await markdownForMediaFile(file);
    expect(markdown).toContain('![diagram.png](data:image/png;base64,');
    expect(markdown).toContain('"mnemo:w=80;align=center"');
  });

  it('rejects oversized media before reading it', async () => {
    const file = new File([new Uint8Array(1)], 'huge.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: MAX_EMBEDDED_MEDIA_BYTES + 1 });
    await expect(markdownForMediaFile(file)).rejects.toThrow('larger than the 12 MB');
  });
});
