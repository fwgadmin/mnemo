export interface EditorTabItem {
  id: string;
  title: string;
  /** Category color for the tab title, from folder color rules */
  accentColor?: string;
}

export interface EditorTabBarProps {
  tabs: EditorTabItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

/** IDE-style horizontal tabs above the editor */
export default function EditorTabBar({ tabs, activeId, onSelect, onClose, onNew }: EditorTabBarProps) {
  return (
    <div className="flex items-stretch shrink-0 border-b border-mnemo-border bg-mnemo-panel-elevated/90 min-h-[38px]">
      <div className="flex flex-1 items-end overflow-x-auto min-w-0">
        {tabs.map(tab => {
          const active = activeId === tab.id;
          const accent = tab.accentColor;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              className={`group flex max-w-[220px] shrink-0 items-center border-b-2 pl-2 pr-1 transition-colors ${
                active
                  ? 'border-mnemo-accent bg-mnemo-app text-mnemo-text'
                  : 'border-transparent text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text'
              }`}
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate py-2 text-left text-xs font-medium"
                style={accent ? { color: accent } : undefined}
                onClick={() => onSelect(tab.id)}
              >
                {tab.title || 'Untitled'}
              </button>
              <button
                type="button"
                className="shrink-0 rounded px-1.5 py-2 text-mnemo-dim hover:bg-mnemo-hover hover:text-mnemo-text"
                title="Close tab"
                onClick={e => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onNew}
        className="shrink-0 border-l border-mnemo-border px-3 py-2 text-sm text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text"
        title="New note"
      >
        +
      </button>
    </div>
  );
}
