/**
 * Escape a string for use inside YAML double-quoted scalars (e.g. frontmatter).
 * Backslashes must be escaped first so quote escapes remain correct.
 */
export function escapeYamlDoubleQuotedString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
