/** IDE file tabs: stable tab id (prefs) ↔ absolute file path. Not vault UUIDs. */

const PREFIX = 'file:';

export function isFileTabId(id: string): boolean {
  return id.startsWith(PREFIX) && id.length > PREFIX.length;
}

/** Encode absolute path for use as a tab id (prefs / openTabIds). */
export function encodeFileTabId(absPath: string): string {
  return `${PREFIX}${encodeURIComponent(absPath)}`;
}

/** Decode path from tab id; null if invalid. */
export function decodeFileTabPath(id: string): string | null {
  if (!isFileTabId(id)) return null;
  try {
    return decodeURIComponent(id.slice(PREFIX.length));
  } catch {
    return null;
  }
}

export function fileTabBasename(absPath: string): string {
  const s = absPath.replace(/[/\\]+$/, '');
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return i >= 0 ? s.slice(i + 1) : s;
}
