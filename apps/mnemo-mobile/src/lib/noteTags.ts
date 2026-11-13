/** Keep persisted-tag decoding aligned with desktop until shared-core extraction (MNE-106). */
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
