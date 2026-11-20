import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { PageItem, SubjectItem } from '../types';
import { extractMindMapTreeFromHtml, stripHtmlTags } from '../utils/studyTools';
import { callGeminiWithRotation, STUDY_GENERATION_MODEL } from '../services/geminiService';
import {
  MINDMAP_MIN_ZOOM,
  MINDMAP_MAX_ZOOM,
  MINDMAP_COLOR_SWATCHES,
  MINDMAP_SIZE_PRESETS,
  MindMapSizePreset,
  EditableMindMapGraph,
  EditableMindMapNode,
  MindMapHistorySession,
  clampMindMapZoom,
  detectNodeSizePreset,
  treeToEditableGraph,
  parseAiMindMapJson,
  addNodeToGraph,
  updateNodeInGraph,
  deleteNodeFromGraph,
  addEdgeToGraph,
  updateEdgeInGraph,
  deleteEdgeFromGraph,
  computeGraphBounds,
  autoRelayoutEditableGraph
} from '../utils/mindMapGraph';

const MINDMAP_HISTORY_STORAGE_KEY = 'ws_mindmap_history_v1';
const MAX_MINDMAP_HISTORY = 30;

interface MindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectName: string;
  activePage: PageItem | null;
  allSubjectPages: PageItem[];
  subjects?: SubjectItem[];
  pagesBySubject?: Record<string, PageItem[]>;
  isSharedMode?: boolean;
  apiKeys?: string[];
  selectedKeyIndex?: number;
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

function loadSavedMindMaps(): MindMapHistorySession[] {
  try {
    const raw = localStorage.getItem(MINDMAP_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMindMaps(items: MindMapHistorySession[]) {
  try {
    localStorage.setItem(
      MINDMAP_HISTORY_STORAGE_KEY,
      JSON.stringify(items.slice(0, MAX_MINDMAP_HISTORY))
    );
  } catch {
    // ignore quota errors
  }
}

function formatMapTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay =
      d.getFullYear() === today.getFullYear() &&
      d.getMonth() === today.getMonth() &&
      d.getDate() === today.getDate();
    const hhmm = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `Oggi ${hhmm}`;
    return `${d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })} ${hhmm}`;
  } catch {
    return '';
  }
}

function buildMapTitle(pages: PageItem[]): string {
  if (pages.length === 0) return 'Mappa Libera';
  if (pages.length === 1) return pages[0].name;
  if (pages.length === 2) return `${pages[0].name} + ${pages[1].name}`;
  return `${pages[0].name} + ${pages.length - 1} schede`;
}

function wrapSvgLabel(text: string, boxWidth: number, fontSize: number): string[] {
  const clean = (text || '').trim();
  if (!clean) return [''];
  const maxCharsPerLine = Math.max(10, Math.floor((boxWidth - 22) / (fontSize * 0.58)));
  if (clean.length <= maxCharsPerLine) return [clean];

  const words = clean.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (word.length > maxCharsPerLine) {
        current = `${word.slice(0, maxCharsPerLine - 1)}…`;
      } else {
        current = word;
      }
      if (lines.length === 2) break;
    }
  }
  if (current && lines.length < 3) {
    lines.push(current);
  }
  if (lines.length === 3) {
    const last = lines[2];
    if (last.length > maxCharsPerLine) {
      lines[2] = `${last.slice(0, maxCharsPerLine - 1)}…`;
    }
  }
  return lines;
}

