import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { clampFixedContextMenu } from '../fixedMenuPosition';

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
  onCloseAllTabs: () => void;
  onCloseTabsToRight: (tabId: string) => void;
}

/** IDE-style horizontal tabs above the editor. Buttons use tabIndex={-1} so the Tab key skips this strip (focus stays in the editor). */
export default function EditorTabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onNew,
  onCloseAllTabs,
  onCloseTabsToRight,
}: EditorTabBarProps) {
  const [menu, setMenu] = useState<{ x: number; y: number; tabId: string; tabIndex: number } | null>(null);
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const tabScrollRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!menu) return;
    setMenuPos({ left: menu.x, top: menu.y });
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setMenuPos(clampFixedContextMenu(menu.x, menu.y, width, height));
  }, [menu]);

  const closeMenu = useCallback(() => setMenu(null), []);

  /** Vertical wheel (and dominant trackpad axis) scrolls the tab strip horizontally. */
  useEffect(() => {
    const el = tabScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      const useY = Math.abs(e.deltaY) >= Math.abs(e.deltaX);
      const delta = useY ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      el.scrollLeft += delta;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [tabs.length]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      closeMenu();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menu, closeMenu]);

  return (
    <div className="flex items-stretch shrink-0 border-b border-mnemo-border bg-mnemo-panel-elevated/90 min-h-[32px]">
      <div
        ref={tabScrollRef}
        className="mnemo-tab-scroll flex flex-1 items-end overflow-x-auto min-w-0"
      >
        {tabs.map((tab, tabIndex) => {
          const active = activeId === tab.id;
          const accent = tab.accentColor;
          return (
            <div
              key={tab.id}
              className={`group flex max-w-[220px] shrink-0 items-center border-b-[1.5px] pl-2 pr-0.5 transition-colors ${
                active
                  ? 'border-mnemo-accent bg-mnemo-app text-mnemo-text'
                  : 'border-transparent text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text'
              }`}
              onContextMenu={e => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, tabId: tab.id, tabIndex });
              }}
            >
              <button
                type="button"
                tabIndex={-1}
                className="min-w-0 flex-1 truncate py-1.5 text-left text-[11px] font-medium leading-tight outline-none focus-visible:ring-0"
                style={accent ? { color: accent } : undefined}
                onClick={() => onSelect(tab.id)}
              >
                {tab.title || 'Untitled'}
              </button>
              <button
                type="button"
                tabIndex={-1}
                className="shrink-0 rounded px-1 py-1.5 text-[13px] leading-none text-mnemo-dim hover:bg-mnemo-hover hover:text-mnemo-text outline-none focus-visible:ring-0"
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
        tabIndex={-1}
        onClick={onNew}
        className="shrink-0 border-l border-mnemo-border px-2.5 py-1.5 text-[15px] leading-none text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text outline-none focus-visible:ring-0"
        title="New note"
      >
        +
      </button>

      {menu && (() => {
        const hasTabsToRight = menu.tabIndex < tabs.length - 1;
        return (
        <div
          ref={menuRef}
          className="fixed z-[300] min-w-[200px] rounded-md border border-mnemo-border bg-mnemo-panel-elevated py-1 text-[11px] shadow-xl"
          style={{ left: menuPos.left, top: menuPos.top }}
        >
          <button
            type="button"
            className="w-full px-3 py-1.5 text-left text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text cursor-default"
            onClick={() => {
              onCloseAllTabs();
              closeMenu();
            }}
          >
            Close all tabs
          </button>
          <button
            type="button"
            disabled={!hasTabsToRight}
            className={`w-full px-3 py-1.5 text-left cursor-default ${
              hasTabsToRight
                ? 'text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text'
                : 'text-mnemo-dim opacity-50 cursor-not-allowed'
            }`}
            onClick={() => {
              if (!hasTabsToRight) return;
              onCloseTabsToRight(menu.tabId);
              closeMenu();
            }}
          >
            Close tabs to the right
          </button>
        </div>
        );
      })()}
    </div>
  );
}
