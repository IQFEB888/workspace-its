/**
 * Editable Interactive Mind Map Graph Engine (Workspace ITS v4.0.0)
 * Pure data structures & immutable graph transformations for:
 * - Tree-to-Graph layout conversion (local & Gemini 3.6 Flash AI trees)
 * - Zoom math (25% – 500%)
 * - Drag positioning, resizing, recoloring, text editing, adding/removing nodes & links
 */

import { MindMapNode } from './studyTools';

export const MINDMAP_MIN_ZOOM = 0.25;
export const MINDMAP_MAX_ZOOM = 5.0;

export const MINDMAP_COLOR_SWATCHES = [
  { id: 'indigo', label: 'Indaco', hex: '#6366f1' },
  { id: 'sky', label: 'Azzurro', hex: '#38bdf8' },
  { id: 'emerald', label: 'Smeraldo', hex: '#10b981' },
  { id: 'amber', label: 'Ambra', hex: '#f59e0b' },
  { id: 'rose', label: 'Corallo', hex: '#f43f5e' },
  { id: 'violet', label: 'Viola', hex: '#a855f7' },
  { id: 'teal', label: 'Ottanio', hex: '#14b8a6' },
  { id: 'slate', label: 'Ardesia', hex: '#94a3b8' }
] as const;

export type MindMapSizePreset = 'sm' | 'md' | 'lg' | 'xl';

export const MINDMAP_SIZE_PRESETS: Record<
  MindMapSizePreset,
  { label: string; width: number; height: number; fontSize: number }
> = {
  sm: { label: 'S', width: 156, height: 36, fontSize: 10.5 },
  md: { label: 'M', width: 204, height: 46, fontSize: 12 },
  lg: { label: 'L', width: 256, height: 58, fontSize: 13.5 },
  xl: { label: 'XL', width: 312, height: 72, fontSize: 15.5 }
};

export interface EditableMindMapNode {
  id: string;
  label: string;
  detail: string;
  kind: 'root' | 'heading' | 'concept' | 'code' | 'formula';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  color: string;
}

export interface EditableMindMapEdge {
  id: string;
  fromId: string;
  toId: string;
  color?: string;
  style?: 'solid' | 'dashed';
}

export interface EditableMindMapGraph {
  nodes: EditableMindMapNode[];
  edges: EditableMindMapEdge[];
}

export interface MindMapHistorySession {
  id: string;
  subjectName: string;
  title: string;
  pageIds: string[];
  pageNames: string[];
  createdAt: string;
  updatedAt: string;
  modelLabel: string;
  graph: EditableMindMapGraph;
}

export function clampMindMapZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.max(MINDMAP_MIN_ZOOM, Math.min(MINDMAP_MAX_ZOOM, Number(z.toFixed(2))));
}

export function detectNodeSizePreset(node: Pick<EditableMindMapNode, 'width' | 'fontSize'>): MindMapSizePreset {
  if (node.width >= 285 || node.fontSize >= 15) return 'xl';
  if (node.width >= 230 || node.fontSize >= 13) return 'lg';
  if (node.width >= 180 || node.fontSize >= 11.5) return 'md';
  return 'sm';
}

