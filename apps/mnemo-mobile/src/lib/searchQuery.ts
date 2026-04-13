/** From desktop [src/shared/searchQuery.ts] — FTS + snippet helpers. */

export function ftsMatchFromUserQuery(query: string): string | null {
  const raw = query.trim();
  if (!raw) return null;
  const terms = raw.split(/\s+/).filter(Boolean);
  if (terms.length === 0) return null;
  return terms.map(t => `"${t.replace(/"/g, '""')}"`).join(' AND ');
}

export function likeWordsFromUserQuery(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

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
