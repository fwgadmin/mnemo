import { Children, isValidElement, useEffect, useId, useRef, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'rehype-sanitize';
import mermaid from 'mermaid';
import { mediaTitle, parseMediaDataType, parseMediaDisplayOptions, type MediaAlign } from '../editor/mediaMarkdown';

let mermaidConfigured = false;
function ensureMermaidTheme() {
  if (mermaidConfigured) return;
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'strict',
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
        if (!cancelled && ref.current) {
          const template = document.createElement('template');
          template.innerHTML = svg;
          template.content
            .querySelectorAll('script, iframe, object, embed, foreignObject')
            .forEach((node) => node.remove());
          template.content.querySelectorAll('*').forEach((node) => {
            for (const attribute of [...node.attributes]) {
              const name = attribute.name.toLowerCase();
              const value = attribute.value.trim();
              if (
                name.startsWith('on') ||
                ((name === 'href' || name === 'xlink:href') && /^javascript:/i.test(value))
              ) {
                node.removeAttribute(attribute.name);
              }
            }
          });
          ref.current.replaceChildren(template.content.cloneNode(true));
        }
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

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'del'],
  attributes: {
    ...defaultSchema.attributes,
    code: ['className', 'class'],
    span: ['className', 'class'],
  },
  protocols: {
    ...defaultSchema.protocols,
    src: [...(defaultSchema.protocols?.src ?? []), 'data'],
    href: [...(defaultSchema.protocols?.href ?? []), 'data'],
  },
};

const SAFE_DATA_URL =
  /^data:(?:image\/(?:png|jpe?g|gif|webp|bmp)|audio\/(?:mpeg|mp4|ogg|wav|webm)|video\/(?:mp4|ogg|webm|quicktime)|application\/pdf|text\/plain);base64,/i;

function markdownUrlTransform(url: string): string {
  if (/^data:/i.test(url)) return SAFE_DATA_URL.test(url) ? url : '';
  return defaultUrlTransform(url);
}

interface MediaRange {
  start: number;
  end: number;
}

type MediaAction =
  | { type: 'display'; width: number; align: MediaAlign }
  | { type: 'alt'; alt: string }
  | { type: 'move'; direction: -1 | 1 }
  | { type: 'delete' };

