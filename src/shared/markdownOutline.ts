/** ATX headings only (matches editor / preview outline). */
export function extractMarkdownHeadings(body: string): { level: number; text: string; line: number }[] {
  const lines = body.split('\n');
  const out: { level: number; text: string; line: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(#{1,6})\s+(.+)$/.exec(lines[i].trimEnd());
    if (m) out.push({ level: m[1].length, text: m[2].trim(), line: i + 1 });
  }
  return out;
}
