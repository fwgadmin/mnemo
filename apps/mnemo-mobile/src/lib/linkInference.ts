/** From desktop [src/shared/linkInference.ts]. */

export type NoteIndexEntry = { id: string; title: string; ref: number };

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function maskWikilinkRegions(text: string): string {
  return text.replace(/\[\[[^\]]+\]\]/g, (m) => ' '.repeat(m.length));
}

function titleMentionedInPlainText(scanText: string, title: string): boolean {
  const t = title.trim();
  if (t.length < 2) return false;
  const lower = t.toLowerCase();
  if (lower === 'untitled') return false;
  const words = t.split(/\s+/).filter(Boolean);
  try {
    if (words.length === 1) {
      return new RegExp(`\\b${escapeRegex(words[0])}\\b`, 'i').test(scanText);
    }
    return new RegExp(`\\b${words.map(escapeRegex).join('\\s+')}\\b`, 'i').test(scanText);
  } catch {
    return false;
  }
}

function inferRefTargetIds(
  body: string,
  refToId: Map<number, string>,
  selfId: string,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  const reHash = /(?:^|[\s([{<])#(\d{1,9})(?=\b|[^\d])/g;
  const reRefWord = /(?:^|\s)ref[:.]?\s*(\d{1,9})(?=\b|[^\d])/gi;

  const add = (refStr: string) => {
    const ref = parseInt(refStr, 10);
    if (!Number.isFinite(ref)) return;
    const id = refToId.get(ref);
    if (!id || id === selfId || seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };

  let m: RegExpExecArray | null;
  while ((m = reHash.exec(body)) !== null) add(m[1]);
  while ((m = reRefWord.exec(body)) !== null) add(m[1]);

  return out;
}

export function inferLinkTargetIds(
  body: string,
  selfId: string,
  notes: NoteIndexEntry[],
  options?: { minTitleLength?: number },
): string[] {
  const minLen = options?.minTitleLength ?? 2;
  const scanText = maskWikilinkRegions(body);
  const lowerScan = scanText.toLowerCase();

  const refToId = new Map<number, string>();
  for (const n of notes) {
    refToId.set(n.ref, n.id);
  }

  const byTitle: string[] = [];
  const others = notes.filter((n) => n.id !== selfId).sort((a, b) => b.title.length - a.title.length);

  for (const n of others) {
    const t = n.title.trim();
    if (t.length < minLen) continue;
    if (t.toLowerCase() === 'untitled') continue;
    if (!lowerScan.includes(t.toLowerCase())) continue;
    if (titleMentionedInPlainText(scanText, t)) {
      byTitle.push(n.id);
    }
  }

  const byRef = inferRefTargetIds(body, refToId, selfId);

  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...byTitle, ...byRef]) {
    if (!id || id === selfId || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function mergeOutgoingLinkTargets(
  explicitTargetIds: string[],
  inferredTargetIds: string[],
  selfId: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...explicitTargetIds, ...inferredTargetIds]) {
    if (!id || id === selfId) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
