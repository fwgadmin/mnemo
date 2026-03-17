import { useEffect, useRef, useState, useCallback } from 'react';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } from 'd3-force';
import type { SimulationNodeDatum, SimulationLinkDatum } from 'd3-force';
import type { GraphData } from '../../shared/types';

interface GraphViewProps {
  onSelectNote: (id: string) => void;
  activeNoteId: string | null;
}

interface GraphNode extends SimulationNodeDatum {
  id: string;
  title: string;
}

interface GraphLink extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

export default function GraphView({ onSelectNote, activeNoteId }: GraphViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<GraphNode>> | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const linksRef = useRef<GraphLink[]>([]);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const animFrameRef = useRef<number>(0);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef<{ node: GraphNode | null; offsetX: number; offsetY: number }>({ node: null, offsetX: 0, offsetY: 0 });

  const loadGraph = useCallback(async () => {
    const data: GraphData = await window.mnemo.notes.getGraph();
    nodesRef.current = data.nodes.map(n => ({ ...n, x: undefined, y: undefined }));
    linksRef.current = data.links.map(l => ({ source: l.source, target: l.target }));

    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation<GraphNode>(nodesRef.current)
      .force('link', forceLink<GraphNode, GraphLink>(linksRef.current).id(d => d.id).distance(80))
      .force('charge', forceManyBody().strength(-200))
      .force('center', forceCenter(0, 0))
      .force('collide', forceCollide(30))
      .alphaDecay(0.02);

    sim.on('tick', () => draw());
    simRef.current = sim;
  }, []);

  useEffect(() => {
    loadGraph();
    return () => {
      simRef.current?.stop();
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [loadGraph]);

  // Resize canvas
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = container.clientWidth * dpr;
      canvas.height = container.clientHeight * dpr;
      canvas.style.width = container.clientWidth + 'px';
      canvas.style.height = container.clientHeight + 'px';
      draw();
    });

    if (containerRef.current) resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    const { x: tx, y: ty, k } = transformRef.current;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + tx, h / 2 + ty);
    ctx.scale(k, k);

    // Draw links
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1;
    for (const link of linksRef.current) {
      const s = link.source as GraphNode;
      const t = link.target as GraphNode;
      if (s.x == null || s.y == null || t.x == null || t.y == null) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const isActive = node.id === activeNoteId;
      const isHovered = node.id === hoveredNode;
      const radius = isActive ? 7 : isHovered ? 6 : 4;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = isActive ? '#7c7cff' : isHovered ? '#5a5aff' : '#555';
      ctx.fill();

      // Labels for active/hovered nodes
      if (isActive || isHovered) {
        ctx.font = '11px -apple-system, sans-serif';
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'center';
        ctx.fillText(node.title || 'Untitled', node.x, node.y - radius - 6);
      }
    }

    ctx.restore();
  }, [activeNoteId, hoveredNode]);

  // Redraw when active/hover changes
  useEffect(() => { draw(); }, [draw]);

  const screenToWorld = (clientX: number, clientY: number): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { x: tx, y: ty, k } = transformRef.current;
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    const w = rect.width;
    const h = rect.height;
    return [(cx - w / 2 - tx) / k, (cy - h / 2 - ty) / k];
  };

  const findNodeAt = (wx: number, wy: number): GraphNode | null => {
    for (const node of nodesRef.current) {
      if (node.x == null || node.y == null) continue;
      const dx = node.x - wx;
      const dy = node.y - wy;
      if (dx * dx + dy * dy < 100) return node; // radius ≈10
    }
    return null;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const dr = dragRef.current;

    if (dr.node) {
      dr.node.fx = wx;
      dr.node.fy = wy;
      simRef.current?.alpha(0.3).restart();
      return;
    }

    const node = findNodeAt(wx, wy);
    setHoveredNode(node?.id ?? null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const node = findNodeAt(wx, wy);
    if (node) {
      dragRef.current = { node, offsetX: 0, offsetY: 0 };
      node.fx = node.x;
      node.fy = node.y;
    }
  };

  const handleMouseUp = () => {
    const dr = dragRef.current;
    if (dr.node) {
      dr.node.fx = null;
      dr.node.fy = null;
      dr.node = null;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    const [wx, wy] = screenToWorld(e.clientX, e.clientY);
    const node = findNodeAt(wx, wy);
    if (node) onSelectNote(node.id);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const t = transformRef.current;
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    t.k = Math.max(0.2, Math.min(5, t.k * factor));
    draw();
  };

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#0a0a0a]">
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
        onWheel={handleWheel}
      />
      <div className="absolute top-3 left-3 text-[10px] text-[#444] select-none">
        GRAPH · {nodesRef.current.length} nodes
      </div>
    </div>
  );
}
