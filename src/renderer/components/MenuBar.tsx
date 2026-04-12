import { useEffect, useRef, useState } from 'react';

interface MenuItem {
  label: string;
  cmd?: string;
  shortcut?: string;
  separator?: true;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

const MENUS: MenuDef[] = [
  {
    label: 'File',
    items: [
      { label: 'New Note', cmd: 'new-note', shortcut: 'Ctrl+N' },
      { separator: true, label: '' },
      { label: 'Save', cmd: 'save', shortcut: 'Ctrl+S' },
      { label: 'Save As…', cmd: 'save-as', shortcut: 'Ctrl+Shift+S' },
      { label: 'Format Note', cmd: 'format-markdown', shortcut: 'Alt+Shift+F' },
      { separator: true, label: '' },
      { label: 'Open…', cmd: 'open', shortcut: 'Ctrl+O' },
      { label: 'Open File as Tab…', cmd: 'open-file-tab', shortcut: 'Ctrl+Shift+O' },
      { label: 'New Vault Workspace…', cmd: 'vault-new' },
      { label: 'Open Workspace Folder…', cmd: 'workspace-choose' },
      { label: 'Sync Workspace', cmd: 'workspace-sync' },
      { label: 'Manage Vault Workspaces…', cmd: 'vault-manage' },
      { separator: true, label: '' },
      { label: 'Quit', cmd: 'quit' },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Toggle Sidebar', cmd: 'toggle-sidebar', shortcut: 'Ctrl+B' },
      { label: 'Next Note', cmd: 'note-next', shortcut: 'Ctrl+Tab' },
      { label: 'Previous Note', cmd: 'note-prev', shortcut: 'Ctrl+Shift+Tab' },
      { label: 'Toggle Note Header', cmd: 'toggle-header', shortcut: 'Ctrl+Shift+H' },
      { label: 'Toggle Line Numbers', cmd: 'toggle-line-numbers', shortcut: 'Ctrl+Shift+L' },
      { label: 'Toggle Note Index Numbers', cmd: 'toggle-note-refs', shortcut: 'Ctrl+Shift+N' },
      { separator: true, label: '' },
      { label: 'Toggle Graph', cmd: 'toggle-graph', shortcut: 'Ctrl+G' },
      { label: 'Markdown Helper', cmd: 'toggle-markdown-help', shortcut: 'Ctrl+M' },
      { label: 'Markdown Preview', cmd: 'toggle-markdown-preview', shortcut: 'Ctrl+Shift+V' },
      { separator: true, label: '' },
      { label: 'Reload Note List', cmd: 'refresh-notes' },
      { label: 'Toggle Full Screen', cmd: 'toggle-fullscreen', shortcut: 'F11' },
    ],
  },
  {
    label: 'Mnemo',
    items: [
      { label: 'Settings…', cmd: 'settings', shortcut: 'Ctrl+,' },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'Documentation', cmd: 'show-help' },
    ],
  },
];

interface MenuBarProps {
  onCommand: (cmd: string) => void;
}

export default function MenuBar({ onCommand }: MenuBarProps) {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleItem = (cmd: string) => {
    setOpen(null);
    if (cmd === 'quit') {
      window.close();
    } else {
      onCommand(cmd);
    }
  };

  return (
    <div
      ref={barRef}
      className="mnemo-menu-bar flex items-center h-7 bg-mnemo-app shrink-0 select-none pl-3"
    >
      {MENUS.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            className={`px-3 h-7 text-xs cursor-default rounded transition-colors ${
              open === menu.label
                ? 'bg-mnemo-panel-elevated text-mnemo-text'
                : 'text-mnemo-muted hover:bg-mnemo-hover hover:text-mnemo-text'
            }`}
            onMouseDown={() => setOpen(o => o === menu.label ? null : menu.label)}
            onMouseEnter={() => { if (open && open !== menu.label) setOpen(menu.label); }}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <div className="absolute top-full left-0 z-50 bg-mnemo-panel-elevated border border-mnemo-border rounded-sm shadow-xl py-1 min-w-[240px]">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="border-t border-mnemo-border my-1" />
                ) : (
                  <button
                    key={item.label}
                    className="w-full flex items-center justify-between px-4 py-[3px] text-xs text-mnemo-muted hover:bg-mnemo-active hover:text-mnemo-text text-left cursor-default whitespace-nowrap"
                    onClick={() => handleItem(item.cmd!)}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-mnemo-dim ml-8 text-[10px]">{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
