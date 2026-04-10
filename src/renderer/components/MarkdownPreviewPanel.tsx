import { Children, isValidElement, useEffect, useId, useRef, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'rehype-sanitize';
import mermaid from 'mermaid';
import { extractMarkdownHeadings } from '../../shared/markdownOutline';

let mermaidConfigured = false;
function ensureMermaidTheme() {
  if (mermaidConfigured) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
  });
  mermaidConfigured = true;
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const uid = useId().replace(/:/g, '');

  useEffect(() => {
    let cancelled = false;
    ensureMermaidTheme();
    const id = `mermaid-${uid}-${Math.random().toString(36).slice(2, 9)}`;
    void (async () => {
      try {
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (!cancelled && ref.current) {
          ref.current.textContent = 'Invalid Mermaid diagram';
          ref.current.className = 'text-mnemo-dim text-[11px] my-2';
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, uid]);

  return <div ref={ref} className="mermaid-svg my-3 overflow-x-auto" />;
}

/** Allow GFM tables + class on code blocks for highlighting. */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'del'],
  attributes: {
    ...defaultSchema.attributes,
    code: ['className', 'class'],
    span: ['className', 'class'],
  },
};

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

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 text-[13px] leading-relaxed text-mnemo-text space-y-3
        [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:pt-1
        [&_h2]:text-lg [&_h2]:font-semibold
        [&_h3]:text-base [&_h3]:font-semibold
        [&_h4]:text-sm [&_h4]:font-semibold
        [&_a]:text-mnemo-accent [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
        [&_blockquote]:border-l-2 [&_blockquote]:border-mnemo-border [&_blockquote]:pl-3 [&_blockquote]:text-mnemo-muted
        [&_table]:w-full [&_table]:text-[11px] [&_th]:border [&_td]:border [&_th]:border-mnemo-border [&_td]:border-mnemo-border [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1
        [&_.mermaid-svg_svg]:max-w-full">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
          components={{
            pre: ({ children }) => {
              const child = Children.only(children) as ReactNode;
              if (
                isValidElement(child) &&
                typeof child.props === 'object' &&
                child.props !== null &&
                'className' in child.props &&
                String((child.props as { className?: string }).className).includes('language-mermaid')
              ) {
                const raw = (child.props as { children?: React.ReactNode }).children;
                const code = String(raw ?? '').replace(/\n$/, '');
                return <MermaidBlock code={code} />;
              }
              return (
                <pre className="overflow-x-auto rounded-md border border-mnemo-border bg-mnemo-app p-2 my-2 text-[11px] font-mono leading-relaxed">
                  {children}
                </pre>
              );
            },
            code: ({ className, children, ...props }) => {
              if (className) {
                return (
                  <code className={`${className} text-[11px]`} {...props}>
                    {children}
                  </code>
                );
              }
              return (
                <code
                  className="rounded px-1 py-0.5 bg-mnemo-app border border-mnemo-border/60 text-[11px] font-mono"
                  {...props}
                >
                  {children}
                </code>
              );
            },
          }}
        >
          {body}
        </ReactMarkdown>
      </div>
    </div>
  );
}
