import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PageItem } from '../types';
import { MindMapNode, extractMindMapTreeFromHtml, stripHtmlTags } from '../utils/studyTools';

interface MindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectName: string;
  activePage: PageItem | null;
  allSubjectPages: PageItem[];
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface PositionedNode {
  node: MindMapNode;
  x: number;
  y: number;
  parentX?: number;
  parentY?: number;
  color: string;
  side: 'center' | 'right' | 'left';
}

const BRANCH_COLORS = ['#6366f1', '#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#a855f7'];

function computeHorizontalTreeLayout(
  root: MindMapNode,
  collapsedIds: Set<string>
): { nodes: PositionedNode[]; width: number; height: number } {
  const nodes: PositionedNode[] = [];
  const rootX = 560;
  const level1GapX = 270;
  const level2GapX = 250;
  const leafGapY = 62;

  const rightBranches: MindMapNode[] = [];
  const leftBranches: MindMapNode[] = [];
  root.children.forEach((child, i) => {
    if (i % 2 === 0) rightBranches.push(child);
    else leftBranches.push(child);
  });

  const measureSideHeight = (branches: MindMapNode[]) => {
    if (branches.length === 0) return 120;
    return branches.reduce((acc, b) => {
      const visibleChildren = collapsedIds.has(b.id) ? 0 : b.children.length;
      const span = Math.max(1, visibleChildren) * leafGapY + 28;
      return acc + span;
    }, 0);
  };

  const rightH = measureSideHeight(rightBranches);
  const leftH = measureSideHeight(leftBranches);
  const totalHeight = Math.max(520, Math.max(rightH, leftH) + 120);
  const rootY = totalHeight / 2;

  nodes.push({
    node: root,
    x: rootX,
    y: rootY,
    color: '#6366f1',
    side: 'center'
  });

  const placeSide = (branches: MindMapNode[], side: 'right' | 'left', sideH: number) => {
    let cursorY = rootY - sideH / 2 + 24;
    const dir = side === 'right' ? 1 : -1;

    branches.forEach((branch, idx) => {
      const color = BRANCH_COLORS[(idx + (side === 'left' ? 3 : 0)) % BRANCH_COLORS.length];
      const children = collapsedIds.has(branch.id) ? [] : branch.children;
      const spanH = Math.max(1, children.length) * leafGapY;
      const bx = rootX + dir * level1GapX;
      const by = cursorY + spanH / 2;

      nodes.push({
        node: branch,
        x: bx,
        y: by,
        parentX: rootX,
        parentY: rootY,
        color,
        side
      });

      children.forEach((leaf, lIdx) => {
        const lx = bx + dir * level2GapX;
        const ly = cursorY + lIdx * leafGapY + leafGapY / 2;
        nodes.push({
          node: leaf,
          x: lx,
          y: ly,
          parentX: bx,
          parentY: by,
          color,
          side
        });
      });

      cursorY += spanH + 28;
    });
  };

  placeSide(rightBranches, 'right', rightH);
  placeSide(leftBranches, 'left', leftH);

  return { nodes, width: 1120, height: totalHeight };
}

