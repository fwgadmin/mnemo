/**
 * CodeMirror splits lines with /\r\n?|\n/ only. These characters would otherwise
 * count as one logical line (one gutter number) while text visually wraps.
 * - Unicode LINE/PARAGRAPH SEPARATOR (U+2028 / U+2029)
 * - NEL U+0085 (C1 control, common in some UTF-8 exports)
 * - Vertical tab U+000B, form feed U+000C (occasional legacy / pasted text)
 */
export function normalizeLineSeparators(text: string): string {
  if (!text) return text;
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n\n')
    .replace(/\u0085/g, '\n')
    .replace(/\u000B/g, '\n')
    .replace(/\f/g, '\n');
}
