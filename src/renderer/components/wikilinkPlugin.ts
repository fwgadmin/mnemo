import { ViewPlugin, Decoration, DecorationSet, MatchDecorator, ViewUpdate } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { parseWikilinkInner } from '../../shared/wikilinks';

const wikilinkRe = /\[\[([^\]]+)\]\]/g;

const wikilinkMatcher = new MatchDecorator({
  regexp: wikilinkRe,
  decorate: (add, from, to, match) => {
    const inner = match[1];
    const innerStart = from + 2;
    const innerEnd = to - 2;
    const { target } = parseWikilinkInner(inner);

    add(from, from + 2, Decoration.mark({ class: 'cm-wikilink-bracket', tagName: 'span' }));

    const pipeIdx = inner.indexOf('|');
    if (pipeIdx !== -1) {
      const pipePos = innerStart + pipeIdx;
      add(innerStart, pipePos, Decoration.mark({ class: 'cm-wikilink-muted', tagName: 'span' }));
      add(pipePos, pipePos + 1, Decoration.mark({ class: 'cm-wikilink-pipe', tagName: 'span' }));
      add(
        pipePos + 1,
        innerEnd,
        Decoration.mark({
          class: 'cm-wikilink',
          tagName: 'span',
          attributes: { 'data-wikilink-target': target },
        }),
      );
    } else {
      add(
        innerStart,
        innerEnd,
        Decoration.mark({
          class: 'cm-wikilink',
          tagName: 'span',
          attributes: { 'data-wikilink-target': target },
        }),
      );
    }

    add(innerEnd, to, Decoration.mark({ class: 'cm-wikilink-bracket', tagName: 'span' }));
  },
});

const wikilinkPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = wikilinkMatcher.createDeco(view);
    }
    update(update: ViewUpdate) {
      this.decorations = wikilinkMatcher.updateDeco(update, this.decorations);
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

export function wikilinkDecorations() {
  return wikilinkPlugin;
}