export const MindMapModal: React.FC<MindMapModalProps> = ({
  isOpen,
  onClose,
  subjectName,
  activePage,
  allSubjectPages,
  onNotify
}) => {
  const [scope, setScope] = useState<'page' | 'subject'>('page');
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<MindMapNode | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const activeLen = stripHtmlTags(activePage?.content || '').length;
    const subjectLen = allSubjectPages.reduce((acc, p) => acc + stripHtmlTags(p.content || '').length, 0);
    if (scope === 'page' && activeLen < 20 && subjectLen >= 20) {
      setScope('subject');
    }
  }, [isOpen, scope, activePage?.content, allSubjectPages]);

  const tree = useMemo(() => {
    const html =
      scope === 'page' && activePage
        ? activePage.content || ''
        : allSubjectPages.map(p => `<h2>${p.name}</h2>${p.content || ''}`).join('\n');
    const title = scope === 'page' && activePage ? activePage.name : subjectName;
    return extractMindMapTreeFromHtml(html, title);
  }, [scope, activePage, allSubjectPages, subjectName]);

  const layout = useMemo(
    () => computeHorizontalTreeLayout(tree, collapsedIds),
    [tree, collapsedIds]
  );

  if (!isOpen) return null;

  const toggleCollapse = (nodeId: string) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleExportSvg = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mappa_${(activePage?.name || subjectName).replace(/[^a-z0-9]/gi, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('🗺️ Mappa concettuale esportata in SVG vettoriale!');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box mindmap-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '1080px', width: '96%', height: '84vh' }}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span className="modal-title">🗺️ Mappa Concettuale Automatica — {subjectName}</span>
            <span className="study-pill-badge">{layout.nodes.length} Nodi</span>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi mappa">
            ✕
          </button>
        </div>

        <div className="mindmap-toolbar">
          <div className="study-seg-group">
            <button
              type="button"
              className={`study-seg-btn ${scope === 'page' ? 'active' : ''}`}
              onClick={() => setScope('page')}
            >
              Scheda Attuale
            </button>
            <button
              type="button"
              className={`study-seg-btn ${scope === 'subject' ? 'active' : ''}`}
              onClick={() => setScope('subject')}
            >
              Tutta la Materia
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              className="study-nav-btn"
              onClick={() => setZoom(z => Math.max(0.45, +(z - 0.15).toFixed(2)))}
            >
              −
            </button>
            <span className="mindmap-zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="study-nav-btn"
              onClick={() => setZoom(z => Math.min(2.1, +(z + 0.15).toFixed(2)))}
            >
              +
            </button>
            <button
              type="button"
              className="study-nav-btn"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
                setCollapsedIds(new Set());
              }}
            >
              ↺ Centra
            </button>
            <button type="button" className="study-ai-boost-btn" onClick={handleExportSvg}>
              ⬇️ Esporta SVG
            </button>
          </div>
        </div>

        <div
          className="mindmap-canvas-viewport"
          onWheel={e => {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.08 : -0.08;
            setZoom(z => Math.max(0.45, Math.min(2.1, +(z + delta).toFixed(2))));
          }}
          onMouseDown={e => {
            if ((e.target as HTMLElement).closest('g.mm-node-group')) return;
            dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
          }}
          onMouseMove={e => {
            if (!dragRef.current) return;
            setPan({
              x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
              y: dragRef.current.origY + (e.clientY - dragRef.current.startY)
            });
          }}
          onMouseUp={() => {
            dragRef.current = null;
          }}
          onMouseLeave={() => {
            dragRef.current = null;
          }}
        >
          <svg
            ref={svgRef}
            className="mindmap-svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transformOrigin: 'center center'
            }}
          >
            <defs>
              <filter id="mmGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000000" floodOpacity="0.45" />
              </filter>
            </defs>

            {/* Curved Bézier Connectors */}
            {layout.nodes
              .filter(n => n.parentX !== undefined && n.parentY !== undefined)
              .map(n => {
                const px = n.parentX!;
                const py = n.parentY!;
                const midX = (px + n.x) / 2;
                return (
                  <path
                    key={`edge_${n.node.id}`}
                    d={`M ${px} ${py} C ${midX} ${py}, ${midX} ${n.y}, ${n.x} ${n.y}`}
                    fill="none"
                    stroke={n.color}
                    strokeOpacity={n.node.level === 1 ? 0.78 : 0.45}
                    strokeWidth={n.node.level === 1 ? 2.6 : 1.7}
                    strokeLinecap="round"
                  />
                );
              })}

            {/* Nodes */}
            {layout.nodes.map(n => {
              const isRoot = n.node.kind === 'root';
              const isHeading = n.node.kind === 'heading';
              const boxW = isRoot ? 210 : isHeading ? 195 : 190;
              const boxH = isRoot ? 52 : isHeading ? 40 : 36;
              const isSelected = selectedNode?.id === n.node.id;
              const isCollapsed = collapsedIds.has(n.node.id);
              const label =
                n.node.label.length > 26 ? `${n.node.label.slice(0, 25)}…` : n.node.label;

              return (
                <g
                  key={n.node.id}
                  className="mm-node-group"
                  transform={`translate(${n.x - boxW / 2}, ${n.y - boxH / 2})`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedNode(n.node)}
                  onDoubleClick={() => {
                    if (n.node.children.length > 0 && !isRoot) toggleCollapse(n.node.id);
                  }}
                >
                  <rect
                    width={boxW}
                    height={boxH}
                    rx={isRoot ? 14 : 10}
                    fill={
                      isRoot
                        ? '#4f46e5'
                        : isHeading
                          ? 'rgba(20, 24, 38, 0.96)'
                          : 'rgba(15, 20, 32, 0.9)'
                    }
                    stroke={isSelected ? '#ffffff' : n.color}
                    strokeWidth={isSelected ? 2.5 : isRoot ? 2 : 1.5}
                    filter="url(#mmGlow)"
                  />
                  <text
                    x={boxW / 2}
                    y={boxH / 2 + 4}
                    textAnchor="middle"
                    fill="#f8fafc"
                    fontSize={isRoot ? 13 : isHeading ? 11.5 : 10.5}
                    fontWeight={isRoot ? 800 : isHeading ? 700 : 500}
                    fontFamily="Plus Jakarta Sans, sans-serif"
                  >
                    {label}
                  </text>
                  {n.node.children.length > 0 && !isRoot && (
                    <g
                      transform={`translate(${n.side === 'right' ? boxW - 2 : 2}, ${boxH / 2})`}
                      onClick={e => {
                        e.stopPropagation();
                        toggleCollapse(n.node.id);
                      }}
                    >
                      <circle r="9" fill={n.color} stroke="#0b0e14" strokeWidth="1.5" />
                      <text
                        textAnchor="middle"
                        y="3.5"
                        fill="#fff"
                        fontSize="10"
                        fontWeight="800"
                      >
                        {isCollapsed ? `+${n.node.children.length}` : '−'}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Selected Node Detail Footer */}
        <div className="mindmap-detail-bar">
          {selectedNode ? (
            <>
              <span className="flashcard-tag">{selectedNode.kind.toUpperCase()}</span>
              <strong>{selectedNode.label}:</strong>
              <span className="mindmap-detail-text">
                {selectedNode.detail || 'Trascina lo sfondo per spostarti, rotella per zoomare, doppio clic su un ramo per comprimerlo.'}
              </span>
            </>
          ) : (
            <span className="mindmap-detail-text">
              💡 Clicca un nodo per leggere il testo completo • Trascina per esplorare • Usa la rotella del mouse per zoomare
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
