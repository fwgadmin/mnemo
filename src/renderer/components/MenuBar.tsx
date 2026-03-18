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
      { separator: true, label: '' },
      { label: 'Open…', cmd: 'open', shortcut: 'Ctrl+O' },
      { separator: true, label: '' },
      { label: 'Quit', cmd: 'quit' },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Toggle Sidebar', cmd: 'toggle-sidebar', shortcut: 'Ctrl+B' },
      { label: 'Toggle Note Header', cmd: 'toggle-header', shortcut: 'Ctrl+Shift+H' },
      { label: 'Toggle Line Numbers', cmd: 'toggle-line-numbers', shortcut: 'Ctrl+Shift+L' },
      { separator: true, label: '' },
      { label: 'Toggle Graph', cmd: 'toggle-graph', shortcut: 'Ctrl+G' },
      { label: 'Markdown Helper', cmd: 'toggle-markdown-help', shortcut: 'Ctrl+M' },
    ],
  },
  {
    label: 'Help',
    items: [
      { label: 'Documentation', cmd: 'show-help' },
    ],
  },
  {
    label: 'Mnemo',
    items: [
      { label: 'Settings…', cmd: 'settings', shortcut: 'Ctrl+,' },
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
      className="flex items-center h-7 bg-[#0f0f0f] border-b border-[#181818] shrink-0 select-none pl-3"
    >
      {MENUS.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            className={`px-3 h-7 text-xs cursor-default rounded transition-colors ${
              open === menu.label
                ? 'bg-[#2a2a2a] text-[#e4e4e7]'
                : 'text-[#999] hover:bg-[#1e1e1e] hover:text-[#ddd]'
            }`}
            onMouseDown={() => setOpen(o => o === menu.label ? null : menu.label)}
            onMouseEnter={() => { if (open && open !== menu.label) setOpen(menu.label); }}
          >
            {menu.label}
          </button>
          {open === menu.label && (
            <div className="absolute top-full left-0 z-50 bg-[#1c1c1c] border border-[#2a2a2a] rounded-sm shadow-xl py-1 min-w-[240px]">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="border-t border-[#2a2a2a] my-1" />
                ) : (
                  <button
                    key={item.label}
                    className="w-full flex items-center justify-between px-4 py-[3px] text-xs text-[#ccc] hover:bg-[#2a3a5a] hover:text-white text-left cursor-default whitespace-nowrap"
                    onClick={() => handleItem(item.cmd!)}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-[#555] ml-8 text-[10px]">{item.shortcut}</span>
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
