import { extractMarkdownHeadings } from '../../shared/markdownOutline';
import MarkdownNoteBody from './MarkdownNoteBody';

interface MarkdownPreviewPanelProps {
  body: string;
  onScrollToLine: (line: number) => void;
  onClose: () => void;
}

export default function MarkdownPreviewPanel({ body, onScrollToLine, onClose }: MarkdownPreviewPanelProps) {
  const headings = extractMarkdownHeadings(body);

  return (
    <div className="w-96 min-w-[300px] max-w-[min(100vw,420px)] border-l border-mnemo-border flex flex-col overflow-hidden bg-mnemo-panel shrink-0">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-mnemo-border shrink-0">
        <span className="text-[11px] font-medium tracking-wide text-mnemo-muted">PREVIEW &amp; OUTLINE</span>
        <button
          type="button"
          onClick={onClose}
          className="text-mnemo-dim hover:text-mnemo-muted text-xs cursor-pointer"
        >
          ✕
        </button>
      </div>

      {headings.length > 0 && (
        <div className="shrink-0 border-b border-mnemo-border px-3 py-2 max-h-[28vh] overflow-y-auto">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-mnemo-dim mb-1.5">Headings</div>
          <ul className="space-y-0.5 text-[11px]">
            {headings.map((h, i) => (
              <li key={`${h.line}-${i}`}>
                <button
                  type="button"
                  className="text-left w-full truncate rounded px-1 py-0.5 hover:bg-mnemo-hover text-mnemo-muted hover:text-mnemo-text cursor-pointer"
                  style={{ paddingLeft: 4 + (h.level - 1) * 10 }}
                  onClick={() => onScrollToLine(h.line)}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MarkdownNoteBody body={body} className="flex-1" />
    </div>
  );
}
