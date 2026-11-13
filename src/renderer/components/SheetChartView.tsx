import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { SheetChartType } from '../../shared/sheet';
import { niceTicks, type ChartData } from '../../shared/sheetChart';

const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };
const BAR_MAX = 24;
const GAP = 2;
const RADIUS = 4;

const color = (i: number) => `var(--mnemo-chart-${(i % 8) + 1})`;

function shortNumber(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return String(Number.parseFloat(v.toPrecision(6)));
}

/** Rect path with 4px rounding on the data end only (square at the baseline). */
function barPath(x: number, y: number, w: number, h: number, end: 'top' | 'bottom' | 'right' | 'left', round = true): string {
  const r = round ? Math.min(RADIUS, w / 2, h / 2) : 0;
  if (w <= 0 || h <= 0) return '';
  switch (end) {
    case 'top':
      return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    case 'bottom':
      return `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w - r}Q${x + w},${y + h} ${x + w},${y + h - r}V${y}Z`;
    case 'right':
      return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    default:
      return `M${x + w},${y}H${x + r}Q${x},${y} ${x},${y + r}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + w}Z`;
  }
}

export interface SheetChartViewProps {
  data: ChartData;
  type: SheetChartType;
  title?: string;
}

/** Accessible SVG chart for a sheet range (column / bar / line / stacked) with a per-category hover tooltip. */
export default function SheetChartView({ data, type, title }: SheetChartViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(480);
  const [hover, setHover] = useState<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(240, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(240, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  const { categories, series } = data;
  const n = categories.length;
  const multi = series.length > 1;
  const horizontal = type === 'bar';
  const plotW = width - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const domain = useMemo(() => {
    let lo = 0;
    let hi = 0;
    if (type === 'stacked') {
      for (let i = 0; i < n; i++) {
        let pos = 0;
        let neg = 0;
        for (const s of series) {
          const v = s.values[i] ?? 0;
          if (v >= 0) pos += v;
          else neg += v;
        }
        hi = Math.max(hi, pos);
        lo = Math.min(lo, neg);
      }
    } else {
      const vals = series.flatMap(s => s.values.filter((v): v is number => v !== null));
      hi = Math.max(type === 'line' ? -Infinity : 0, ...vals);
      lo = Math.min(type === 'line' ? Infinity : 0, ...vals);
    }
    const ticks = niceTicks(lo, hi);
    return { ticks, min: ticks[0]!, max: ticks[ticks.length - 1]! };
  }, [series, n, type]);

  if (data.error) {
    return (
      <div className="px-3 py-6 text-center text-[12px] text-mnemo-dim" role="note">
        {data.error}
      </div>
    );
  }

  const span = domain.max - domain.min || 1;
  // Value axis position (vertical for column/line/stacked, horizontal for bar).
  const vPos = (v: number) =>
    horizontal ? PAD.left + ((v - domain.min) / span) * plotW : PAD.top + plotH - ((v - domain.min) / span) * plotH;
  const band = (horizontal ? plotH : plotW) / Math.max(1, n);
  const bandStart = (i: number) => (horizontal ? PAD.top : PAD.left) + i * band;
  const zero = vPos(Math.max(domain.min, Math.min(0, domain.max)));

  const groupCount = type === 'stacked' || type === 'line' ? 1 : series.length;
  const barW = Math.max(2, Math.min(BAR_MAX, (band * 0.7 - GAP * (groupCount - 1)) / groupCount));
  const groupW = barW * groupCount + GAP * (groupCount - 1);

  const marks: ReactElement[] = [];
  const labels: ReactElement[] = [];
  const labelBars = !multi && n <= 12 && type !== 'line';

  if (type === 'line') {
    series.forEach((s, si) => {
      let d = '';
      s.values.forEach((v, i) => {
        if (v === null) return;
        const x = bandStart(i) + band / 2;
        const y = vPos(v);
        d += `${d && s.values[i - 1] !== null ? 'L' : 'M'}${x},${y}`;
      });
      marks.push(<path key={`l${si}`} d={d} fill="none" stroke={color(si)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />);
      const last = s.values.map((v, i) => (v === null ? -1 : i)).filter(i => i >= 0).pop();
      if (last !== undefined) {
        const x = bandStart(last) + band / 2;
        const y = vPos(s.values[last]!);
        marks.push(<circle key={`e${si}`} cx={x} cy={y} r={4} fill={color(si)} stroke="var(--mnemo-bg-app)" strokeWidth={2} />);
        if (series.length <= 4) {
          labels.push(
            <text key={`t${si}`} x={x - 6} y={y - 8} textAnchor="end" className="fill-mnemo-muted text-[10px] tabular-nums">
              {s.labels[last]}
            </text>,
          );
        }
      }
      if (hover) {
        const v = s.values[hover.i];
        if (v !== null && v !== undefined) {
          marks.push(
            <circle key={`h${si}`} cx={bandStart(hover.i) + band / 2} cy={vPos(v)} r={4} fill={color(si)} stroke="var(--mnemo-bg-app)" strokeWidth={2} />,
          );
        }
      }
    });
  } else {
    for (let i = 0; i < n; i++) {
      const start = bandStart(i) + (band - groupW) / 2;
      if (type === 'stacked') {
        let posBase = 0;
        let negBase = 0;
        const segs = series.map((s, si) => ({ si, v: s.values[i] ?? 0 })).filter(x => x.v !== 0);
        const topPos = segs.filter(x => x.v > 0).pop()?.si;
        const topNeg = segs.filter(x => x.v < 0).pop()?.si;
        for (const { si, v } of segs) {
          const from = v >= 0 ? posBase : negBase;
          const to = from + v;
          if (v >= 0) posBase = to;
          else negBase = to;
          const a = vPos(from);
          const b = vPos(to);
          const isEnd = si === (v >= 0 ? topPos : topNeg);
          // 2px surface gap between stacked segments.
          const y = Math.min(a, b) + (isEnd ? 0 : v >= 0 ? GAP : 0);
          const h = Math.max(0, Math.abs(a - b) - (isEnd ? 0 : GAP));
          marks.push(<path key={`s${i}-${si}`} d={barPath(start, y, barW, h, v >= 0 ? 'top' : 'bottom', isEnd)} fill={color(si)} />);
        }
      } else {
        series.forEach((s, si) => {
          const v = s.values[i];
          if (v === null) return;
          const offset = start + si * (barW + GAP);
          const a = zero;
          const b = vPos(v);
          if (horizontal) {
            const x = Math.min(a, b);
            marks.push(<path key={`b${i}-${si}`} d={barPath(x, offset, Math.abs(b - a), barW, v >= 0 ? 'right' : 'left')} fill={color(si)} />);
            if (labelBars) {
              labels.push(
                <text key={`v${i}`} x={v >= 0 ? b + 4 : b - 4} y={offset + barW / 2 + 3} textAnchor={v >= 0 ? 'start' : 'end'} className="fill-mnemo-muted text-[10px] tabular-nums">
                  {s.labels[i]}
                </text>,
              );
            }
          } else {
            const y = Math.min(a, b);
            marks.push(<path key={`b${i}-${si}`} d={barPath(offset, y, barW, Math.abs(b - a), v >= 0 ? 'top' : 'bottom')} fill={color(si)} />);
            if (labelBars) {
              labels.push(
                <text key={`v${i}`} x={offset + barW / 2} y={v >= 0 ? b - 4 : b + 12} textAnchor="middle" className="fill-mnemo-muted text-[10px] tabular-nums">
                  {s.labels[i]}
                </text>,
              );
            }
          }
        });
      }
    }
  }

  // Category labels: thin out so they never collide.
  const maxCatLabels = Math.max(1, Math.floor((horizontal ? plotH / 14 : plotW / 56)));
  const every = Math.ceil(n / maxCatLabels);

  const tooltip = hover ? (
    <div
      className="pointer-events-none absolute z-10 min-w-[120px] rounded-md border border-mnemo-border bg-mnemo-panel-elevated px-2 py-1.5 text-[11px] shadow-lg"
      style={{ left: Math.min(hover.x + 12, width - 150), top: Math.max(0, hover.y - 10) }}
      role="tooltip"
    >
      <div className="mb-1 font-medium text-mnemo-text">{categories[hover.i]}</div>
      {series.map((s, si) => (
        <div key={si} className="flex items-center gap-2 text-mnemo-muted">
          <span className="inline-block h-2 w-2 shrink-0 rounded-sm" style={{ background: color(si) }} />
          <span className="flex-1 truncate">{s.name}</span>
          <span className="tabular-nums text-mnemo-text">{s.values[hover.i] === null ? '—' : s.labels[hover.i]}</span>
        </div>
      ))}
    </div>
  ) : null;

  return (
    <figure className="m-0">
      {title && <figcaption className="mb-1 text-[12px] font-medium text-mnemo-text">{title}</figcaption>}
      {multi && (
        <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-mnemo-muted" aria-label="Legend">
          {series.map((s, si) => (
            <span key={si} className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-sm" style={{ background: color(si) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div ref={wrapRef} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={H} role="img" aria-label={`${title ?? 'Chart'}: ${series.map(s => s.name).join(', ')} by ${categories.length} categories`}>
          {domain.ticks.map(t => {
            const p = vPos(t);
            return horizontal ? (
              <g key={t}>
                <line x1={p} x2={p} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--mnemo-border)" strokeWidth={1} />
                <text x={p} y={H - 10} textAnchor="middle" className="fill-mnemo-dim text-[10px] tabular-nums">
                  {shortNumber(t)}
                </text>
              </g>
            ) : (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={p} y2={p} stroke="var(--mnemo-border)" strokeWidth={1} />
                <text x={PAD.left - 6} y={p + 3} textAnchor="end" className="fill-mnemo-dim text-[10px] tabular-nums">
                  {shortNumber(t)}
                </text>
              </g>
            );
          })}
          {categories.map((c, i) =>
            i % every === 0 ? (
              horizontal ? (
                <text key={i} x={PAD.left - 6} y={bandStart(i) + band / 2 + 3} textAnchor="end" className="fill-mnemo-dim text-[10px]">
                  {c.length > 10 ? `${c.slice(0, 9)}…` : c}
                </text>
              ) : (
                <text key={i} x={bandStart(i) + band / 2} y={H - 10} textAnchor="middle" className="fill-mnemo-dim text-[10px]">
                  {c.length > 12 ? `${c.slice(0, 11)}…` : c}
                </text>
              )
            ) : null,
          )}
          {hover && (
            <rect
              x={horizontal ? PAD.left : bandStart(hover.i)}
              y={horizontal ? bandStart(hover.i) : PAD.top}
              width={horizontal ? plotW : band}
              height={horizontal ? band : plotH}
              fill="var(--mnemo-text-dim, #888)"
              opacity={0.08}
            />
          )}
          {marks}
          {labels}
          {categories.map((_, i) => (
            <rect
              key={`hit${i}`}
              x={horizontal ? PAD.left : bandStart(i)}
              y={horizontal ? bandStart(i) : PAD.top}
              width={horizontal ? plotW : band}
              height={horizontal ? band : plotH}
              fill="transparent"
              onMouseMove={e => {
                const box = wrapRef.current!.getBoundingClientRect();
                setHover({ i, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
            />
          ))}
        </svg>
        {tooltip}
      </div>
    </figure>
  );
}
