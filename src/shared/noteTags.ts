/**
 * Decode a persisted note tag value without allowing corrupt database rows to
 * break note listing, reading, searching, or backlink rendering.
 */
export function parseStoredTags(value: unknown): string[] {
  let decoded: unknown = value;

  if (typeof value === 'string') {
    try {
      decoded = JSON.parse(value);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(decoded)) return [];
  return decoded.filter((tag): tag is string => typeof tag === 'string');
}
