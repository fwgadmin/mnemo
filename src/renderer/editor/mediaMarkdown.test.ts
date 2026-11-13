// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  MAX_EMBEDDED_MEDIA_BYTES,
  isEmbeddableFileType,
  markdownForMediaFile,
  mediaTitle,
  parseMediaDataType,
  parseMediaDisplayOptions,
} from './mediaMarkdown';

const HASH = 'a'.repeat(64);
const fakeStore = vi.fn(async (input: { mime: string }) => ({
  url: `mnemo-asset://asset/${HASH}.${input.mime === 'application/pdf' ? 'pdf' : 'png'}`,
}));

describe('embedded media Markdown', () => {
  it('parses MIME and clamps display options', () => {
    expect(parseMediaDataType('data:image/png;base64,AA==')).toBe('image/png');
    expect(parseMediaDataType(`mnemo-asset://asset/${HASH}.webm`)).toBe('video/webm');
    expect(parseMediaDataType('mnemo-asset://asset/nothex.png')).toBeNull();
    expect(parseMediaDisplayOptions('mnemo:w=250;align=right')).toEqual({ width: 100, align: 'right' });
    expect(parseMediaDisplayOptions(undefined)).toEqual({ width: 80, align: 'center' });
    expect(mediaTitle({ width: 65, align: 'left' })).toBe('mnemo:w=65;align=left');
  });

  it('distinguishes supported and unsupported file types', () => {
    expect(isEmbeddableFileType('image/png')).toBe(true);
    expect(isEmbeddableFileType('application/pdf')).toBe(true);
    expect(isEmbeddableFileType('application/zip')).toBe(false);
  });

  it('stores an image as an attachment and embeds its asset URL', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'diagram.png', { type: 'image/png' });
    const markdown = await markdownForMediaFile(file, fakeStore);
    expect(markdown).toBe(`![diagram.png](mnemo-asset://asset/${HASH}.png "mnemo:w=80;align=center")`);
    const call = fakeStore.mock.calls.at(-1)![0] as unknown as { bytes: ArrayBuffer; name: string };
    expect(new Uint8Array(call.bytes)).toEqual(new Uint8Array([1, 2, 3]));
    expect(call.name).toBe('diagram.png');
  });

  it('links non-inline files as downloadable attachments', async () => {
    const file = new File([new Uint8Array([1])], 'spec.pdf', { type: 'application/pdf' });
    expect(await markdownForMediaFile(file, fakeStore)).toBe(
      `[📎 spec.pdf](mnemo-asset://asset/${HASH}.pdf "mnemo:attachment")`,
    );
  });

  it('sanitizes markdown-breaking label characters', async () => {
    const file = new File([new Uint8Array([1])], '[diagram].png', { type: 'image/png' });
    const markdown = await markdownForMediaFile(file, fakeStore);
    expect(markdown).toContain('![diagram .png]');
  });

  it('rejects oversized media before reading it', async () => {
    const file = new File([new Uint8Array(1)], 'huge.png', { type: 'image/png' });
    Object.defineProperty(file, 'size', { value: MAX_EMBEDDED_MEDIA_BYTES + 1 });
    await expect(markdownForMediaFile(file, fakeStore)).rejects.toThrow('larger than the 10 MB');
  });
});
