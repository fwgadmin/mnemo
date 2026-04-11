/**
 * Shared full-text search helpers (FTS5 + snippet display) — used by local store, Turso, and CLI.
 */

/** Build an FTS5 MATCH string from free text (AND of quoted tokens; reduces syntax errors). */
export function ftsMatchFromUserQuery(query: string): string | null {
  const raw = query.trim();
  if (!raw) return null;
  const terms = raw.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  return terms.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}

/** Words for LIKE fallback when FTS rejects the query. */
export function likeWordsFromUserQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Snippet line for list/search UI: prefer body excerpt; if the match is title-only, show title.
 */
export function snippetForSearchResult(title: string, body: string, query: string): string {
  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return body.substring(0, 120);
  const lowerTitle = title.toLowerCase();
  const lowerBody = body.toLowerCase();
  const titleMatches = terms.every(t => lowerTitle.includes(t.toLowerCase()));
  const bodyMatches = terms.some(t => lowerBody.includes(t.toLowerCase()));
  if (titleMatches && !bodyMatches) {
    return title.slice(0, 120);
  }
  return body.substring(0, 120);
}
