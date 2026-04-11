import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampFixedContextMenu } from '../fixedMenuPosition';

export type FolderColorMenuState = { path: string; x: number; y: number } | null;

interface CategoryFolderColorMenuProps {
  state: FolderColorMenuState;
  onClose: () => void;
  onRequestRename?: () => void;
  suggestedColors: string[];
  onPickSuggestedColor: (hex: string) => void;
  /** Initial value for the custom color input (#rrggbb). */
  currentColorHex?: string | null;
  onPickCustomColor: (hex: string) => void;
  canPromote: boolean;
  onPromote: () => void;
  canDemote: boolean;
  onRequestDemote: () => void;
  canClear: boolean;
  onClearColor: () => void;
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

/**
 * Right-click context menu for category folders: suggested swatches plus native color input.
 */
export default function CategoryFolderColorMenu({
  state,
  onClose,
  onRequestRename,
  suggestedColors,
  onPickSuggestedColor,
  currentColorHex,
  onPickCustomColor,
  canPromote,
  onPromote,
  canDemote,
  onRequestDemote,
  canClear,
  onClearColor,
}: CategoryFolderColorMenuProps) {
  const showRename = Boolean(onRequestRename);
  const menuRef = useRef<HTMLDivElement>(null);
  const fallbackHex = '#6366f1';
  const [customDraftHex, setCustomDraftHex] = useState(() =>
    normalizePickerHex(currentColorHex ?? null, fallbackHex),
  );

  useEffect(() => {
    if (!state) return;
    setCustomDraftHex(normalizePickerHex(currentColorHex ?? null, fallbackHex));
  }, [state?.path, currentColorHex, state]);

  useEffect(() => {
    if (!state) return;
    const handle = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', handle, true);
    }, 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', handle, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [state, onClose]);

  const [screenPos, setScreenPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!state) return;
    setScreenPos({ left: state.x, top: state.y });
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setScreenPos(clampFixedContextMenu(state.x, state.y, width, height));
  }, [state]);

  if (!state) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[240px] max-w-[min(100vw-16px,320px)] bg-mnemo-panel-elevated border border-mnemo-border rounded-md shadow-lg py-1"
      style={{ left: screenPos.left, top: screenPos.top }}
      onContextMenu={e => e.preventDefault()}
    >
      {showRename && (
        <button
          type="button"
          className="w-full px-3 py-1.5 text-xs text-left text-mnemo-muted hover:bg-mnemo-hover cursor-pointer"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onRequestRename?.();
          }}
        >
          Rename category…
        </button>
      )}
      <button
        type="button"
        disabled={!canPromote}
        className={`w-full px-3 py-1.5 text-xs text-left ${showRename ? 'border-t border-mnemo-border/80' : ''} ${
          canPromote
            ? 'text-mnemo-muted hover:bg-mnemo-hover cursor-pointer'
            : 'text-mnemo-dim cursor-not-allowed opacity-50'
        }`}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          if (canPromote) onPromote();
        }}
      >
        Promote category
      </button>
      <button
        type="button"
        disabled={!canDemote}
        className={`w-full px-3 py-1.5 text-xs text-left ${
          canDemote
            ? 'text-mnemo-muted hover:bg-mnemo-hover cursor-pointer'
            : 'text-mnemo-dim cursor-not-allowed opacity-50'
        }`}
        onMouseDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          if (canDemote) onRequestDemote();
        }}
      >
        Demote category…
      </button>
      {suggestedColors.length > 0 && (
        <div className="px-2.5 py-2 border-t border-mnemo-border/80">
          <div className="text-[10px] uppercase tracking-wide text-mnemo-dim mb-1.5">Suggested colors</div>
          <div className="grid grid-cols-8 gap-1">
            {suggestedColors.map(c => (
              <button
                key={c}
                type="button"
                title={c}
                className="h-6 w-full rounded border border-mnemo-border/70 hover:ring-2 hover:ring-mnemo-accent/50 transition-shadow cursor-pointer"
                style={{ backgroundColor: c }}
                onMouseDown={e => e.preventDefault()}
                onClick={e => {
                  e.stopPropagation();
                  onPickSuggestedColor(c);
                }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="px-2.5 py-2 border-t border-mnemo-border/80">
        <div className="text-[10px] uppercase tracking-wide text-mnemo-dim mb-1.5">Custom color</div>
        <p className="text-[10px] text-mnemo-dim mb-2 leading-snug">
          Choose a color in the picker, then apply — changes are not saved until you click Apply.
        </p>
        <input
          type="color"
          aria-label="Pick a custom folder color"
          className="h-9 w-full cursor-pointer rounded border border-mnemo-border/70 bg-mnemo-panel"
          value={customDraftHex}
          onMouseDown={e => e.stopPropagation()}
          onChange={e => {
            e.stopPropagation();
            setCustomDraftHex(e.target.value);
          }}
        />
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-2.5 py-1 rounded text-[11px] font-medium border border-mnemo-border text-mnemo-muted hover:bg-mnemo-hover"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              setCustomDraftHex(normalizePickerHex(currentColorHex ?? null, fallbackHex));
            }}
          >
            Reset
          </button>
          <button
            type="button"
            disabled={
              customDraftHex.toLowerCase() ===
              normalizePickerHex(currentColorHex ?? null, fallbackHex).toLowerCase()
            }
            className="px-2.5 py-1 rounded text-[11px] font-semibold antialiased bg-mnemo-accent text-mnemo-on-accent shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mnemo-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-mnemo-panel"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => {
              e.stopPropagation();
              onPickCustomColor(customDraftHex);
            }}
          >
            Apply
          </button>
        </div>
      </div>
      {canClear && (
        <button
          type="button"
          className="w-full px-3 py-1.5 text-xs text-left text-mnemo-muted hover:bg-mnemo-hover cursor-pointer border-t border-mnemo-border/80"
          onMouseDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation();
            onClearColor();
          }}
        >
          Clear folder color
        </button>
      )}
    </div>
  );
}
