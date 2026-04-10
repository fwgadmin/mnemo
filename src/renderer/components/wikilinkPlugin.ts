import { ViewPlugin, Decoration, DecorationSet, MatchDecorator, ViewUpdate } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

/** Regex matching [[wikilink]] syntax */
const wikilinkRe = /\[\[([^\]]+)\]\]/g;

/** MatchDecorator that finds all [[wikilinks]] and applies decorations */
const wikilinkMatcher = new MatchDecorator({
  regexp: wikilinkRe,
  decoration: (match) => {
    return Decoration.mark({
      class: 'cm-wikilink-wrapper',
      tagName: 'span',
    });
  },
  decorate: (add, from, to, match) => {
    // Decorate the opening [[
    add(from, from + 2, Decoration.mark({ class: 'cm-wikilink-bracket', tagName: 'span' }));
    // Decorate the inner text (the actual link target)
    add(from + 2, to - 2, Decoration.mark({ class: 'cm-wikilink', tagName: 'span' }));
    // Decorate the closing ]]
    add(to - 2, to, Decoration.mark({ class: 'cm-wikilink-bracket', tagName: 'span' }));
  },
});

/** ViewPlugin that maintains wikilink decorations */
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
  }
);

/** Convenience function to add wikilink decorations to an editor */
export function wikilinkDecorations() {
  return wikilinkPlugin;
}

