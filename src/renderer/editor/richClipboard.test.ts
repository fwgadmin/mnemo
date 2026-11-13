// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  MNEMO_CLIPBOARD_ATTR,
  htmlToMarkdown,
  markdownToClipboardHtml,
  shouldConvertHtmlPaste,
} from './richClipboard';

const HASH = 'b'.repeat(64);

describe('HTML paste → Markdown', () => {
  it('converts headings, emphasis, links, lists, and tables', () => {
    const md = htmlToMarkdown(
      '<h2>Plan</h2><p>Some <strong>bold</strong> and <em>italic</em> with a <a href="https://example.com">link</a>.</p>' +
        '<ul><li>one</li><li>two</li></ul>' +
        '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>',
    );
    expect(md).toContain('## Plan');
    expect(md).toContain('**bold**');
    expect(md).toContain('*italic*');
    expect(md).toContain('[link](https://example.com)');
    expect(md).toMatch(/^- one$/m);
    expect(htmlToMarkdown('<ol start="3"><li>c</li><li>d</li></ol>')).toBe('3. c\n4. d');
    expect(md).toMatch(/\|\s*A\s*\|\s*B\s*\|/);
  });

  it('uses ==highlight==, keeps underlined text, and strips scripts and styles', () => {
    const md = htmlToMarkdown('<p><mark>hot</mark> <u>under</u></p><script>alert(1)</script><style>p{}</style>');
    expect(md).toBe('==hot== under');
  });

  it('keeps remote and attachment images but drops inline data/file images', () => {
    expect(htmlToMarkdown('<p><img src="https://x.test/a.png" alt="A"></p>')).toBe('![A](https://x.test/a.png)');
    expect(htmlToMarkdown(`<p><img src="mnemo-asset://asset/${HASH}.png" alt="B"></p>`)).toBe(
      `![B](mnemo-asset://asset/${HASH}.png)`,
    );
    expect(htmlToMarkdown('<p>x<img src="data:image/png;base64,AA=="></p>')).toBe('x');
    expect(htmlToMarkdown('<p>y<img src="file:///etc/passwd"></p>')).toBe('y');
  });

  it('unwraps the Google Docs guid wrapper', () => {
    expect(htmlToMarkdown('<b style="font-weight:normal;" id="docs-internal-guid-1234"><p>Doc text</p></b>')).toBe(
      'Doc text',
    );
  });
});

describe('when to convert HTML', () => {
  it('skips code editors, Mnemo copies, and structureless HTML', () => {
    expect(shouldConvertHtmlPaste(['text/plain', 'text/html', 'vscode-editor-data'], '<p>x</p>')).toBe(false);
    expect(shouldConvertHtmlPaste(['text/html'], `<div ${MNEMO_CLIPBOARD_ATTR}="1"><p>x</p></div>`)).toBe(false);
    expect(shouldConvertHtmlPaste(['text/html'], '<div><span style="color:red">const x</span></div>')).toBe(false);
    expect(shouldConvertHtmlPaste(['text/html'], '<p>Hello <b>there</b></p>')).toBe(true);
  });
});

describe('Markdown copy → HTML', () => {
  it('renders sanitized GFM and marks the payload as Mnemo’s', async () => {
    const html = await markdownToClipboardHtml('# T\n\n**b** ~~s~~\n\n<script>x</script>\n\n[j](javascript:alert(1))');
    expect(html.startsWith(`<div ${MNEMO_CLIPBOARD_ATTR}="1">`)).toBe(true);
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('<strong>b</strong>');
    expect(html).toContain('<del>s</del>');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });

  it('inlines attachment images within the budget', async () => {
    const md = `![a](mnemo-asset://asset/${HASH}.png)`;
    const inlined = await markdownToClipboardHtml(md, { inlineAsset: async () => 'data:image/png;base64,QUJD' });
    expect(inlined).toContain('src="data:image/png;base64,QUJD"');
    const overBudget = await markdownToClipboardHtml(md, {
      inlineAsset: async () => 'data:image/png;base64,QUJD',
      inlineBudgetBytes: 4,
    });
    expect(overBudget).toContain(`src="mnemo-asset://asset/${HASH}.png"`);
  });
});
