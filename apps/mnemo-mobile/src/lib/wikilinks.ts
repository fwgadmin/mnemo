/** From desktop [src/shared/wikilinks.ts]. */

export const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

export function parseWikilinkInner(inner: string): { target: string; display: string } {
  const trimmed = inner.trim();
  const pipe = trimmed.indexOf('|');
  if (pipe === -1) {
    return { target: trimmed, display: trimmed };
  }
  const target = trimmed.slice(0, pipe).trim();
  const display = trimmed.slice(pipe + 1).trim() || target;
  return { target, display };
}

export function extractWikilinks(text: string): string[] {
  const seen = new Set<string>();
  const links: string[] = [];
  const re = new RegExp(WIKILINK_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const { target } = parseWikilinkInner(match[1]);
    if (target && !seen.has(target)) {
      seen.add(target);
      links.push(target);
    }
  }
  return links;
}
