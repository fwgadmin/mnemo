/**
 * CLI text / export formats for the note link graph (wikilinks + inferred links → note_links).
 */

export type GraphNode = { id: string; ref: number; title: string };
export type GraphLink = { source: string; target: string };

export type GraphFormat = 'tree' | 'edges' | 'dot' | 'mermaid' | 'json';

function fmtLabel(n: { ref: number; title: string }): string {
  const t = (n.title || 'Untitled').replace(/\s+/g, ' ').trim();
  const cut = t.length > 52 ? t.slice(0, 49) + '…' : t;
  return `[${n.ref}] ${cut}`;
}

function escapeDot(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Git-inspired ASCII tree: DFS from each unvisited component (sorted by ref). */
export function renderGraphTree(nodes: GraphNode[], links: GraphLink[]): string {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const { source, target } of links) {
    if (byId.has(source) && byId.has(target)) {
      adj.get(source)!.push(target);
    }
  }
  for (const arr of adj.values()) {
    arr.sort((a, b) => byId.get(a)!.ref - byId.get(b)!.ref);
  }

  const lines: string[] = [];
  const n = nodes.length;
  const m = links.length;
  lines.push(`Mnemo link graph · ${n} note${n !== 1 ? 's' : ''} · ${m} link${m !== 1 ? 's' : ''}`);
  lines.push('');

  const visited = new Set<string>();
  const sorted = [...nodes].sort((a, b) => a.ref - b.ref);

  function walkChild(tid: string, prefix: string, isLast: boolean): void {
    const tn = byId.get(tid);
    if (!tn) return;
    const branch = isLast ? '└── ' : '├── ';
    const ext = prefix + branch;

    if (visited.has(tid)) {
      lines.push(`${ext}→ ${fmtLabel(tn)}  ◀`);
      return;
    }
    visited.add(tid);
    lines.push(`${ext}* ${fmtLabel(tn)}`);

    const kids = adj.get(tid) ?? [];
    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    kids.forEach((kid, i) => {
      walkChild(kid, childPrefix, i === kids.length - 1);
    });
  }

  for (const start of sorted) {
    if (visited.has(start.id)) continue;
    lines.push(`* ${fmtLabel(start)}`);
    visited.add(start.id);
    const kids = adj.get(start.id) ?? [];
    kids.forEach((kid, i) => {
      walkChild(kid, '', i === kids.length - 1);
    });
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

export function renderGraphEdges(nodes: GraphNode[], links: GraphLink[]): string {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const lines: string[] = [];
  const sorted = [...links].sort((a, b) => {
    const sa = byId.get(a.source);
    const sb = byId.get(b.source);
    if (!sa || !sb) return 0;
    if (sa.ref !== sb.ref) return sa.ref - sb.ref;
    const ta = byId.get(a.target);
    const tb = byId.get(b.target);
    if (!ta || !tb) return 0;
    return ta.ref - tb.ref;
  });
  lines.push(`outgoing links (${sorted.length}):`);
  lines.push('');
  for (const { source, target } of sorted) {
    const s = byId.get(source);
    const t = byId.get(target);
    if (!s || !t) continue;
    lines.push(`  ${fmtLabel(s)}  ──→  ${fmtLabel(t)}`);
  }
  return lines.join('\n');
}

export function renderGraphDot(nodes: GraphNode[], links: GraphLink[]): string {
  const lines: string[] = [];
  lines.push('digraph mnemo_notes {');
  lines.push('  rankdir=LR;');
  lines.push('  node [shape=box, fontname="Helvetica"];');
  lines.push('  edge [arrowhead=vee];');
  for (const n of nodes) {
    const id = `n_${n.ref}`;
    const lab = escapeDot(`${n.ref}: ${(n.title || 'Untitled').replace(/\s+/g, ' ').trim()}`);
    lines.push(`  "${id}" [label="${lab}"];`);
  }
  for (const { source, target } of links) {
    const s = nodes.find(x => x.id === source);
    const t = nodes.find(x => x.id === target);
    if (!s || !t) continue;
    lines.push(`  "n_${s.ref}" -> "n_${t.ref}";`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function renderGraphMermaid(nodes: GraphNode[], links: GraphLink[]): string {
  const lines: string[] = [];
  lines.push('graph LR');
  for (const n of nodes) {
    const lab = `${n.ref}: ${(n.title || 'Untitled').replace(/"/g, "'").replace(/\s+/g, ' ').trim()}`;
    lines.push(`  n${n.ref}["${lab}"]`);
  }
  for (const { source, target } of links) {
    const s = nodes.find(x => x.id === source);
    const t = nodes.find(x => x.id === target);
    if (!s || !t) continue;
    lines.push(`  n${s.ref} --> n${t.ref}`);
  }
  return lines.join('\n');
}

export function formatGraphOutput(
  format: GraphFormat,
  nodes: GraphNode[],
  links: GraphLink[],
): string {
  switch (format) {
    case 'json':
      return JSON.stringify({ nodes, links }, null, 2);
    case 'dot':
      return renderGraphDot(nodes, links);
    case 'mermaid':
      return renderGraphMermaid(nodes, links);
    case 'edges':
      return renderGraphEdges(nodes, links);
    case 'tree':
    default:
      return renderGraphTree(nodes, links);
  }
}

export function parseGraphArgs(args: string[]): { format: GraphFormat } {
  let format: GraphFormat = 'tree';
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--format' || a === '-f') {
      const v = args[++i];
      if (!v) {
        console.error(`Missing value for ${a}`);
        process.exit(1);
      }
      if (v === 'tree' || v === 'edges' || v === 'dot' || v === 'mermaid' || v === 'json') {
        format = v;
      } else {
        console.error(`Invalid --format "${v}" (use: tree, edges, dot, mermaid, json)`);
        process.exit(1);
      }
      continue;
    }
    if (a?.startsWith('-')) {
      console.error(`Unknown option: ${a}`);
      process.exit(1);
    }
    console.error('Unexpected argument to graph');
    process.exit(1);
  }
  return { format };
}