export function treeToEditableGraph(root: MindMapNode): EditableMindMapGraph {
  const nodes: EditableMindMapNode[] = [];
  const edges: EditableMindMapEdge[] = [];
  const palette = MINDMAP_COLOR_SWATCHES.map(s => s.hex);

  const rootX = 640;
  const level1GapX = 310;
  const level2GapX = 285;
  const level3GapX = 250;
  const leafGapY = 74;

  const rightBranches: MindMapNode[] = [];
  const leftBranches: MindMapNode[] = [];
  (root.children || []).forEach((child, i) => {
    if (i % 2 === 0) rightBranches.push(child);
    else leftBranches.push(child);
  });

  const countLeaves = (n: MindMapNode): number => {
    if (!n.children || n.children.length === 0) return 1;
    return n.children.reduce((acc, ch) => acc + countLeaves(ch), 0);
  };

  const measureSideHeight = (branches: MindMapNode[]) => {
    if (branches.length === 0) return 160;
    return branches.reduce((acc, b) => acc + Math.max(1, countLeaves(b)) * leafGapY + 34, 0);
  };

  const rightH = measureSideHeight(rightBranches);
  const leftH = measureSideHeight(leftBranches);
  const totalHeight = Math.max(620, Math.max(rightH, leftH) + 160);
  const rootY = Math.round(totalHeight / 2);

  const rootId = root.id || 'mm_root';
  nodes.push({
    id: rootId,
    label: root.label || 'Mappa Concettuale',
    detail: root.detail || root.label || '',
    kind: 'root',
    x: rootX,
    y: rootY,
    width: 244,
    height: 58,
    fontSize: 14,
    color: '#6366f1'
  });

  const placeSide = (branches: MindMapNode[], side: 'right' | 'left', sideH: number) => {
    let cursorY = rootY - sideH / 2 + 28;
    const dir = side === 'right' ? 1 : -1;

    branches.forEach((branch, idx) => {
      const color = palette[(idx + (side === 'left' ? 3 : 0)) % palette.length];
      const leafCount = Math.max(1, countLeaves(branch));
      const spanH = leafCount * leafGapY;
      const bx = rootX + dir * level1GapX;
      const by = Math.round(cursorY + spanH / 2);

      nodes.push({
        id: branch.id,
        label: branch.label,
        detail: branch.detail || branch.label,
        kind: branch.kind || 'heading',
        x: bx,
        y: by,
        width: 214,
        height: 46,
        fontSize: 12.5,
        color
      });
      edges.push({
        id: `edge_${rootId}_${branch.id}`,
        fromId: rootId,
        toId: branch.id,
        color,
        style: 'solid'
      });

      let childCursorY = cursorY;
      (branch.children || []).forEach(child => {
        const subLeafCount = Math.max(1, countLeaves(child));
        const subSpanH = subLeafCount * leafGapY;
        const cx = bx + dir * level2GapX;
        const cy = Math.round(childCursorY + subSpanH / 2);

        nodes.push({
          id: child.id,
          label: child.label,
          detail: child.detail || child.label,
          kind: child.kind || 'concept',
          x: cx,
          y: cy,
          width: 204,
          height: 42,
          fontSize: 11.5,
          color
        });
        edges.push({
          id: `edge_${branch.id}_${child.id}`,
          fromId: branch.id,
          toId: child.id,
          color,
          style: 'solid'
        });

        // Optional 3rd level sub-concepts (e.g. from Gemini 3.6 Flash)
        (child.children || []).forEach((grand, gIdx) => {
          const gx = cx + dir * level3GapX;
          const gy = Math.round(childCursorY + gIdx * leafGapY + leafGapY / 2);
          nodes.push({
            id: grand.id,
            label: grand.label,
            detail: grand.detail || grand.label,
            kind: grand.kind || 'concept',
            x: gx,
            y: gy,
            width: 186,
            height: 38,
            fontSize: 11,
            color
          });
          edges.push({
            id: `edge_${child.id}_${grand.id}`,
            fromId: child.id,
            toId: grand.id,
            color,
            style: 'solid'
          });
        });

        childCursorY += subSpanH;
      });

      cursorY += spanH + 34;
    });
  };

  placeSide(rightBranches, 'right', rightH);
  placeSide(leftBranches, 'left', leftH);

  return { nodes, edges };
}

export function parseAiMindMapJson(rawText: string, fallbackTitle: string): MindMapNode | null {
  if (!rawText || typeof rawText !== 'string') return null;
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    const rawRoot = parsed.root || parsed.mindmap || parsed;
    if (!rawRoot || typeof rawRoot !== 'object') return null;

    let counter = 1;
    const convertNode = (item: any, level: number): MindMapNode | null => {
      if (!item || typeof item !== 'object') return null;
      const label = String(item.label || item.title || item.name || '').trim();
      if (!label) return null;
      const detail = String(item.detail || item.description || item.summary || label).trim();
      const rawChildren = Array.isArray(item.children)
        ? item.children
        : Array.isArray(item.branches)
          ? item.branches
          : Array.isArray(item.nodes)
            ? item.nodes
            : [];

      const children: MindMapNode[] =
        level < 3
          ? rawChildren
              .slice(0, 10)
              .map((ch: any) => convertNode(ch, level + 1))
              .filter((n: MindMapNode | null): n is MindMapNode => n !== null)
          : [];

      const validKinds = ['root', 'heading', 'concept', 'code', 'formula'] as const;
      const inferredKind =
        level === 0
          ? 'root'
          : validKinds.includes(item.kind)
            ? item.kind
            : level === 1
              ? 'heading'
              : 'concept';

      return {
        id: level === 0 ? 'mm_root' : `mm_ai_${Date.now().toString(36)}_${counter++}`,
        label: label.slice(0, 80),
        detail: detail.slice(0, 320),
        level,
        kind: inferredKind,
        children
      };
    };

    const rootLabel = String(rawRoot.label || rawRoot.title || fallbackTitle || 'Mappa Concettuale').trim();
    const normalizedRoot = convertNode({ ...rawRoot, label: rootLabel }, 0);
    if (!normalizedRoot || normalizedRoot.children.length === 0) return null;
    return normalizedRoot;
  } catch {
    return null;
  }
}

