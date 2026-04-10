import { useEffect, useRef } from 'react';

export type FolderColorMenuState = { path: string; x: number; y: number } | null;

interface CategoryFolderColorMenuProps {
  state: FolderColorMenuState;
  onClose: () => void;
  onRequestRename?: () => void;
  suggestedColors: string[];
  onPickSuggestedColor: (hex: string) => void;
  canPromote: boolean;
  onPromote: () => void;
  canDemote: boolean;
  onRequestDemote: () => void;
  canClear: boolean;
  onClearColor: () => void;
}

/**
 * Right-click context menu for category folders: colors from suggested swatches only
 * (no native color wheel).
 */
export default function CategoryFolderColorMenu({
  state,
  onClose,
  onRequestRename,
  suggestedColors,
  onPickSuggestedColor,
  canPromote,
  onPromote,
  canDemote,
  onRequestDemote,
  canClear,
  onClearColor,
}: CategoryFolderColorMenuProps) {
  const showRename = Boolean(onRequestRename);
  const menuRef = useRef<HTMLDivElement>(null);

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

  if (!state) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[240px] max-w-[min(100vw-16px,320px)] bg-mnemo-panel-elevated border border-mnemo-border rounded-md shadow-lg py-1"
      style={{ left: state.x, top: state.y }}
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