export const MindMapModal: React.FC<MindMapModalProps> = ({
  isOpen,
  onClose,
  subjectName,
  allSubjectPages,
  subjects = [],
  pagesBySubject,
  isSharedMode = false,
  apiKeys = [],
  selectedKeyIndex = 0,
  onNotify
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pickerSubject, setPickerSubject] = useState<string>(subjectName);
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);
  const [history, setHistory] = useState<MindMapHistorySession[]>(() => loadSavedMindMaps());
  const [activeMapId, setActiveMapId] = useState<string | null>(null);

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generatingLabel, setGeneratingLabel] = useState<string>('');

  // Interactive Edit Mode state
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [isConnectMode, setIsConnectMode] = useState<boolean>(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);
  const [connectCursor, setConnectCursor] = useState<{ x: number; y: number } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const panDragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const nodeDragRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    origNodeX: number;
    origNodeY: number;
    moved: boolean;
  } | null>(null);
  const nodeResizeRef = useRef<{
    nodeId: string;
    startClientX: number;
    startClientY: number;
    origWidth: number;
    origHeight: number;
  } | null>(null);

  // Sync subject picker & clean open/close resets (ZERO auto-selection & ZERO auto-generation)
  useEffect(() => {
    if (isOpen) {
      setPickerSubject(subjectName);
      setSelectedPageIds([]);
    } else {
      setIsFullscreen(false);
      setIsConnectMode(false);
      setConnectSourceId(null);
      setConnectCursor(null);
    }
  }, [isOpen, subjectName]);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPageIds([]);
  }, [isOpen, pickerSubject]);

  useEffect(() => {
    saveMindMaps(history);
  }, [history]);

  const availablePages = useMemo<PageItem[]>(() => {
    if (isSharedMode || !pagesBySubject) return allSubjectPages;
    return pagesBySubject[pickerSubject] || allSubjectPages;
  }, [isSharedMode, pagesBySubject, pickerSubject, allSubjectPages]);

  const activeSession = useMemo(() => {
    if (!activeMapId) return null;
    return history.find(h => h.id === activeMapId) || null;
  }, [history, activeMapId]);

  const activeGraph: EditableMindMapGraph | null = activeSession?.graph || null;

  const selectedNode: EditableMindMapNode | null = useMemo(() => {
    if (!activeGraph || !selectedNodeId) return null;
    return activeGraph.nodes.find(n => n.id === selectedNodeId) || null;
  }, [activeGraph, selectedNodeId]);

  const selectedEdge = useMemo(() => {
    if (!activeGraph || !selectedEdgeId) return null;
    return activeGraph.edges.find(e => e.id === selectedEdgeId) || null;
  }, [activeGraph, selectedEdgeId]);

  const graphBounds = useMemo(
    () => (activeGraph ? computeGraphBounds(activeGraph) : { minX: 0, minY: 0, width: 1280, height: 680 }),
    [activeGraph]
  );

  // Convert viewport client coordinates to SVG coordinate space cleanly at ANY zoom (25% – 500%)
  const clientToSvgPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: clientX, y: clientY };
    const ctm = svg.getScreenCTM();
    if (ctm) {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      const transformed = pt.matrixTransform(ctm.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    const rect = svg.getBoundingClientRect();
    const scaleX = graphBounds.width / Math.max(1, rect.width);
    const scaleY = graphBounds.height / Math.max(1, rect.height);
    return {
      x: graphBounds.minX + (clientX - rect.left) * scaleX,
      y: graphBounds.minY + (clientY - rect.top) * scaleY
    };
  }, [graphBounds]);

  const clientDeltaToSvgDelta = useCallback((dx: number, dy: number): { dx: number; dy: number } => {
    const svg = svgRef.current;
    if (!svg) return { dx, dy };
    const ctm = svg.getScreenCTM();
    if (ctm && ctm.a !== 0 && ctm.d !== 0) {
      return { dx: dx / ctm.a, dy: dy / ctm.d };
    }
    const rect = svg.getBoundingClientRect();
    return {
      dx: (dx * graphBounds.width) / Math.max(1, rect.width),
      dy: (dy * graphBounds.height) / Math.max(1, rect.height)
    };
  }, [graphBounds]);

  const mutateActiveGraph = useCallback(
    (updater: (g: EditableMindMapGraph) => EditableMindMapGraph) => {
      if (!activeMapId) return;
      setHistory(prev =>
        prev.map(sess =>
          sess.id === activeMapId
            ? { ...sess, graph: updater(sess.graph), updatedAt: new Date().toISOString() }
            : sess
        )
      );
    },
    [activeMapId]
  );

  // Escape keyboard behavior: cancel connect mode -> exit fullscreen -> close modal
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isConnectMode) {
          setIsConnectMode(false);
          setConnectSourceId(null);
          setConnectCursor(null);
        } else if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && isEditMode) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (selectedEdgeId) {
          e.preventDefault();
          mutateActiveGraph(g => deleteEdgeFromGraph(g, selectedEdgeId));
          setSelectedEdgeId(null);
        } else if (selectedNodeId) {
          e.preventDefault();
          mutateActiveGraph(g => deleteNodeFromGraph(g, selectedNodeId));
          setSelectedNodeId(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isConnectMode, isFullscreen, isEditMode, selectedEdgeId, selectedNodeId, mutateActiveGraph, onClose]);

  const togglePageCheckbox = (pageId: string) => {
    setSelectedPageIds(prev =>
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  const handleGenerateMap = useCallback(
    async (engine: 'ai' | 'local') => {
      const targetPages = availablePages.filter(p => selectedPageIds.includes(p.id));
      if (targetPages.length === 0) {
        onNotify('Spunta almeno una scheda a sinistra prima di generare la mappa.', 'error');
        return;
      }

      const combinedHtml = targetPages
        .map(p => `<h1>${p.name}</h1>\n${p.content || ''}`)
        .join('\n<hr />\n');
      const plainText = stripHtmlTags(combinedHtml).trim();
      const mapTitle = buildMapTitle(targetPages);
      const subjLabel = pickerSubject || subjectName;

      if (plainText.length < 4) {
        onNotify(
          `Le schede selezionate (${mapTitle}) sono vuote: scrivi prima qualche appunto o scegli un'altra scheda.`,
          'error'
        );
        return;
      }

      setIsGenerating(true);
      setGeneratingLabel(mapTitle);

      let tree = null;
      let modelLabel = 'Estrazione Locale';

      if (engine === 'ai') {
        const validKeys = apiKeys.filter(k => k && k.trim().length > 5);
        if (validKeys.length > 0) {
          try {
            const orderedKeys = [
              ...validKeys.slice(selectedKeyIndex % validKeys.length),
              ...validKeys.slice(0, selectedKeyIndex % validKeys.length)
            ];

            const prompt = `Sei un docente ITS di "${subjLabel}". Crea una mappa concettuale gerarchica ricca, chiara e ben organizzata in italiano basata ESCLUSIVAMENTE sugli appunti delle schede seguenti.
Regole:
- 1 nodo "root" centrale con titolo sintetico.
- Da 3 a 6 rami principali ("heading") con i macro-argomenti delle schede selezionate.
- Per ogni ramo principale, da 2 a 5 sotto-nodi ("concept", "code" o "formula") con etichetta concisa (max 40 caratteri) e spiegazione chiara in "detail".
Restituisci SOLO un JSON valido (nessun testo extra, nessun markdown):
{"root":{"label":"Titolo Centrale","detail":"Sintesi generale","children":[{"label":"Macro Argomento","detail":"Spiegazione breve","kind":"heading","children":[{"label":"Concetto Chiave","detail":"Dettaglio completo del concetto","kind":"concept"}]}]}}

APPUNTI DELLE SCHEDE (${targetPages.map(p => p.name).join(', ')}):
${plainText.slice(0, 9000)}`;

            const rawText = await callGeminiWithRotation(
              orderedKeys,
              STUDY_GENERATION_MODEL,
              [{ role: 'user', parts: [{ text: prompt }] }]
            );
            const parsedTree = parseAiMindMapJson(rawText || '', mapTitle);
            if (parsedTree) {
              tree = parsedTree;
              modelLabel = 'Gemini 3.6 Flash';
            }
          } catch {
            modelLabel = 'Estrazione Locale (fallback)';
          }
        } else {
          modelLabel = 'Estrazione Locale (nessuna API key)';
        }
      }

      if (!tree) {
        tree = extractMindMapTreeFromHtml(combinedHtml, mapTitle);
      }

      const graph = treeToEditableGraph(tree);
      const nowIso = new Date().toISOString();
      const newSession: MindMapHistorySession = {
        id: `mm_sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        subjectName: subjLabel,
        title: mapTitle,
        pageIds: targetPages.map(p => p.id),
        pageNames: targetPages.map(p => p.name),
        createdAt: nowIso,
        updatedAt: nowIso,
        modelLabel,
        graph
      };

      setHistory(prev => [newSession, ...prev].slice(0, MAX_MINDMAP_HISTORY));
      setActiveMapId(newSession.id);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setSelectedNodeId(graph.nodes[0]?.id || null);
      setSelectedEdgeId(null);
      setIsConnectMode(false);
      setConnectSourceId(null);
      setIsGenerating(false);
      setGeneratingLabel('');

      onNotify(
        `🗺️ Mappa generata con ${graph.nodes.length} nodi (${modelLabel}) e salvata nello storico!`
      );
    },
    [availablePages, selectedPageIds, pickerSubject, subjectName, apiKeys, selectedKeyIndex, onNotify]
  );

  const handleCreateBlankMap = () => {
    const nowIso = new Date().toISOString();
    const subjLabel = pickerSubject || subjectName;
    const rootId = `mm_root_${Date.now().toString(36)}`;
    const childA = `mm_c1_${Date.now().toString(36)}`;
    const childB = `mm_c2_${Date.now().toString(36)}`;
    const blankGraph: EditableMindMapGraph = {
      nodes: [
        {
          id: rootId,
          label: subjLabel || 'Tema Principale',
          detail: 'Doppio clic o usa la barra sotto per modificare il titolo.',
          kind: 'root',
          x: 640,
          y: 320,
          width: 244,
          height: 58,
          fontSize: 14,
          color: '#6366f1'
        },
        {
          id: childA,
          label: 'Argomento 1',
          detail: 'Trascina questa box dove preferisci in modalità Modifica.',
          kind: 'heading',
          x: 940,
          y: 250,
          width: 204,
          height: 46,
          fontSize: 12,
          color: '#38bdf8'
        },
        {
          id: childB,
          label: 'Argomento 2',
          detail: 'Aggiungi altri nodi o collega box con lo strumento Collega.',
          kind: 'heading',
          x: 340,
          y: 380,
          width: 204,
          height: 46,
          fontSize: 12,
          color: '#10b981'
        }
      ],
      edges: [
        { id: `edge_${rootId}_${childA}`, fromId: rootId, toId: childA, color: '#38bdf8', style: 'solid' },
        { id: `edge_${rootId}_${childB}`, fromId: rootId, toId: childB, color: '#10b981', style: 'solid' }
      ]
    };

    const newSession: MindMapHistorySession = {
      id: `mm_blank_${Date.now()}`,
      subjectName: subjLabel,
      title: `Mappa Libera · ${subjLabel}`,
      pageIds: [],
      pageNames: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      modelLabel: 'Manuale',
      graph: blankGraph
    };

    setHistory(prev => [newSession, ...prev].slice(0, MAX_MINDMAP_HISTORY));
    setActiveMapId(newSession.id);
    setIsEditMode(true);
    setSelectedNodeId(rootId);
    setSelectedEdgeId(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    onNotify('🗺️ Creata nuova mappa libera in modalità Modifica!');
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    if (activeMapId === id) {
      setActiveMapId(null);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  const handleZoomIn = () => {
    setZoom(z => clampMindMapZoom(z + (z >= 1.5 ? 0.35 : 0.2)));
  };

  const handleZoomOut = () => {
    setZoom(z => clampMindMapZoom(z - (z > 1.5 ? 0.35 : 0.15)));
  };

  const handleAddNode = () => {
    if (!activeGraph) return;
    const res = addNodeToGraph(activeGraph, selectedNodeId);
    mutateActiveGraph(() => res.graph);
    setSelectedNodeId(res.newNodeId);
    setSelectedEdgeId(null);
    setIsEditMode(true);
    setTimeout(() => labelInputRef.current?.focus(), 40);
  };

  const handleToggleConnectMode = (startFromNodeId?: string) => {
    if (startFromNodeId) {
      setIsEditMode(true);
      setIsConnectMode(true);
      setConnectSourceId(startFromNodeId);
      setSelectedEdgeId(null);
      return;
    }
    setIsConnectMode(prev => {
      const next = !prev;
      setConnectSourceId(next ? selectedNodeId : null);
      setConnectCursor(null);
      return next;
    });
  };

  const handleNodePointerClick = (node: EditableMindMapNode) => {
    if (isEditMode && isConnectMode) {
      if (!connectSourceId) {
        setConnectSourceId(node.id);
        setSelectedNodeId(node.id);
      } else if (connectSourceId === node.id) {
        setConnectSourceId(null);
        setConnectCursor(null);
      } else {
        let created = false;
        mutateActiveGraph(g => {
          const res = addEdgeToGraph(g, connectSourceId, node.id, 'solid');
          created = !!res.createdEdgeId;
          return res.graph;
        });
        if (created) {
          onNotify('🔗 Nuovo collegamento creato!');
        } else {
          onNotify('Collegamento già presente tra questi due nodi.', 'info');
        }
        setConnectSourceId(null);
        setConnectCursor(null);
        setIsConnectMode(false);
        setSelectedNodeId(node.id);
      }
      return;
    }

    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  };

  const handleExportSvg = () => {
    if (!svgRef.current || !activeSession) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Mappa_${activeSession.title.replace(/[^a-z0-9]/gi, '_')}.svg`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('🗺️ Mappa concettuale esportata in SVG vettoriale!');
  };

  if (!isOpen) return null;

  const nodeMap = new Map<string, EditableMindMapNode>();
  (activeGraph?.nodes || []).forEach(n => nodeMap.set(n.id, n));
  const connectSourceNode = connectSourceId ? nodeMap.get(connectSourceId) || null : null;

  return (
    <div
      className={`modal-overlay ${isFullscreen ? 'is-study-fullscreen' : ''}`}
      onClick={onClose}
    >
      <div
        className={`modal-box study-review-modal study-studio-modal mindmap-studio-modal ${
          isFullscreen ? 'is-fullscreen' : ''
        }`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Studio Mappa Concettuale Interattiva"
      >
        {/* TOP HEADER */}
        <div className="modal-header study-studio-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span className="modal-title">🗺️ Mappa Concettuale Interattiva</span>
            {activeGraph && (
              <span className="mindmap-header-stats">
                {activeGraph.nodes.length} nodi · {activeGraph.edges.length} collegamenti
              </span>
            )}
            <span className="study-model-chip" title="Modello AI dedicato alla generazione delle mappe">
              ⚡ Gemini 3.6 Flash
            </span>
          </div>

          <div className="study-header-actions">
            <button
              type="button"
              className={`study-fullscreen-btn ${isFullscreen ? 'is-active' : ''}`}
              onClick={() => setIsFullscreen(prev => !prev)}
              title={isFullscreen ? 'Esci da schermo intero (Esc)' : 'Espandi a schermo intero'}
              aria-label={isFullscreen ? 'Esci da schermo intero' : 'Espandi a schermo intero'}
              aria-pressed={isFullscreen}
            >
              {isFullscreen ? (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="4 14 10 14 10 20" />
                  <polyline points="20 10 14 10 14 4" />
                  <line x1="14" y1="10" x2="21" y2="3" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              ) : (
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="15 3 21 3 21 9" />
                  <polyline points="9 21 3 21 3 15" />
                  <line x1="21" y1="3" x2="14" y2="10" />
                  <line x1="3" y1="21" x2="10" y2="14" />
                </svg>
              )}
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={onClose}
              aria-label="Chiudi mappa concettuale"
              title="Chiudi"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 2-COLUMN BODY: Left Page Picker + Map History | Right Interactive Canvas Studio */}
        <div className="study-studio-layout mindmap-studio-layout">
          {/* LEFT SIDEBAR */}
          <aside className="study-history-sidebar" aria-label="Selezione schede e storico mappe">
            <div className="study-sidebar-section">
              <div className="study-sidebar-heading-row">
                <span className="study-sidebar-heading">📄 Schede per la Mappa</span>
                <div className="study-sidebar-mini-actions">
                  <button
                    type="button"
                    className="study-mini-link"
                    onClick={() => setSelectedPageIds(availablePages.map(p => p.id))}
                  >
                    Tutte
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    className="study-mini-link"
                    onClick={() => setSelectedPageIds([])}
                  >
                    Nessuna
                  </button>
                </div>
              </div>

              {!isSharedMode && subjects.length > 1 && pagesBySubject && (
                <select
                  className="study-subject-select"
                  value={pickerSubject}
                  onChange={e => setPickerSubject(e.target.value)}
                  aria-label="Seleziona materia per la mappa"
                >
                  {subjects.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      📚 {sub.name} ({(pagesBySubject[sub.id] || []).length})
                    </option>
                  ))}
                </select>
              )}

              <div className="study-sidebar-tip">
                Spunta le schede con gli argomenti da includere e premi <strong>Genera Mappa AI</strong>.
              </div>

              <div className="study-page-picker-list">
                {availablePages.length === 0 ? (
                  <div className="study-sidebar-empty">Nessuna scheda in questa materia.</div>
                ) : (
                  availablePages.map(page => {
                    const checked = selectedPageIds.includes(page.id);
                    const plainLen = stripHtmlTags(page.content || '').trim().length;
                    const wordCount = plainLen
                      ? stripHtmlTags(page.content || '').trim().split(/\s+/).length
                      : 0;
                    return (
                      <div
                        key={page.id}
                        className={`study-page-picker-row ${checked ? 'is-checked' : ''}`}
                      >
                        <input
                          type="checkbox"
                          className="study-page-checkbox"
                          checked={checked}
                          onChange={() => togglePageCheckbox(page.id)}
                          aria-label={`Seleziona scheda ${page.name}`}
                        />
                        <button
                          type="button"
                          className="study-page-quick-btn"
                          disabled={isGenerating}
                          onClick={() => togglePageCheckbox(page.id)}
                          title={`Spunta o deseleziona "${page.name}"`}
                        >
                          <span className="study-page-name">{page.name}</span>
                          <span className="study-page-words">
                            {wordCount > 0 ? `${wordCount} par.` : 'vuota'}
                          </span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="mindmap-gen-actions">
                <button
                  type="button"
                  className="study-ai-boost-btn study-generate-full-btn mindmap-ai-gen-btn"
                  onClick={() => handleGenerateMap('ai')}
                  disabled={isGenerating || selectedPageIds.length === 0}
                  title="Genera una mappa concettuale strutturata usando Gemini 3.6 Flash"
                >
                  {isGenerating
                    ? `⏳ Generazione (${generatingLabel})...`
                    : selectedPageIds.length === 0
                      ? 'Seleziona schede per Generare'
                      : `✨ Genera Mappa AI (${selectedPageIds.length} ${
                          selectedPageIds.length === 1 ? 'scheda' : 'schede'
                        })`}
                </button>
                <button
                  type="button"
                  className="study-nav-btn mindmap-local-gen-btn"
                  onClick={() => handleGenerateMap('local')}
                  disabled={isGenerating || selectedPageIds.length === 0}
                  title="Estrai subito la mappa dai titoli ed elenchi delle schede selezionate (offline)"
                >
                  ⚡ Estrazione Rapida Locale
                </button>
              </div>
            </div>

            {/* Persistent Map History */}
            <div className="study-sidebar-section study-history-section">
              <div className="study-sidebar-heading-row">
                <span className="study-sidebar-heading">🕘 Storico Mappe ({history.length})</span>
                <button
                  type="button"
                  className="study-mini-link"
                  onClick={handleCreateBlankMap}
                  title="Crea una mappa vuota modificabile da zero"
                >
                  + Vuota
                </button>
              </div>

              <div className="study-history-list">
                {history.length === 0 ? (
                  <div className="study-sidebar-empty">
                    Nessuna mappa salvata ancora. Spunta una o più schede qui sopra e premi Genera!
                  </div>
                ) : (
                  history.map(sess => {
                    const isSelected = activeSession?.id === sess.id;
                    return (
                      <div
                        key={sess.id}
                        role="button"
                        tabIndex={0}
                        className={`study-history-item ${isSelected ? 'active' : ''}`}
                        onClick={() => {
                          setActiveMapId(sess.id);
                          setSelectedNodeId(null);
                          setSelectedEdgeId(null);
                          setIsConnectMode(false);
                          setConnectSourceId(null);
                          setZoom(1);
                          setPan({ x: 0, y: 0 });
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setActiveMapId(sess.id);
                            setSelectedNodeId(null);
                            setSelectedEdgeId(null);
                          }
                        }}
                      >
                        <div className="study-history-item-top">
                          <span className="study-history-title" title={sess.pageNames.join(', ') || sess.title}>
                            🗺️ {sess.title}
                          </span>
                          <button
                            type="button"
                            className="study-history-del-btn"
                            onClick={e => handleDeleteHistoryItem(sess.id, e)}
                            title="Elimina mappa dallo storico"
                            aria-label={`Elimina mappa ${sess.title}`}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="study-history-meta">
                          <span>{formatMapTimestamp(sess.updatedAt || sess.createdAt)}</span>
                          <span className="study-history-dot">•</span>
                          <span>{sess.graph.nodes.length} nodi</span>
                        </div>
                        <div className="study-history-submeta">
                          <span>{sess.subjectName}</span>
                          <span className="study-history-model-tag">{sess.modelLabel}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>

          {/* RIGHT INTERACTIVE CANVAS STAGE */}
          <main className="mindmap-main-stage">
            {isGenerating ? (
              <div className="study-generating-state">
                <div className="study-spinner-ring" />
                <h4>Generazione Mappa con Gemini 3.6 Flash...</h4>
                <p>
                  Sto organizzando i concetti e i collegamenti da: <strong>{generatingLabel}</strong>
                </p>
              </div>
            ) : !activeSession || !activeGraph ? (
              <div className="study-empty-state study-idle-guide">
                <div className="study-idle-icon">🗺️</div>
                <h4>Crea la tua Mappa Concettuale Interattiva</h4>
                <p>
                  1. Spunta una o più schede di appunti nella barra a sinistra.
                  <br />
                  2. Premi <strong>✨ Genera Mappa AI</strong> (Gemini 3.6 Flash) oppure{' '}
                  <strong>⚡ Estrazione Rapida</strong>.
                  <br />
                  3. Usa il pulsante <strong>Modifica</strong> (matita) per spostare le box, cambiare testi, colori, grandezza e creare collegamenti.
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button type="button" className="study-nav-btn" onClick={handleCreateBlankMap}>
                    + Nuova Mappa da Zero
                  </button>
                </div>
                {history.length > 0 && (
                  <span className="study-idle-history-hint">
                    Oppure clicca una delle {history.length} mappe salvate nello <strong>Storico</strong> a sinistra.
                  </span>
                )}
              </div>
            ) : (
              <>
                {/* CANVAS TOOLBAR */}
                <div className="mindmap-toolbar mindmap-studio-toolbar">
                  <div className="mindmap-toolbar-left">
                    {/* Pencil Edit Mode Toggle */}
                    <button
                      type="button"
                      className={`mindmap-edit-toggle-btn ${isEditMode ? 'is-active' : ''}`}
                      onClick={() => {
                        setIsEditMode(prev => {
                          const next = !prev;
                          if (!next) {
                            setIsConnectMode(false);
                            setConnectSourceId(null);
                            setConnectCursor(null);
                            setSelectedEdgeId(null);
                          }
                          return next;
                        });
                      }}
                      aria-pressed={isEditMode}
                      title={
                        isEditMode
                          ? 'Esci dalla modalità modifica'
                          : 'Attiva modalità modifica per spostare box, modificare testi, colori, grandezza e collegamenti'
                      }
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                      <span>{isEditMode ? 'Modifica Attiva' : 'Modifica'}</span>
                    </button>

                    {isEditMode && (
                      <div className="mindmap-edit-quick-tools">
                        <button
                          type="button"
                          className="study-nav-btn"
                          onClick={handleAddNode}
                          title="Aggiungi una nuova box collegata al nodo selezionato"
                        >
                          + Nodo
                        </button>
                        <button
                          type="button"
                          className={`study-nav-btn ${isConnectMode ? 'is-connect-active' : ''}`}
                          onClick={() => handleToggleConnectMode()}
                          aria-pressed={isConnectMode}
                          title="Crea un nuovo collegamento cliccando due box"
                        >
                          🔗 {isConnectMode ? 'Annulla Collega' : 'Collega'}
                        </button>
                        <button
                          type="button"
                          className="study-nav-btn"
                          onClick={() => {
                            mutateActiveGraph(g => autoRelayoutEditableGraph(g));
                            setZoom(1);
                            setPan({ x: 0, y: 0 });
                            onNotify('✨ Layout della mappa riordinato!');
                          }}
                          title="Riordina automaticamente le posizioni delle box"
                        >
                          ✨ Riordina
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Zoom (25% – 500%) & Export */}
                  <div className="mindmap-toolbar-right">
                    <button
                      type="button"
                      className="study-nav-btn"
                      onClick={handleZoomOut}
                      disabled={zoom <= MINDMAP_MIN_ZOOM}
                      aria-label="Riduci zoom"
                      title="Riduci zoom (min 25%)"
                    >
                      −
                    </button>
                    <span
                      className="mindmap-zoom-label"
                      title={`Zoom attuale: ${Math.round(zoom * 100)}% (max 500%)`}
                    >
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      className="study-nav-btn"
                      onClick={handleZoomIn}
                      disabled={zoom >= MINDMAP_MAX_ZOOM}
                      aria-label="Aumenta zoom"
                      title="Aumenta zoom (fino al 500%)"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="study-nav-btn"
                      onClick={() => {
                        setZoom(1);
                        setPan({ x: 0, y: 0 });
                      }}
                      title="Ripristina zoom 100% e centra mappa"
                    >
                      ↺ Centra
                    </button>
                    <button
                      type="button"
                      className="study-ai-boost-btn"
                      onClick={handleExportSvg}
                      title="Esporta la mappa attuale in formato vettoriale SVG"
                    >
                      ⬇️ SVG
                    </button>
                  </div>
                </div>

                {/* Live Connect Mode Guidance Strip */}
                {isEditMode && isConnectMode && (
                  <div className="mindmap-connect-banner">
                    <span>
                      🔗{' '}
                      {connectSourceNode
                        ? `Origine: "${connectSourceNode.label}" — ora clicca la box di destinazione per creare il collegamento.`
                        : 'Modalità Collega attiva: clicca la prima box di partenza.'}
                    </span>
                    <button
                      type="button"
                      className="study-mini-link"
                      onClick={() => {
                        setIsConnectMode(false);
                        setConnectSourceId(null);
                        setConnectCursor(null);
                      }}
                    >
                      Annulla (Esc)
                    </button>
                  </div>
                )}

                {/* INTERACTIVE SVG VIEWPORT */}
                <div
                  className={`mindmap-canvas-viewport ${isEditMode ? 'is-edit-mode' : ''} ${
                    isConnectMode ? 'is-connect-mode' : ''
                  }`}
                  onWheel={e => {
                    e.preventDefault();
                    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
                    setZoom(z => clampMindMapZoom(z * factor));
                  }}
                  onMouseDown={e => {
                    if ((e.target as HTMLElement).closest('g.mm-node-group, g.mm-edge-group')) return;
                    if (!isConnectMode) {
                      setSelectedNodeId(null);
                      setSelectedEdgeId(null);
                    }
                    panDragRef.current = {
                      startX: e.clientX,
                      startY: e.clientY,
                      origX: pan.x,
                      origY: pan.y
                    };
                  }}
                  onMouseMove={e => {
                    if (isEditMode && isConnectMode && connectSourceNode) {
                      setConnectCursor(clientToSvgPoint(e.clientX, e.clientY));
                    }

                    if (nodeResizeRef.current) {
                      const r = nodeResizeRef.current;
                      const { dx, dy } = clientDeltaToSvgDelta(
                        e.clientX - r.startClientX,
                        e.clientY - r.startClientY
                      );
                      mutateActiveGraph(g =>
                        updateNodeInGraph(g, r.nodeId, {
                          width: r.origWidth + dx * 2,
                          height: r.origHeight + dy * 2
                        })
                      );
                      return;
                    }

                    if (nodeDragRef.current) {
                      const d = nodeDragRef.current;
                      const rawDx = e.clientX - d.startClientX;
                      const rawDy = e.clientY - d.startClientY;
                      if (!d.moved && Math.hypot(rawDx, rawDy) > 3) {
                        d.moved = true;
                      }
                      if (d.moved) {
                        const { dx, dy } = clientDeltaToSvgDelta(rawDx, rawDy);
                        mutateActiveGraph(g =>
                          updateNodeInGraph(g, d.nodeId, {
                            x: Math.round(d.origNodeX + dx),
                            y: Math.round(d.origNodeY + dy)
                          })
                        );
                      }
                      return;
                    }

                    if (panDragRef.current) {
                      setPan({
                        x: panDragRef.current.origX + (e.clientX - panDragRef.current.startX),
                        y: panDragRef.current.origY + (e.clientY - panDragRef.current.startY)
                      });
                    }
                  }}
                  onMouseUp={() => {
                    panDragRef.current = null;
                    nodeDragRef.current = null;
                    nodeResizeRef.current = null;
                  }}
                  onMouseLeave={() => {
                    panDragRef.current = null;
                    nodeDragRef.current = null;
                    nodeResizeRef.current = null;
                  }}
                >
                  <svg
                    ref={svgRef}
                    className="mindmap-svg"
                    viewBox={`${graphBounds.minX} ${graphBounds.minY} ${graphBounds.width} ${graphBounds.height}`}
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center'
                    }}
                  >
                    <defs>
                      <filter id="mmGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow
                          dx="0"
                          dy="4"
                          stdDeviation="6"
                          floodColor="#000000"
                          floodOpacity="0.45"
                        />
                      </filter>
                    </defs>

                    {/* Curved Bézier Edges */}
                    {activeGraph.edges.map(edge => {
                      const from = nodeMap.get(edge.fromId);
                      const to = nodeMap.get(edge.toId);
                      if (!from || !to) return null;
                      const midX = (from.x + to.x) / 2;
                      const d = `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
                      const isEdgeSel = isEditMode && selectedEdgeId === edge.id;
                      const strokeColor = isEdgeSel ? '#ffffff' : edge.color || to.color || '#6366f1';

                      return (
                        <g
                          key={edge.id}
                          className="mm-edge-group"
                          style={{ cursor: isEditMode ? 'pointer' : 'default' }}
                          onClick={e => {
                            if (!isEditMode) return;
                            e.stopPropagation();
                            setSelectedEdgeId(edge.id);
                            setSelectedNodeId(null);
                          }}
                        >
                          {/* Generous invisible hit path for easy edge clicking in Edit Mode */}
                          {isEditMode && (
                            <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                          )}
                          <path
                            d={d}
                            fill="none"
                            stroke={strokeColor}
                            strokeOpacity={isEdgeSel ? 1 : 0.72}
                            strokeWidth={isEdgeSel ? 3.5 : from.kind === 'root' ? 2.6 : 1.9}
                            strokeDasharray={edge.style === 'dashed' ? '7 5' : undefined}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}

                    {/* Live Preview Line while Connecting Two Boxes */}
                    {isEditMode && isConnectMode && connectSourceNode && connectCursor && (
                      <path
                        d={`M ${connectSourceNode.x} ${connectSourceNode.y} C ${(connectSourceNode.x + connectCursor.x) / 2} ${connectSourceNode.y}, ${(connectSourceNode.x + connectCursor.x) / 2} ${connectCursor.y}, ${connectCursor.x} ${connectCursor.y}`}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={2.4}
                        strokeDasharray="6 5"
                        pointerEvents="none"
                      />
                    )}

                    {/* Nodes */}
                    {activeGraph.nodes.map(node => {
                      const isRoot = node.kind === 'root';
                      const isSelected = selectedNodeId === node.id;
                      const isConnectSource = connectSourceId === node.id;
                      const lines = wrapSvgLabel(node.label, node.width, node.fontSize);
                      const lineHeight = node.fontSize * 1.28;
                      const firstLineY =
                        node.height / 2 - ((lines.length - 1) * lineHeight) / 2 + node.fontSize * 0.36;

                      return (
                        <g
                          key={node.id}
                          data-node-id={node.id}
                          className={`mm-node-group ${isSelected ? 'is-selected' : ''} ${
                            isConnectSource ? 'is-connect-source' : ''
                          }`}
                          transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
                          style={{
                            cursor: isEditMode
                              ? isConnectMode
                                ? 'crosshair'
                                : 'move'
                              : 'pointer'
                          }}
                          onMouseDown={e => {
                            e.stopPropagation();
                            if (isEditMode && !isConnectMode) {
                              setSelectedNodeId(node.id);
                              setSelectedEdgeId(null);
                              nodeDragRef.current = {
                                nodeId: node.id,
                                startClientX: e.clientX,
                                startClientY: e.clientY,
                                origNodeX: node.x,
                                origNodeY: node.y,
                                moved: false
                              };
                            }
                          }}
                          onClick={e => {
                            e.stopPropagation();
                            if (nodeDragRef.current?.moved) return;
                            handleNodePointerClick(node);
                          }}
                          onDoubleClick={e => {
                            e.stopPropagation();
                            if (!isEditMode) {
                              setIsEditMode(true);
                            }
                            setSelectedNodeId(node.id);
                            setSelectedEdgeId(null);
                            setTimeout(() => labelInputRef.current?.focus(), 40);
                          }}
                        >
                          <rect
                            width={node.width}
                            height={node.height}
                            rx={isRoot ? 15 : 11}
                            fill={
                              isRoot
                                ? node.color
                                : node.kind === 'heading'
                                  ? 'rgba(18, 23, 38, 0.96)'
                                  : 'rgba(13, 18, 30, 0.92)'
                            }
                            stroke={
                              isConnectSource
                                ? '#38bdf8'
                                : isSelected
                                  ? '#ffffff'
                                  : node.color
                            }
                            strokeWidth={isSelected || isConnectSource ? 2.8 : isRoot ? 2 : 1.7}
                            filter="url(#mmGlow)"
                          />

                          {/* Subtle top tint bar inside non-root boxes so custom colors shine clearly */}
                          {!isRoot && (
                            <rect
                              x={1.5}
                              y={1.5}
                              width={Math.max(0, node.width - 3)}
                              height={4}
                              rx={2}
                              fill={node.color}
                              opacity={0.85}
                            />
                          )}

                          <text
                            x={node.width / 2}
                            textAnchor="middle"
                            fill="#f8fafc"
                            fontSize={node.fontSize}
                            fontWeight={isRoot ? 800 : node.kind === 'heading' ? 700 : 500}
                            fontFamily="Plus Jakarta Sans, sans-serif"
                            style={{ userSelect: 'none', pointerEvents: 'none' }}
                          >
                            {lines.map((ln, idx) => (
                              <tspan
                                key={idx}
                                x={node.width / 2}
                                y={firstLineY + idx * lineHeight}
                              >
                                {ln}
                              </tspan>
                            ))}
                          </text>

                          {/* Direct Corner Resize Handle when Selected in Edit Mode */}
                          {isEditMode && isSelected && !isConnectMode && (
                            <g
                              className="mm-resize-handle"
                              transform={`translate(${node.width - 10}, ${node.height - 10})`}
                              style={{ cursor: 'nwse-resize' }}
                              onMouseDown={e => {
                                e.stopPropagation();
                                nodeResizeRef.current = {
                                  nodeId: node.id,
                                  startClientX: e.clientX,
                                  startClientY: e.clientY,
                                  origWidth: node.width,
                                  origHeight: node.height
                                };
                              }}
                            >
                              <circle r="7" fill="#6366f1" stroke="#ffffff" strokeWidth="1.5" />
                              <path
                                d="M -2.5 2.5 L 2.5 -2.5 M 0 2.5 L 2.5 0"
                                stroke="#ffffff"
                                strokeWidth="1.3"
                                strokeLinecap="round"
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* BOTTOM INSPECTOR BAR (Edit Controls OR Read-Only Node Detail) */}
                {isEditMode && selectedNode ? (
                  <div className="mindmap-editor-inspector" aria-label="Strumenti modifica nodo selezionato">
                    <div className="mindmap-inspector-inputs">
                      <label className="mindmap-inspector-field">
                        <span>Titolo box</span>
                        <input
                          ref={labelInputRef}
                          type="text"
                          value={selectedNode.label}
                          onChange={e =>
                            mutateActiveGraph(g =>
                              updateNodeInGraph(g, selectedNode.id, { label: e.target.value })
                            )
                          }
                          placeholder="Titolo del concetto..."
                          aria-label="Titolo box"
                        />
                      </label>
                      <label className="mindmap-inspector-field is-wide">
                        <span>Contenuto / Dettaglio</span>
                        <input
                          type="text"
                          value={selectedNode.detail}
                          onChange={e =>
                            mutateActiveGraph(g =>
                              updateNodeInGraph(g, selectedNode.id, { detail: e.target.value })
                            )
                          }
                          placeholder="Descrizione o approfondimento..."
                          aria-label="Contenuto o dettaglio nodo"
                        />
                      </label>
                    </div>

                    <div className="mindmap-inspector-controls">
                      {/* Color Swatches */}
                      <div className="mindmap-control-group" role="group" aria-label="Colore box">
                        <span className="mindmap-ctrl-label">Colore</span>
                        <div className="mindmap-color-swatches">
                          {MINDMAP_COLOR_SWATCHES.map(sw => (
                            <button
                              key={sw.id}
                              type="button"
                              className={`mindmap-color-dot ${
                                selectedNode.color.toLowerCase() === sw.hex ? 'is-active' : ''
                              }`}
                              style={{ background: sw.hex }}
                              title={sw.label}
                              aria-label={`Colore ${sw.label}`}
                              onClick={() =>
                                mutateActiveGraph(g =>
                                  updateNodeInGraph(g, selectedNode.id, { color: sw.hex }, true)
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>

                      {/* Box Size Presets (S / M / L / XL) + Font Size */}
                      <div className="mindmap-control-group" role="group" aria-label="Grandezza box">
                        <span className="mindmap-ctrl-label">Grandezza</span>
                        <div className="mindmap-size-group">
                          {(['sm', 'md', 'lg', 'xl'] as MindMapSizePreset[]).map(presetKey => {
                            const preset = MINDMAP_SIZE_PRESETS[presetKey];
                            const isActiveSize = detectNodeSizePreset(selectedNode) === presetKey;
                            return (
                              <button
                                key={presetKey}
                                type="button"
                                className={`mindmap-size-btn ${isActiveSize ? 'is-active' : ''}`}
                                onClick={() =>
                                  mutateActiveGraph(g =>
                                    updateNodeInGraph(g, selectedNode.id, {
                                      width: preset.width,
                                      height: preset.height,
                                      fontSize: preset.fontSize
                                    })
                                  )
                                }
                                title={`Dimensione ${preset.label}`}
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            className="mindmap-size-btn"
                            onClick={() =>
                              mutateActiveGraph(g =>
                                updateNodeInGraph(g, selectedNode.id, {
                                  fontSize: Math.max(9, +(selectedNode.fontSize - 1).toFixed(1))
                                })
                              )
                            }
                            title="Riduci testo"
                            aria-label="Riduci testo box"
                          >
                            A−
                          </button>
                          <button
                            type="button"
                            className="mindmap-size-btn"
                            onClick={() =>
                              mutateActiveGraph(g =>
                                updateNodeInGraph(g, selectedNode.id, {
                                  fontSize: Math.min(24, +(selectedNode.fontSize + 1).toFixed(1))
                                })
                              )
                            }
                            title="Ingrandisci testo"
                            aria-label="Ingrandisci testo box"
                          >
                            A+
                          </button>
                        </div>
                      </div>

                      {/* Node Quick Actions */}
                      <div className="mindmap-control-group">
                        <button
                          type="button"
                          className="study-nav-btn"
                          onClick={() => handleToggleConnectMode(selectedNode.id)}
                          title="Collega questa box a un'altra box"
                        >
                          🔗 Collega da qui
                        </button>
                        <button
                          type="button"
                          className="mindmap-danger-btn"
                          onClick={() => {
                            mutateActiveGraph(g => deleteNodeFromGraph(g, selectedNode.id));
                            setSelectedNodeId(null);
                            onNotify('🗑️ Nodo rimosso dalla mappa.');
                          }}
                          title="Elimina questa box e i suoi collegamenti"
                        >
                          🗑️ Elimina
                        </button>
                      </div>
                    </div>
                  </div>
                ) : isEditMode && selectedEdge ? (
                  <div className="mindmap-editor-inspector" aria-label="Strumenti modifica collegamento">
                    <div className="mindmap-inspector-controls">
                      <span className="mindmap-ctrl-label">
                        🔗 Collegamento: <strong>{nodeMap.get(selectedEdge.fromId)?.label}</strong> →{' '}
                        <strong>{nodeMap.get(selectedEdge.toId)?.label}</strong>
                      </span>

                      <div className="mindmap-size-group">
                        <button
                          type="button"
                          className={`mindmap-size-btn ${
                            (selectedEdge.style || 'solid') === 'solid' ? 'is-active' : ''
                          }`}
                          onClick={() =>
                            mutateActiveGraph(g =>
                              updateEdgeInGraph(g, selectedEdge.id, { style: 'solid' })
                            )
                          }
                        >
                          Continua
                        </button>
                        <button
                          type="button"
                          className={`mindmap-size-btn ${
                            selectedEdge.style === 'dashed' ? 'is-active' : ''
                          }`}
                          onClick={() =>
                            mutateActiveGraph(g =>
                              updateEdgeInGraph(g, selectedEdge.id, { style: 'dashed' })
                            )
                          }
                        >
                          Tratteggiata
                        </button>
                      </div>

                      <div className="mindmap-color-swatches">
                        {MINDMAP_COLOR_SWATCHES.map(sw => (
                          <button
                            key={sw.id}
                            type="button"
                            className={`mindmap-color-dot ${
                              (selectedEdge.color || '').toLowerCase() === sw.hex ? 'is-active' : ''
                            }`}
                            style={{ background: sw.hex }}
                            title={sw.label}
                            onClick={() =>
                              mutateActiveGraph(g =>
                                updateEdgeInGraph(g, selectedEdge.id, { color: sw.hex })
                              )
                            }
                          />
                        ))}
                      </div>

                      <button
                        type="button"
                        className="mindmap-danger-btn"
                        onClick={() => {
                          mutateActiveGraph(g => deleteEdgeFromGraph(g, selectedEdge.id));
                          setSelectedEdgeId(null);
                          onNotify('🗑️ Collegamento eliminato.');
                        }}
                      >
                        🗑️ Rimuovi Collegamento
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mindmap-detail-bar">
                    {selectedNode ? (
                      <>
                        <span className="mindmap-detail-title">{selectedNode.label}:</span>
                        <span className="mindmap-detail-text">
                          {selectedNode.detail ||
                            'Attiva "Modifica" (matita) per spostare la box, cambiare testo, colore, grandezza o collegamenti.'}
                        </span>
                      </>
                    ) : (
                      <span className="mindmap-detail-text">
                        {isEditMode
                          ? '✏️ Modalità Modifica: trascina le box per spostarle, clicca una box o un collegamento per modificarli, usa il pallino in basso a destra della box per ridimensionarla.'
                          : '💡 Trascina lo sfondo per spostarti · Rotella del mouse per zoomare fino al 500% · Premi "Modifica" (matita) per personalizzare la mappa'}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
