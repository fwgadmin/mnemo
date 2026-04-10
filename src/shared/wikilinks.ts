/**
 * Shared [[wikilink]] parsing — used by the editor, save pipeline, and CLI.
 */

/** Match [[inner]]; create a new RegExp when using .exec in a loop (global flag state). */
export const WIKILINK_PATTERN = /\[\[([^\]]+)\]\]/g;

/** Extract unique wikilink target strings (trimmed inner text). */
export function extractWikilinks(text: string): string[] {
  const links: string[] = [];
  const re = new RegExp(WIKILINK_PATTERN.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const target = match[1].trim();
    if (target && !links.includes(target)) {
      links.push(target);
    }
  }
  return links;
}
