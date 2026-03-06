import React from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import noverlap from 'graphology-layout-noverlap';
import type { NetworkGraphEdge, NetworkGraphNode } from '@/types/models';

type Props = {
  nodes: NetworkGraphNode[];
  edges: NetworkGraphEdge[];
  focusedNodeId: string | null;
  hoveredNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
  onNodeHover: (nodeId: string | null) => void;
  onStageClick: () => void;
  resetNonce: number;
  className?: string;
};

type ThemeGraphColors = {
  node: Record<string, string>;
  edgeNeutral: string;
  edgeHighlight: string;
  edgeMuted: string;
  label: string;
  tooltipBg: string;
  tooltipBorder: string;
  nodeRing: string;
  nodeDim: string;
};

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function getThemeGraphColors(): ThemeGraphColors {
  return {
    node: {
      person: readCssVar('--chart-person', 'dodgerblue'),
      project: readCssVar('--chart-project', 'mediumturquoise'),
      client: readCssVar('--chart-client', 'orange'),
    },
    edgeNeutral: readCssVar('--chart-neutral', 'slategray'),
    edgeHighlight: readCssVar('--chart-accent-b', 'mediumseagreen'),
    edgeMuted: readCssVar('--color-border-subtle', 'slategray'),
    label: readCssVar('--color-text-primary', 'white'),
    tooltipBg: readCssVar('--color-surface-elevated', 'black'),
    tooltipBorder: readCssVar('--color-focus-ring', 'deepskyblue'),
    nodeRing: readCssVar('--color-focus-ring', 'deepskyblue'),
    nodeDim: readCssVar('--color-border-subtle', 'black'),
  };
}

const NODE_COLORS: Record<string, string> = {
  person: 'dodgerblue',
  project: 'mediumturquoise',
  client: 'orange',
};

function edgeColor(fromType: string, colors: ThemeGraphColors): string {
  if (fromType === 'client') return colors.node.client;
  if (fromType === 'project') return colors.node.project;
  return colors.edgeNeutral;
}

function drawAccessibleNodeHover(context: CanvasRenderingContext2D, data: any, settings: any, colors: ThemeGraphColors) {
  const label = String(data?.label || '');
  if (!label) return;

  const nodeSize = Number(data?.size || 8);
  const fontSize = Number(settings?.labelSize || 12) + 1;
  const fontFamily = String(settings?.labelFont || 'system-ui, sans-serif');
  const fontWeight = String(settings?.labelWeight || '600');
  context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  const textWidth = context.measureText(label).width;
  const padX = 8;
  const padY = 4;
  const boxWidth = textWidth + (padX * 2);
  const boxHeight = fontSize + (padY * 2);
  const boxX = Number(data.x || 0) + nodeSize + 8;
  const boxY = Number(data.y || 0) - (boxHeight / 2);
  const radius = 6;

  context.save();

  // Draw a dark tooltip pill so light text remains readable on any graph colors.
  context.beginPath();
  context.moveTo(boxX + radius, boxY);
  context.lineTo(boxX + boxWidth - radius, boxY);
  context.arcTo(boxX + boxWidth, boxY, boxX + boxWidth, boxY + radius, radius);
  context.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
  context.arcTo(boxX + boxWidth, boxY + boxHeight, boxX + boxWidth - radius, boxY + boxHeight, radius);
  context.lineTo(boxX + radius, boxY + boxHeight);
  context.arcTo(boxX, boxY + boxHeight, boxX, boxY + boxHeight - radius, radius);
  context.lineTo(boxX, boxY + radius);
  context.arcTo(boxX, boxY, boxX + radius, boxY, radius);
  context.closePath();
  context.fillStyle = colors.tooltipBg;
  context.fill();
  context.strokeStyle = colors.tooltipBorder;
  context.lineWidth = 1;
  context.stroke();

  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillStyle = colors.label;
  context.fillText(label, boxX + padX, boxY + (boxHeight / 2));

  // Add a subtle ring around the hovered node for clearer focus.
  context.beginPath();
  context.arc(Number(data.x || 0), Number(data.y || 0), nodeSize + 2, 0, Math.PI * 2);
  context.strokeStyle = colors.nodeRing;
  context.lineWidth = 2;
  context.stroke();

  context.restore();
}

