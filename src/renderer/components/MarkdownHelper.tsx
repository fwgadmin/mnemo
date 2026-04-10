import type { ReactNode } from 'react';

interface MarkdownHelperProps {
  onClose: () => void;
}

export default function MarkdownHelper({ onClose }: MarkdownHelperProps) {
  return (
    <div className="w-72 min-w-[260px] border-l border-mnemo-border flex flex-col overflow-hidden bg-mnemo-panel">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-mnemo-border shrink-0">
        <span className="text-[11px] font-medium tracking-wide text-mnemo-muted">MARKDOWN REFERENCE</span>
        <button
          type="button"
          onClick={onClose}
          className="text-mnemo-dim hover:text-mnemo-muted text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-4 text-[11px]">

        <Group title="Formatting">
          <Row syntax="**bold**"       result="bold" />
          <Row syntax="*italic*"       result="italic" />
          <Row syntax="~~strike~~"     result="strikethrough" />
          <Row syntax="`inline code`"  result="inline code" />
          <Row syntax="# Heading 1"    result="H1 (up to ######)" />
          <Row syntax="> quote"        result="blockquote" />
          <Row syntax="---"            result="horizontal rule" />
        </Group>

        <Group title="Lists">
          <Row syntax="- item"                result="unordered list" />
          <Row syntax="* item"                result="unordered (alt)" />
          <Row syntax="1. item"               result="ordered list" />
          <Row syntax="  - nested"            result="nested (2 spaces)" />
          <Row syntax="- [ ] task"            result="task (unchecked)" />
          <Row syntax="- [x] task"            result="task (checked)" />
        </Group>

        <Group title="Links &amp; Images">
          <Row syntax="[[Note Title]]"       result="wikilink" />
          <Row syntax="[text](url)"          result="hyperlink" />
          <Row syntax="![alt](url)"          result="image" />
        </Group>

        <Group title="Code Blocks">
          <div className="mt-1 rounded bg-mnemo-app border border-mnemo-border p-2 font-mono text-[10px] text-mnemo-muted leading-relaxed">
            <div className="text-mnemo-dim">```javascript</div>
            <div className="text-mnemo-text">const x = 42;</div>
            <div className="text-mnemo-dim">```</div>
          </div>
          <div className="mt-1.5 text-mnemo-dim leading-relaxed">
            Common tags: <span className="text-mnemo-accent">javascript</span>,{' '}
            <span className="text-mnemo-accent">typescript</span>,{' '}
            <span className="text-mnemo-accent">python</span>,{' '}
            <span className="text-mnemo-accent">sql</span>,{' '}
            <span className="text-mnemo-accent">bash</span>,{' '}
            <span className="text-mnemo-accent">json</span>,{' '}
            <span className="text-mnemo-accent">html</span>,{' '}
            <span className="text-mnemo-accent">css</span>,{' '}
            <span className="text-mnemo-accent">rust</span>,{' '}
            <span className="text-mnemo-accent">go</span>,{' '}
            <span className="text-mnemo-accent">yaml</span>
          </div>
        </Group>

        <Group title="Tables">
          <div className="mt-1 rounded bg-mnemo-app border border-mnemo-border p-2 font-mono text-[10px] text-mnemo-muted leading-relaxed whitespace-pre">
{`| Col A | Col B |
|-------|-------|
| val   | val   |`}
          </div>
        </Group>

        <Group title="Wikilinks">
          <Row syntax="[[Note Title]]"          result="link to note" />
          <Row syntax="[[Note Title|alias]]"    result="link with alias" />
          <div className="mt-1 text-mnemo-dim">
            If the target note doesn't exist, Mnemo creates it automatically.
          </div>
        </Group>

        <Group title="Keyboard Shortcuts">
          <ShortcutRow keys="Ctrl+N"         action="New note" />
          <ShortcutRow keys="Ctrl+S"         action="Save" />
          <ShortcutRow keys="Ctrl+Shift+S"   action="Save As" />
          <ShortcutRow keys="Alt+Shift+F"    action="Format note (Prettier)" />
          <ShortcutRow keys="Ctrl+O"         action="Open file" />
          <ShortcutRow keys="Ctrl+P"         action="Command palette" />
          <ShortcutRow keys="Ctrl+G"         action="Toggle graph" />
          <ShortcutRow keys="Ctrl+M"         action="Toggle Markdown reference" />
          <ShortcutRow keys="Ctrl+Shift+V"   action="Toggle preview (GFM, Mermaid)" />
          <ShortcutRow keys="Ctrl+B"         action="Toggle sidebar" />
          <ShortcutRow keys="Ctrl+K"         action="Insert markdown link" />
          <ShortcutRow keys="Ctrl+Shift+T"    action="Insert table" />
          <ShortcutRow keys="Ctrl+Shift+I"   action="Insert image" />
          <ShortcutRow keys="Ctrl+Shift+H"   action="Toggle note header" />
          <ShortcutRow keys="Ctrl+Shift+L"   action="Toggle line numbers" />
          <ShortcutRow keys="Ctrl+Shift+N"   action="Toggle note #refs" />
          <ShortcutRow keys="Ctrl+,"         action="Settings" />
        </Group>

        <Group title="More help">
          <div className="text-mnemo-dim leading-relaxed">
            Help → <span className="text-mnemo-accent">Documentation</span> (categories, Unassigned/General, MCP tools,
            themes, layout, CLI). In the command palette, type <span className="text-mnemo-accent">&gt;</span> for layout
            and grouped-category toggles.
          </div>
        </Group>

      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-mnemo-dim mb-1.5 pb-1 border-b border-mnemo-border">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ syntax, result }: { syntax: string; result: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[2px]">
      <code className="text-mnemo-accent font-mono text-[10px] shrink-0">{syntax}</code>
      <span className="text-mnemo-dim text-right truncate">{result}</span>
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[2px]">
      <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-mnemo-panel-elevated border border-mnemo-border text-mnemo-muted font-mono leading-none shrink-0">
        {keys}
      </kbd>
      <span className="text-mnemo-dim text-right">{action}</span>
    </div>
  );
}
