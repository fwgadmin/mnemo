/**
 * remark plugin: Obsidian `==highlight==` → `<mark>` (hast `mark` via `data.hName`).
 * Matches the editor's Highlight syntax closely enough for rendering: no spaces just inside the `==`, single line,
 * never inside code.
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  data?: { hName?: string };
}

const HIGHLIGHT = /==(?=[^\s=])([^\n]*?[^\s=])==/g;

function splitText(value: string): MdNode[] | null {
  HIGHLIGHT.lastIndex = 0;
  if (!HIGHLIGHT.test(value)) return null;
  HIGHLIGHT.lastIndex = 0;
  const out: MdNode[] = [];
  let last = 0;
  for (const m of value.matchAll(HIGHLIGHT)) {
    if (m.index! > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({ type: 'highlight', data: { hName: 'mark' }, children: [{ type: 'text', value: m[1]! }] });
    last = m.index! + m[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function walk(node: MdNode): void {
  if (!node.children) return;
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === 'text' && child.value) {
      const parts = splitText(child.value);
      if (parts) {
        next.push(...parts);
        continue;
      }
    } else if (child.type !== 'code' && child.type !== 'inlineCode') {
      walk(child);
    }
    next.push(child);
  }
  node.children = next;
}

export default function remarkHighlight() {
  return (tree: MdNode) => walk(tree);
}
