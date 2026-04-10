import * as prettier from 'prettier/standalone';
import * as markdownPlugin from 'prettier/plugins/markdown';

export async function formatMarkdown(source: string): Promise<string> {
  return prettier.format(source, {
    parser: 'markdown',
    plugins: [markdownPlugin],
    proseWrap: 'preserve',
  });
}