function MediaBlock({
  src,
  alt,
  title,
  range,
  source,
  onAction,
}: {
  src: string;
  alt: string;
  title?: string;
  range?: MediaRange;
  source?: string;
  onAction?: (range: MediaRange, action: MediaAction) => void;
}) {
  const mime = parseMediaDataType(src);
  const options = parseMediaDisplayOptions(title);
  const editable = !!range && !!onAction;
  const justify = options.align === 'left' ? 'flex-start' : options.align === 'right' ? 'flex-end' : 'center';

  const copy = async () => {
    try {
      if (mime?.startsWith('image/') && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
        const blob = await (await fetch(src)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      } else if (source) {
        await navigator.clipboard.writeText(source);
      }
    } catch {
      if (source) await navigator.clipboard.writeText(source).catch(() => {});
    }
  };

  return (
    <span
      className="group/media relative my-3 flex max-w-full flex-col gap-1"
      style={{ alignItems: justify }}
      role="figure"
    >
      {mime?.startsWith('audio/') ? (
        <audio controls src={src} className="max-w-full" style={{ width: `${options.width}%` }}>
          {alt}
        </audio>
      ) : mime?.startsWith('video/') ? (
        <video
          controls
          src={src}
          className="max-w-full rounded border border-mnemo-border"
          style={{ width: `${options.width}%` }}
        >
          {alt}
        </video>
      ) : (
        <img
          src={src}
          alt={alt}
          className="h-auto max-w-full rounded border border-mnemo-border object-contain"
          style={{ width: `${options.width}%` }}
        />
      )}
      {alt && <span className="max-w-full truncate text-[10px] text-mnemo-dim">{alt}</span>}
      {editable && range && (
        <span className="flex max-w-full flex-wrap items-center gap-1 rounded border border-mnemo-border bg-mnemo-panel-elevated/95 p-1 text-[10px] text-mnemo-muted opacity-40 transition-opacity group-hover/media:opacity-100 group-focus-within/media:opacity-100">
          <button type="button" title="Move media up" onClick={() => onAction(range, { type: 'move', direction: -1 })}>
            ↑
          </button>
          <button type="button" title="Move media down" onClick={() => onAction(range, { type: 'move', direction: 1 })}>
            ↓
          </button>
          {(['left', 'center', 'right'] as const).map((align) => (
            <button
              type="button"
              key={align}
              title={`Align ${align}`}
              className={options.align === align ? 'text-mnemo-accent' : ''}
              onClick={() =>
                onAction(range, {
                  type: 'display',
                  width: options.width,
                  align,
                })
              }
            >
              {align === 'left' ? '⇤' : align === 'right' ? '⇥' : '↔'}
            </button>
          ))}
          <input
            type="range"
            min="10"
            max="100"
            step="5"
            value={options.width}
            title={`Width ${options.width}%`}
            aria-label="Media width"
            className="w-24 accent-[var(--mnemo-accent)]"
            onChange={(e) =>
              onAction(range, {
                type: 'display',
                width: Number(e.target.value),
                align: options.align,
              })
            }
          />
          <span className="w-7 text-right">{options.width}%</span>
          <button type="button" onClick={() => void copy()}>
            Copy
          </button>
          <button
            type="button"
            onClick={() => {
              void copy().then(() => onAction(range, { type: 'delete' }));
            }}
          >
            Cut
          </button>
          <button
            type="button"
            onClick={() => {
              const next = window.prompt('Media description / alt text', alt);
              if (next !== null) onAction(range, { type: 'alt', alt: next });
            }}
          >
            Modify
          </button>
          <button type="button" className="text-red-400" onClick={() => onAction(range, { type: 'delete' })}>
            Delete
          </button>
        </span>
      )}
    </span>
  );
}

export interface MarkdownNoteBodyProps {
  body: string;
  /** Extra classes on the scrollable markdown container. */
  className?: string;
  /** Enables media resize/alignment/move/modify controls in the editor preview. */
  onBodyChange?: (body: string) => void;
}

/**
 * Shared GFM + Mermaid + sanitize pipeline for rendered note body (sidebar preview panel + inline editor preview).
 */
export default function MarkdownNoteBody({ body, className = '', onBodyChange }: MarkdownNoteBodyProps) {
  const handleMediaAction = (range: MediaRange, action: MediaAction) => {
    const source = body.slice(range.start, range.end);
    const match = /^!\[([^\]]*)\]\((\S+)(?:\s+"([^"]*)")?\)$/.exec(source);
    if (!match || !onBodyChange) return;
    let next = body;
    if (action.type === 'delete') {
      next = body.slice(0, range.start) + body.slice(range.end);
    } else if (action.type === 'move') {
      const without = body.slice(0, range.start) + body.slice(range.end);
      if (action.direction < 0) {
        let previousContent = range.start - 1;
        while (previousContent >= 0 && /\s/.test(body[previousContent]!)) previousContent--;
        if (previousContent >= 0) {
          const previousStart = body.lastIndexOf('\n', previousContent) + 1;
          next = without.slice(0, previousStart) + `${source}\n\n` + without.slice(previousStart);
        }
      } else {
        let followingContent = range.end;
        while (followingContent < body.length && /\s/.test(body[followingContent]!)) followingContent++;
        if (followingContent < body.length) {
          const followingBreak = body.indexOf('\n', followingContent);
          const followingEnd = followingBreak < 0 ? without.length : followingBreak + 1 - source.length;
          next = without.slice(0, followingEnd) + `\n${source}` + without.slice(followingEnd);
        }
      }
    } else {
      const alt = action.type === 'alt' ? action.alt.replace(/[\]\\\n\r]/g, ' ') : match[1]!;
      const options = action.type === 'display' ? action : parseMediaDisplayOptions(match[3]);
      const replacement = `![${alt}](${match[2]} "${mediaTitle(options)}")`;
      next = body.slice(0, range.start) + replacement + body.slice(range.end);
    }
    if (next !== body) onBodyChange(next);
  };

  return (
    <div
      className={`flex-1 min-h-0 overflow-y-auto px-3 py-3 text-[13px] leading-relaxed text-mnemo-text space-y-3
        [&_h1]:text-xl [&_h1]:font-semibold [&_h1]:pt-1
        [&_h2]:text-lg [&_h2]:font-semibold
        [&_h3]:text-base [&_h3]:font-semibold
        [&_h4]:text-sm [&_h4]:font-semibold
        [&_a]:text-mnemo-accent [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
        [&_blockquote]:border-l-2 [&_blockquote]:border-mnemo-border [&_blockquote]:pl-3 [&_blockquote]:text-mnemo-muted
        [&_table]:w-full [&_table]:text-[11px] [&_th]:border [&_td]:border [&_th]:border-mnemo-border [&_td]:border-mnemo-border [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1
        [&_.mermaid-svg_svg]:max-w-full ${className}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        urlTransform={markdownUrlTransform}
        components={{
          img: ({ src, alt, title, node }) => {
            const position = node?.position;
            const range =
              position?.start.offset !== undefined && position.end.offset !== undefined
                ? { start: position.start.offset, end: position.end.offset }
                : undefined;
            return (
              <MediaBlock
                src={src ?? ''}
                alt={alt ?? ''}
                title={title ?? undefined}
                range={range}
                source={range ? body.slice(range.start, range.end) : undefined}
                onAction={onBodyChange ? handleMediaAction : undefined}
              />
            );
          },
          a: ({ href, title, children }) => {
            const attachment = title === 'mnemo:attachment' && href?.startsWith('data:');
            return (
              <a href={href} title={title} download={attachment ? 'attachment' : undefined}>
                {children}
              </a>
            );
          },
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
          code: ({ className: cn, children, ...props }) => {
            if (cn) {
              return (
                <code className={`${cn} text-[11px]`} {...props}>
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
  );
}