export function addNodeToGraph(
  graph: EditableMindMapGraph,
  parentId?: string | null,
  overrides?: Partial<Omit<EditableMindMapNode, 'id'>>
): { graph: EditableMindMapGraph; newNodeId: string } {
  const newNodeId = `mm_custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const parent = parentId ? graph.nodes.find(n => n.id === parentId) : null;
  const siblingOffset = (graph.nodes.length % 5) * 26 - 52;

  const baseX = parent
    ? parent.x + (parent.x < 640 ? -245 : 245)
    : 640 + ((graph.nodes.length % 4) - 1.5) * 70;
  const baseY = parent
    ? parent.y + siblingOffset
    : 310 + ((graph.nodes.length % 5) - 2) * 56;

  const newNode: EditableMindMapNode = {
    id: newNodeId,
    label: overrides?.label ?? 'Nuovo Concetto',
    detail: overrides?.detail ?? 'Clicca per modificare testo, colore e collegamenti.',
    kind: overrides?.kind ?? (parent ? 'concept' : 'heading'),
    x: Math.round(overrides?.x ?? baseX),
    y: Math.round(overrides?.y ?? baseY),
    width: overrides?.width ?? 204,
    height: overrides?.height ?? 46,
    fontSize: overrides?.fontSize ?? 12,
    color: overrides?.color ?? parent?.color ?? '#38bdf8'
  };

  const nextEdges = [...graph.edges];
  if (parent) {
    nextEdges.push({
      id: `edge_${parent.id}_${newNodeId}`,
      fromId: parent.id,
      toId: newNodeId,
      color: newNode.color,
      style: 'solid'
    });
  }

  return {
    newNodeId,
    graph: {
      nodes: [...graph.nodes, newNode],
      edges: nextEdges
    }
  };
}

export function updateNodeInGraph(
  graph: EditableMindMapGraph,
  nodeId: string,
  patch: Partial<Omit<EditableMindMapNode, 'id'>>,
  syncIncomingEdgeColor = false
): EditableMindMapGraph {
  const nextNodes = graph.nodes.map(n =>
    n.id === nodeId
      ? {
          ...n,
          ...patch,
          width: patch.width !== undefined ? Math.max(110, Math.min(460, Math.round(patch.width))) : n.width,
          height: patch.height !== undefined ? Math.max(30, Math.min(180, Math.round(patch.height))) : n.height,
          fontSize: patch.fontSize !== undefined ? Math.max(9, Math.min(26, Number(patch.fontSize))) : n.fontSize
        }
      : n
  );

  const nextEdges =
    syncIncomingEdgeColor && patch.color
      ? graph.edges.map(e => (e.toId === nodeId ? { ...e, color: patch.color } : e))
      : graph.edges;

  return { nodes: nextNodes, edges: nextEdges };
}

export function deleteNodeFromGraph(
  graph: EditableMindMapGraph,
  nodeId: string
): EditableMindMapGraph {
  return {
    nodes: graph.nodes.filter(n => n.id !== nodeId),
    edges: graph.edges.filter(e => e.fromId !== nodeId && e.toId !== nodeId)
  };
}

export function addEdgeToGraph(
  graph: EditableMindMapGraph,
  fromId: string,
  toId: string,
  style: 'solid' | 'dashed' = 'solid'
): { graph: EditableMindMapGraph; createdEdgeId: string | null } {
  if (!fromId || !toId || fromId === toId) {
    return { graph, createdEdgeId: null };
  }
  const fromExists = graph.nodes.some(n => n.id === fromId);
  const toExists = graph.nodes.some(n => n.id === toId);
  if (!fromExists || !toExists) {
    return { graph, createdEdgeId: null };
  }
  const duplicate = graph.edges.some(
    e => (e.fromId === fromId && e.toId === toId) || (e.fromId === toId && e.toId === fromId)
  );
  if (duplicate) {
    return { graph, createdEdgeId: null };
  }

  const targetNode = graph.nodes.find(n => n.id === toId);
  const sourceNode = graph.nodes.find(n => n.id === fromId);
  const createdEdgeId = `edge_${fromId}_${toId}_${Date.now().toString(36)}`;

  return {
    createdEdgeId,
    graph: {
      nodes: graph.nodes,
      edges: [
        ...graph.edges,
        {
          id: createdEdgeId,
          fromId,
          toId,
          color: targetNode?.color || sourceNode?.color || '#6366f1',
          style
        }
      ]
    }
  };
}

export function updateEdgeInGraph(
  graph: EditableMindMapGraph,
  edgeId: string,
  patch: Partial<Pick<EditableMindMapEdge, 'color' | 'style'>>
): EditableMindMapGraph {
  return {
    nodes: graph.nodes,
    edges: graph.edges.map(e => (e.id === edgeId ? { ...e, ...patch } : e))
  };
}

export function deleteEdgeFromGraph(
  graph: EditableMindMapGraph,
  edgeId: string
): EditableMindMapGraph {
  return {
    nodes: graph.nodes,
    edges: graph.edges.filter(e => e.id !== edgeId)
  };
}

export function computeGraphBounds(graph: EditableMindMapGraph): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  if (!graph.nodes.length) {
    return { minX: 0, minY: 0, width: 1280, height: 680 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  graph.nodes.forEach(n => {
    minX = Math.min(minX, n.x - n.width / 2);
    maxX = Math.max(maxX, n.x + n.width / 2);
    minY = Math.min(minY, n.y - n.height / 2);
    maxY = Math.max(maxY, n.y + n.height / 2);
  });

  const padX = 140;
  const padY = 110;
  return {
    minX: Math.round(minX - padX),
    minY: Math.round(minY - padY),
    width: Math.max(1080, Math.round(maxX - minX + padX * 2)),
    height: Math.max(600, Math.round(maxY - minY + padY * 2))
  };
}

export function autoRelayoutEditableGraph(graph: EditableMindMapGraph): EditableMindMapGraph {
  if (graph.nodes.length <= 1) return graph;
  const root = graph.nodes.find(n => n.kind === 'root') || graph.nodes[0];
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
  const adj = new Map<string, string[]>();
  graph.edges.forEach(e => {
    if (!adj.has(e.fromId)) adj.set(e.fromId, []);
    adj.get(e.fromId)!.push(e.toId);
  });

  const visited = new Set<string>([root.id]);
  const buildTree = (id: string, level: number): MindMapNode => {
    const n = nodeMap.get(id)!;
    const kids = (adj.get(id) || [])
      .filter(cid => !visited.has(cid) && nodeMap.has(cid))
      .map(cid => {
        visited.add(cid);
        return buildTree(cid, level + 1);
      });
    return {
      id: n.id,
      label: n.label,
      detail: n.detail,
      level,
      kind: n.kind,
      children: kids
    };
  };

  const tree = buildTree(root.id, 0);
  // Attach any disconnected custom nodes as top-level branches so they don't vanish
  graph.nodes.forEach(n => {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      tree.children.push({
        id: n.id,
        label: n.label,
        detail: n.detail,
        level: 1,
        kind: n.kind,
        children: []
      });
    }
  });

  const laidOut = treeToEditableGraph(tree);
  const posById = new Map(laidOut.nodes.map(n => [n.id, { x: n.x, y: n.y }]));

  return {
    nodes: graph.nodes.map(n => {
      const pos = posById.get(n.id);
      return pos ? { ...n, x: pos.x, y: pos.y } : n;
    }),
    edges: graph.edges
  };
}
