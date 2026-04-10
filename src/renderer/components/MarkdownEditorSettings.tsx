import { useEffect, useMemo, useState } from 'react';

type Row = { key: string; label: string; kind: 'text' | 'color' };

const ROWS: Row[] = [
  { key: '--mnemo-editor-font-size', label: 'Font size', kind: 'text' },
  { key: '--mnemo-editor-line-height', label: 'Line height', kind: 'text' },
  { key: '--mnemo-editor-heading', label: 'Heading color', kind: 'color' },
  { key: '--mnemo-editor-link', label: 'Links & wikilinks', kind: 'color' },
  { key: '--mnemo-editor-code-fg', label: 'Inline code', kind: 'color' },
  { key: '--mnemo-editor-strong', label: 'Bold', kind: 'color' },
  { key: '--mnemo-editor-emphasis', label: 'Italic', kind: 'color' },
  { key: '--mnemo-editor-quote', label: 'Block quote', kind: 'color' },
  { key: '--mnemo-syntax-keyword', label: 'Code: keywords', kind: 'color' },
  { key: '--mnemo-syntax-string', label: 'Code: strings', kind: 'color' },
  { key: '--mnemo-syntax-comment', label: 'Code: comments', kind: 'color' },
  { key: '--mnemo-editor-caret', label: 'Caret', kind: 'color' },
];

function isHex6(v: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(v.trim());
}

function normalizePickerHex(hex: string | null | undefined, fallback: string): string {
  if (!hex || typeof hex !== 'string') return fallback;
  const t = hex.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(t)) return t;
  if (/^#[0-9a-fA-F]{3}$/.test(t)) {
    const r = t[1]!;
    const g = t[2]!;
    const b = t[3]!;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
}

function MarkdownColorRow({
  label,
  value,
  onTextChange,
  onApplyHex,
  onClear,
}: {
  label: string;
  value: string;
  onTextChange: (v: string) => void;
  onApplyHex: (hex: string) => void;
  onClear: () => void;
}) {
  const baseline = '#888888';
  const [draftHex, setDraftHex] = useState(() => normalizePickerHex(isHex6(value) ? value : null, baseline));

  useEffect(() => {
    setDraftHex(normalizePickerHex(isHex6(value) ? value : null, baseline));
  }, [value]);

  const committed = isHex6(value) ? value : baseline;
  const dirty = draftHex.toLowerCase() !== committed.toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0 w-full">
      <input
        type="color"
        aria-label={label}
        className="h-9 w-12 shrink-0 cursor-pointer rounded border border-mnemo-border bg-mnemo-app"
        value={draftHex}
        onChange={e => setDraftHex(e.target.value)}
      />
      <input
        type="text"
        value={value}
        onChange={e => onTextChange(e.target.value)}
        placeholder="#rrggbb or color-mix(…)"
        className="min-w-0 flex-1 basis-[min(100%,12rem)] px-2 py-1.5 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs font-mono"
      />
      <button
        type="button"
        disabled={!dirty}
        onClick={() => onApplyHex(draftHex)}
        className="px-2.5 py-1 rounded text-[11px] font-medium bg-mnemo-accent text-mnemo-bg-app hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
      >
        Apply
      </button>
      {value !== '' && (
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-[10px] text-mnemo-dim hover:text-mnemo-muted px-1"
          title="Clear override"
        >
          ×
        </button>
      )}
    </div>
  );
}

interface MarkdownEditorSettingsProps {
  scope: 'global' | 'theme';
  onScopeChange: (s: 'global' | 'theme') => void;
  themeName: string;
  values: Record<string, string>;
  onValuesChange: (next: Record<string, string>) => void;
  onReset: () => void;
}

export default function MarkdownEditorSettings({
  scope,
  onScopeChange,
  themeName,
  values,
  onValuesChange,
  onReset,
}: MarkdownEditorSettingsProps) {
  const overrideCount = useMemo(() => Object.keys(values).length, [values]);

  const setKey = (key: string, v: string) => {
    const t = v.trim();
    const next = { ...values };
    if (t === '') delete next[key];
    else next[key] = t;
    onValuesChange(next);
  };

  const clearKey = (key: string) => {
    const next = { ...values };
    delete next[key];
    onValuesChange(next);
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-mnemo-dim leading-relaxed">
        Override Markdown and fenced-code colors (CSS variables).{' '}
        <strong className="text-mnemo-muted">Global</strong> applies everywhere;{' '}
        <strong className="text-mnemo-muted">This theme</strong> adds on top of global for the current theme only.
        When Turso is connected, these settings sync with your database.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onScopeChange('global')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            scope === 'global'
              ? 'bg-mnemo-active text-mnemo-text border border-mnemo-border-strong'
              : 'bg-mnemo-panel-elevated text-mnemo-muted border border-mnemo-border hover:bg-mnemo-hover'
          }`}
        >
          All themes
        </button>
        <button
          type="button"
          onClick={() => onScopeChange('theme')}
          className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
            scope === 'theme'
              ? 'bg-mnemo-active text-mnemo-text border border-mnemo-border-strong'
              : 'bg-mnemo-panel-elevated text-mnemo-muted border border-mnemo-border hover:bg-mnemo-hover'
          }`}
        >
          This theme ({themeName})
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-[10px] text-mnemo-dim">
          {overrideCount} override{overrideCount !== 1 ? 's' : ''} in this scope
        </span>
        <button
          type="button"
          onClick={onReset}
          className="text-[11px] text-mnemo-accent hover:underline"
        >
          Reset {scope === 'global' ? 'global' : 'theme'} overrides
        </button>
      </div>

      <div className="space-y-3 max-h-[min(50vh,420px)] overflow-y-auto pr-1">
        {ROWS.map(row => {
          const val = values[row.key] ?? '';
          return (
            <div key={row.key} className="grid grid-cols-1 sm:grid-cols-[minmax(0,140px)_1fr] gap-2 items-center">
              <label className="text-[11px] text-mnemo-dim shrink-0">{row.label}</label>
              <div className="flex items-center gap-2 min-w-0">
                {row.kind === 'text' ? (
                  <input
                    type="text"
                    value={val}
                    onChange={e => setKey(row.key, e.target.value)}
                    placeholder={row.key === '--mnemo-editor-font-size' ? '14px' : '1.7'}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs font-mono"
                  />
                ) : isHex6(val) || val === '' ? (
                  <MarkdownColorRow
                    label={row.label}
                    value={val}
                    onTextChange={v => setKey(row.key, v)}
                    onApplyHex={hex => setKey(row.key, hex)}
                    onClear={() => clearKey(row.key)}
                  />
                ) : (
                  <input
                    type="text"
                    value={val}
                    onChange={e => setKey(row.key, e.target.value)}
                    placeholder="e.g. color-mix(…)"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded border border-mnemo-border bg-mnemo-app text-mnemo-text text-xs font-mono"
                  />
                )}
                {((row.kind === 'text' && val !== '') ||
                  (row.kind === 'color' && !isHex6(val) && val !== '')) && (
                  <button
                    type="button"
                    onClick={() => clearKey(row.key)}
                    className="shrink-0 text-[10px] text-mnemo-dim hover:text-mnemo-muted px-1"
                    title="Clear override"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
