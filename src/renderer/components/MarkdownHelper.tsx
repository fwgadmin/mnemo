import type { ReactNode } from 'react';

interface MarkdownHelperProps {
  onClose: () => void;
}

export default function MarkdownHelper({ onClose }: MarkdownHelperProps) {
  return (
    <div className="w-72 min-w-[260px] border-l border-[#1e1e1e] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#1e1e1e] shrink-0">
        <span className="text-[11px] font-medium tracking-wide text-[#888]">MARKDOWN REFERENCE</span>
        <button
          onClick={onClose}
          className="text-[#555] hover:text-[#aaa] text-xs cursor-pointer"
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
          <div className="mt-1 rounded bg-[#0d0d0d] border border-[#1e1e1e] p-2 font-mono text-[10px] text-[#aaa] leading-relaxed">
            <div className="text-[#555]">```javascript</div>
            <div className="text-[#ccc]">const x = 42;</div>
            <div className="text-[#555]">```</div>
          </div>
          <div className="mt-1.5 text-[#555] leading-relaxed">
            Common tags: <span className="text-[#7c7cff]">javascript</span>,{' '}
            <span className="text-[#7c7cff]">typescript</span>,{' '}
            <span className="text-[#7c7cff]">python</span>,{' '}
            <span className="text-[#7c7cff]">sql</span>,{' '}
            <span className="text-[#7c7cff]">bash</span>,{' '}
            <span className="text-[#7c7cff]">json</span>,{' '}
            <span className="text-[#7c7cff]">html</span>,{' '}
            <span className="text-[#7c7cff]">css</span>,{' '}
            <span className="text-[#7c7cff]">rust</span>,{' '}
            <span className="text-[#7c7cff]">go</span>,{' '}
            <span className="text-[#7c7cff]">yaml</span>
          </div>
        </Group>

        <Group title="Tables">
          <div className="mt-1 rounded bg-[#0d0d0d] border border-[#1e1e1e] p-2 font-mono text-[10px] text-[#aaa] leading-relaxed whitespace-pre">
{`| Col A | Col B |
|-------|-------|
| val   | val   |`}
          </div>
        </Group>

        <Group title="Wikilinks">
          <Row syntax="[[Note Title]]"          result="link to note" />
          <Row syntax="[[Note Title|alias]]"    result="link with alias" />
          <div className="mt-1 text-[#555]">
            If the target note doesn't exist, Mnemo creates it automatically.
          </div>
        </Group>

        <Group title="Keyboard Shortcuts">
          <ShortcutRow keys="Ctrl+N"         action="New note" />
          <ShortcutRow keys="Ctrl+S"         action="Save" />
          <ShortcutRow keys="Ctrl+Shift+S"   action="Save As" />
          <ShortcutRow keys="Ctrl+O"         action="Open file" />
          <ShortcutRow keys="Ctrl+P"         action="Command palette" />
          <ShortcutRow keys="Ctrl+G"         action="Toggle graph" />
          <ShortcutRow keys="Ctrl+M"         action="Toggle this panel" />
          <ShortcutRow keys="Ctrl+B"         action="Toggle sidebar" />
        </Group>

      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[#555] mb-1.5 pb-1 border-b border-[#1a1a1a]">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ syntax, result }: { syntax: string; result: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-[2px]">
      <code className="text-[#a78bfa] font-mono text-[10px] shrink-0">{syntax}</code>
      <span className="text-[#555] text-right truncate">{result}</span>
    </div>
  );
}

function ShortcutRow({ keys, action }: { keys: string; action: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-[2px]">
      <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-[#1a1a1a] border border-[#2a2a2a] text-[#ccc] font-mono leading-none shrink-0">
        {keys}
      </kbd>
      <span className="text-[#555] text-right">{action}</span>
    </div>
  );
}