const NetworkGraphCanvas: React.FC<Props> = ({
  nodes,
  edges,
  focusedNodeId,
  hoveredNodeId,
  onNodeClick,
  onNodeHover,
  onStageClick,
  resetNonce,
  className,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const sigmaRef = React.useRef<Sigma | null>(null);
  const graphRef = React.useRef<Graph | null>(null);
  const cameraRatioRef = React.useRef(1);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const themeColors = getThemeGraphColors();

    const graph = new Graph();
    const nodeTypeById = new Map<string, string>();

    const safeNodes = nodes || [];
    const safeEdges = edges || [];

    safeNodes.forEach((node, index) => {
      const type = node.type || 'person';
      nodeTypeById.set(node.id, type);
      graph.addNode(node.id, {
        label: node.label,
        kind: type,
        size: type === 'project' ? 7 : type === 'client' ? 8 : 6,
        color: themeColors.node[type] || themeColors.node.person || NODE_COLORS[type] || NODE_COLORS.person,
        x: Math.cos((index / Math.max(1, safeNodes.length)) * Math.PI * 2),
        y: Math.sin((index / Math.max(1, safeNodes.length)) * Math.PI * 2),
      });
    });

    let minScore = Number.POSITIVE_INFINITY;
    let maxScore = Number.NEGATIVE_INFINITY;
    for (const edge of safeEdges) {
      const score = Number(edge.score || 0);
      minScore = Math.min(minScore, score);
      maxScore = Math.max(maxScore, score);
    }
    if (!Number.isFinite(minScore)) minScore = 0;
    if (!Number.isFinite(maxScore)) maxScore = 1;
    const scoreSpan = Math.max(0.0001, maxScore - minScore);

    safeEdges.forEach((edge) => {
      if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return;
      if (graph.hasEdge(edge.id)) return;
      const sourceType = nodeTypeById.get(edge.source) || 'person';
      const normScore = (Number(edge.score || 0) - minScore) / scoreSpan;
      graph.addEdgeWithKey(edge.id, edge.source, edge.target, {
        size: 0.5 + (normScore * 2.2),
        color: edgeColor(sourceType, themeColors),
      });
    });

    if (graph.order > 1) {
      try {
        forceAtlas2.assign(graph, {
          iterations: 150,
          settings: {
            gravity: 1,
            scalingRatio: 6,
            strongGravityMode: true,
            slowDown: 10,
          },
        });
      } catch {}
      try {
        noverlap.assign(graph, { maxIterations: 150 });
      } catch {}
    }

    const renderer = new Sigma(graph, container, {
      renderEdgeLabels: false,
      defaultNodeColor: themeColors.node.person,
      defaultEdgeColor: themeColors.edgeNeutral,
      labelColor: { color: themeColors.label },
      labelFont: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
      labelWeight: '600',
      labelSize: 13,
      defaultDrawNodeHover: (context, data, settings) => drawAccessibleNodeHover(context, data, settings, themeColors),
      labelRenderedSizeThreshold: 5,
      labelDensity: 1,
      labelGridCellSize: 120,
      minCameraRatio: 0.02,
      maxCameraRatio: 8,
    });

    renderer.on('clickNode', ({ node }) => {
      onNodeClick(node);
    });
    renderer.on('enterNode', ({ node }) => {
      onNodeHover(node);
    });
    renderer.on('leaveNode', () => {
      onNodeHover(null);
    });
    renderer.on('clickStage', () => {
      onStageClick();
    });

    renderer.setSetting('nodeReducer', (_, data) => data);
    renderer.setSetting('edgeReducer', (_, data) => data);
    const camera = renderer.getCamera();
    cameraRatioRef.current = camera.getState().ratio;
    camera.on('updated', (state) => {
      cameraRatioRef.current = state.ratio;
    });
    sigmaRef.current = renderer;
    graphRef.current = graph;
    camera.setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });

    return () => {
      sigmaRef.current = null;
      graphRef.current = null;
      renderer.kill();
    };
  }, [nodes, edges, onNodeClick, onNodeHover, onStageClick]);

  React.useEffect(() => {
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph) return;
    const themeColors = getThemeGraphColors();

    const activeNode = hoveredNodeId || focusedNodeId;
    const neighbors = new Set<string>();
    if (activeNode && graph.hasNode(activeNode)) {
      graph.neighbors(activeNode).forEach((id) => neighbors.add(id));
    }

    renderer.setSetting('nodeReducer', (node, data) => {
      if (!activeNode) {
        const nodeType = String((data as any).kind || '');
        const ratio = cameraRatioRef.current;
        // Show project/client labels first, then reveal people as user zooms in further.
        if (nodeType === 'project' || nodeType === 'client') {
          return ratio <= 1.2 ? { ...data, forceLabel: true } : { ...data, label: '' };
        }
        return ratio <= 0.52 ? { ...data, forceLabel: true } : { ...data, label: '' };
      }
      if (node === activeNode) {
        return { ...data, size: Number(data.size || 6) * 1.55, zIndex: 10, forceLabel: true };
      }
      if (neighbors.has(node)) {
        return { ...data, size: Number(data.size || 6) * 1.2, zIndex: 5, forceLabel: true };
      }
      return { ...data, color: themeColors.edgeMuted, label: '' };
    });

    renderer.setSetting('edgeReducer', (edge, data) => {
      if (!activeNode) return data;
      const ext = graph.extremities(edge);
      if (ext[0] === activeNode || ext[1] === activeNode) {
        return { ...data, color: themeColors.edgeHighlight, size: Number(data.size || 1) * 1.7, zIndex: 5 };
      }
      return { ...data, color: themeColors.nodeDim, hidden: !(neighbors.has(ext[0]) || neighbors.has(ext[1])) };
    });
    renderer.refresh();
  }, [focusedNodeId, hoveredNodeId]);

  React.useEffect(() => {
    if (!focusedNodeId) return;
    const renderer = sigmaRef.current;
    const graph = graphRef.current;
    if (!renderer || !graph || !graph.hasNode(focusedNodeId)) return;

    const nodeDisplay = renderer.getNodeDisplayData(focusedNodeId);
    const targetX = Number(nodeDisplay?.x);
    const targetY = Number(nodeDisplay?.y);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return;

    const camera = renderer.getCamera();
    const current = camera.getState();
    const targetRatio = Math.max(0.08, Math.min(Number(current.ratio || 1), 0.45));
    camera.animate(
      {
        x: targetX,
        y: targetY,
        ratio: targetRatio,
      },
      { duration: 240 }
    );
  }, [focusedNodeId]);

  React.useEffect(() => {
    const renderer = sigmaRef.current;
    if (!renderer) return;
    void renderer.getCamera().animatedReset({ duration: 300 });
  }, [resetNonce]);

  return (
    <div className={`relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] ${className || ''}`}>
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
};

export default NetworkGraphCanvas;
