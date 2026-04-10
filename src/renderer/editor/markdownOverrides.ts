/**
 * User-controlled Markdown / CodeMirror CSS variables (--mnemo-editor-*, --mnemo-syntax-*).
 * Applied after theme variables so they layer correctly.
 */

let previousOverrideKeys: string[] = [];

/** Allowed custom property names (must match styles.css / mnemoCodeMirror.ts). */
export const MARKDOWN_OVERRIDE_KEY_PREFIXES = ['--mnemo-editor-', '--mnemo-syntax-'] as const;

export function isAllowedMarkdownCssVar(name: string): boolean {
  return MARKDOWN_OVERRIDE_KEY_PREFIXES.some(p => name.startsWith(p));
}

export function mergeMarkdownLayers(
  themeId: string,
  global: Record<string, string> | undefined,
  byTheme: Record<string, Record<string, string>> | undefined,
): Record<string, string> {
  return {
    ...(global ?? {}),
    ...(byTheme?.[themeId] ?? {}),
  };
}

/** Apply merged overrides; clears previous keys first so removals take effect. */
export function applyMarkdownOverridesToDocument(merged: Record<string, string>): void {
  const root = document.documentElement;
  for (const k of previousOverrideKeys) {
    root.style.removeProperty(k);
  }
  previousOverrideKeys = Object.keys(merged);
  for (const [k, v] of Object.entries(merged)) {
    if (!isAllowedMarkdownCssVar(k)) continue;
    root.style.setProperty(k, v);
  }
}

export function clearMarkdownOverridesFromDocument(): void {
  applyMarkdownOverridesToDocument({});
}
