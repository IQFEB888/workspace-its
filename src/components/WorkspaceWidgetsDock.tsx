import React, { useState, useEffect } from 'react';
import { CustomWidget, MaterialItem, WidgetSlot } from '../types';
import { getFileFromIndexedDB } from '../services/fileStorage';
import { evaluateMathExpression, compressImageFromBlob } from '../utils/editorTools';

interface WorkspaceWidgetsDockProps {
  slot: WidgetSlot;
  widgets: CustomWidget[];
  materials: MaterialItem[];
  onUpdateWidget: (updated: CustomWidget) => void;
  onRemoveWidget: (id: string) => void;
  onOpenWidgetSettings: () => void;
  onOpenFullPreview: (material: MaterialItem) => void;
  onInsertTextIntoNotes: (text: string) => void;
  showToast: (msg: string, type?: 'info' | 'error') => void;
}

function extractDriveId(url: string): string | null {
  if (!url) return null;
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m1 && m1[1]) return m1[1];
  const m2 = url.match(/\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m2 && m2[1]) return m2[1];
  const m3 = url.match(/[?&]id=([a-zA-Z0-9_-]{20,})/);
  if (m3 && m3[1]) return m3[1];
  return null;
}

function base64ToBlobUrl(base64Data: string, mimeType = 'application/pdf'): string {
  try {
    const parts = base64Data.split(';base64,');
    const contentType = parts.length > 1 ? parts[0].replace('data:', '') : mimeType;
    const raw = window.atob(parts.length > 1 ? parts[1] : parts[0]);
    const uInt8Array = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; ++i) {
      uInt8Array[i] = raw.charCodeAt(i);
    }
    const blob = new Blob([uInt8Array], { type: contentType || 'application/pdf' });
    return URL.createObjectURL(blob);
  } catch {
    return base64Data;
  }
}

export const WEB_WIDGET_PRESETS = [
  { label: 'Wikipedia IT', url: 'https://it.m.wikipedia.org/wiki/Pagina_principale' },
  { label: 'Desmos Grafici', url: 'https://www.desmos.com/calculator?lang=it' },
  { label: 'DevDocs API', url: 'https://devdocs.io' },
  { label: 'CyberChef', url: 'https://gchq.github.io/CyberChef/' }
];

export const WorkspaceWidgetsDock: React.FC<WorkspaceWidgetsDockProps> = ({
  slot,
  widgets,
  materials,
  onUpdateWidget,
  onRemoveWidget,
  onOpenWidgetSettings,
  onOpenFullPreview,
  onInsertTextIntoNotes,
  showToast
}) => {
  const slotWidgets = widgets.filter(w => w.enabled && w.slot === slot);
  const [activeWidgetId, setActiveWidgetId] = useState<string>('');

  // PDF Resolved URL state
  const [resolvedPdfUrl, setResolvedPdfUrl] = useState<string>('');
  const [loadingPdf, setLoadingPdf] = useState<boolean>(false);

  // Image Zoom state
  const [imgZoom, setImgZoom] = useState<number>(100);

  // Calculator state
  const [calcExpr, setCalcExpr] = useState<string>('');
  const [calcHistory, setCalcHistory] = useState<Array<{ expr: string; res: string }>>([]);

  // Pomodoro state
  const [pomoSeconds, setPomoSeconds] = useState<number>(25 * 60);
  const [pomoRunning, setPomoRunning] = useState<boolean>(false);
  const [pomoMode, setPomoMode] = useState<'work' | 'short' | 'deep'>('work');

  // Web URL draft
  const [webUrlInput, setWebUrlInput] = useState<string>('');

  useEffect(() => {
    if (slotWidgets.length > 0 && !slotWidgets.some(w => w.id === activeWidgetId)) {
      setActiveWidgetId(slotWidgets[0].id);
    }
  }, [slotWidgets, activeWidgetId]);

  const activeWidget = slotWidgets.find(w => w.id === activeWidgetId) || slotWidgets[0];

  // Sync webUrlInput when activeWidget changes
  useEffect(() => {
    if (activeWidget?.type === 'web_embed') {
      setWebUrlInput(activeWidget.customUrl || 'https://it.m.wikipedia.org/wiki/Informatica');
    }
  }, [activeWidget?.id, activeWidget?.customUrl, activeWidget?.type]);

  // Resolve PDF or Material URL when activeWidget is pdf_viewer
  useEffect(() => {
    let isMounted = true;
    const resolvePdf = async () => {
      if (!activeWidget || activeWidget.type !== 'pdf_viewer') return;
      setLoadingPdf(true);
      try {
        // 1. Check if linked to a course material
        const targetMat =
          materials.find(m => String(m.id) === String(activeWidget.materialId)) ||
          materials.find(m => m.fileType === 'pdf' || m.url.includes('drive.google.com')) ||
          materials[0];

        if (targetMat && (!activeWidget.customUrl || activeWidget.materialId)) {
          const dId = extractDriveId(targetMat.url);
          if (dId) {
            if (isMounted) setResolvedPdfUrl(`https://drive.google.com/file/d/${dId}/preview`);
          } else if (targetMat.fileData && targetMat.fileData.startsWith('data:')) {
            const url = base64ToBlobUrl(targetMat.fileData, targetMat.mimeType || 'application/pdf');
            if (isMounted) setResolvedPdfUrl(url);
          } else {
            const localData = await getFileFromIndexedDB(String(targetMat.id));
            if (localData && typeof localData === 'string' && localData.startsWith('data:')) {
              const url = base64ToBlobUrl(localData, targetMat.mimeType || 'application/pdf');
              if (isMounted) setResolvedPdfUrl(url);
            } else if (targetMat.url && targetMat.url !== 'local_storage') {
              if (isMounted) setResolvedPdfUrl(targetMat.url);
            } else {
              if (isMounted) setResolvedPdfUrl('');
            }
          }
        } else if (activeWidget.customUrl) {
          const dId = extractDriveId(activeWidget.customUrl);
          if (dId) {
            if (isMounted) setResolvedPdfUrl(`https://drive.google.com/file/d/${dId}/preview`);
          } else {
            if (isMounted) setResolvedPdfUrl(activeWidget.customUrl);
          }
        } else {
          if (isMounted) setResolvedPdfUrl('');
        }
      } finally {
        if (isMounted) setLoadingPdf(false);
      }
    };
    resolvePdf();
    return () => {
      isMounted = false;
    };
  }, [activeWidget, materials]);

  // Pomodoro timer interval
  useEffect(() => {
    if (!pomoRunning) return;
    const timer = setInterval(() => {
      setPomoSeconds(prev => {
        if (prev <= 1) {
          setPomoRunning(false);
          showToast('⏰ Tempo scaduto nel Timer Studio!');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pomoRunning, showToast]);

  if (slotWidgets.length === 0 || !activeWidget) return null;

  const widgetHeight = activeWidget.height || (slot === 'right_bottom' ? 300 : 250);

  const handleCycleSlot = (w: CustomWidget) => {
    const order: WidgetSlot[] = ['right_bottom', 'center_bottom', 'left_bottom'];
    const nextSlot = order[(order.indexOf(w.slot) + 1) % order.length];
    const slotNames: Record<WidgetSlot, string> = {
      right_bottom: 'Sotto la Chat AI',
      center_bottom: 'Sotto gli Appunti',
      left_bottom: 'Sotto la Barra Laterale'
    };
    onUpdateWidget({ ...w, slot: nextSlot });
    showToast(`Widget spostato in: ${slotNames[nextSlot]}`);
  };

  const handleImagePasteOrUpload = async (file: Blob) => {
    try {
      const compressed = await compressImageFromBlob(file, 1000, 0.82);
      onUpdateWidget({ ...activeWidget, imageData: compressed.dataUrl });
      showToast('🖼️ Immagine caricata nel widget!');
    } catch {
      showToast('Errore nel caricamento immagine.', 'error');
    }
  };

  const handleRunCalculation = () => {
    const res = evaluateMathExpression(calcExpr);
    if (res === null) {
      showToast('Espressione non valida. Esempio: (25 * 4) + sqrt(16)', 'error');
      return;
    }
    setCalcHistory(prev => [{ expr: calcExpr.trim(), res }, ...prev.slice(0, 9)]);
    setCalcExpr(res);
  };

  const formatPomoTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      className="workspace-widget-dock"
      style={{
        height: slot === 'right_bottom' ? '100%' : `${widgetHeight}px`,
        minHeight: slot === 'right_bottom' ? '180px' : `${widgetHeight}px`
      }}
    >
      {/* Top Bar: Widget Tabs + Quick Actions */}
      <div className="widget-dock-header">
        <div className="widget-dock-tabs">
          {slotWidgets.map(w => {
            const icon =
              w.type === 'pdf_viewer'
                ? '📄'
                : w.type === 'image_viewer'
                ? '🖼️'
                : w.type === 'web_embed'
                ? '🌐'
                : w.type === 'calculator'
                ? '🧮'
                : w.type === 'pomodoro'
                ? '⏱️'
                : '📌';
            return (
              <button
                key={w.id}
                type="button"
                className={`widget-dock-tab ${w.id === activeWidget.id ? 'active' : ''}`}
                onClick={() => setActiveWidgetId(w.id)}
              >
                <span>{icon}</span>
                <span>{w.title}</span>
              </button>
            );
          })}
        </div>

        <div className="widget-dock-controls">
          {slot !== 'right_bottom' && (
            <>
              <button
                type="button"
                className="widget-ctrl-btn"
                onClick={() => onUpdateWidget({ ...activeWidget, height: Math.max(160, widgetHeight - 40) })}
                title="Riduci altezza widget"
              >
                −
              </button>
              <button
                type="button"
                className="widget-ctrl-btn"
                onClick={() => onUpdateWidget({ ...activeWidget, height: Math.min(540, widgetHeight + 40) })}
                title="Aumenta altezza widget"
              >
                +
              </button>
            </>
          )}
          <button
            type="button"
            className="widget-ctrl-btn"
            onClick={() => handleCycleSlot(activeWidget)}
            title="Sposta widget in un'altra posizione (Sotto Chat / Sotto Appunti / Sotto Strumenti)"
          >
            ⇄
          </button>
          <button
            type="button"
            className="widget-ctrl-btn"
            onClick={onOpenWidgetSettings}
            title="Personalizza o aggiungi altri widget"
          >
            ⚙️
          </button>
          <button
            type="button"
            className="widget-ctrl-btn danger"
            onClick={() => onRemoveWidget(activeWidget.id)}
            title="Rimuovi questo widget"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Widget Body */}
      <div className="widget-dock-body">
        {/* 1. PDF VIEWER WIDGET */}
        {activeWidget.type === 'pdf_viewer' && (
          <div className="widget-pdf-container">
            <div className="widget-subtoolbar">
              <select
                value={activeWidget.materialId || ''}
                onChange={e =>
                  onUpdateWidget({
                    ...activeWidget,
                    materialId: e.target.value,
                    customUrl: ''
                  })
                }
                className="widget-select"
                title="Scegli un PDF o documento dai materiali della materia corrente"
              >
                <option value="">📚 Scegli dai Materiali ({materials.length})...</option>
                {materials.map(m => (
                  <option key={String(m.id)} value={String(m.id)}>
                    {m.name} ({m.category})
                  </option>
                ))}
              </select>
              {materials.length > 0 && (
                <button
                  type="button"
                  className="widget-mini-btn"
                  onClick={() => {
                    const target =
                      materials.find(m => String(m.id) === String(activeWidget.materialId)) || materials[0];
                    if (target) onOpenFullPreview(target);
                  }}
                  title="Apri anteprima a tutto schermo"
                >
                  ⛶ Espandi
                </button>
              )}
            </div>

            {loadingPdf ? (
              <div className="widget-empty-state">Caricamento documento...</div>
            ) : resolvedPdfUrl ? (
              <iframe
                src={resolvedPdfUrl}
                title={activeWidget.title}
                className="widget-iframe"
              />
            ) : (
              <div className="widget-empty-state">
                <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>📄</div>
                <div>Nessun PDF selezionato o presente in questa materia.</div>
                <div style={{ display: 'flex', gap: '6px', marginTop: '8px', width: '100%', maxWidth: '280px' }}>
                  <input
                    type="text"
                    placeholder="Oppure incolla link PDF / Google Drive..."
                    value={activeWidget.customUrl || ''}
                    onChange={e => onUpdateWidget({ ...activeWidget, customUrl: e.target.value, materialId: '' })}
                    className="widget-input"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 2. IMAGE / SCHEMA VIEWER WIDGET */}
        {activeWidget.type === 'image_viewer' && (
          <div
            className="widget-image-container"
            tabIndex={0}
            onPaste={e => {
              const items = e.clipboardData?.items;
              if (!items) return;
              for (let i = 0; i < items.length; i++) {
                if (items[i].type.startsWith('image/')) {
                  const blob = items[i].getAsFile();
                  if (blob) handleImagePasteOrUpload(blob);
                  e.preventDefault();
                  break;
                }
              }
            }}
          >
            <div className="widget-subtoolbar">
              <label className="widget-mini-btn" style={{ cursor: 'pointer' }}>
                📤 Carica Foto
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const f = e.target.files?.[0];
                    if (f) handleImagePasteOrUpload(f);
                  }}
                />
              </label>
              <button
                type="button"
                className="widget-mini-btn"
                onClick={() => setImgZoom(z => Math.max(50, z - 25))}
              >
                🔍−
              </button>
              <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                {imgZoom}%
              </span>
              <button
                type="button"
                className="widget-mini-btn"
                onClick={() => setImgZoom(z => Math.min(250, z + 25))}
              >
                🔍+
              </button>
              {activeWidget.imageData && (
                <button
                  type="button"
                  className="widget-mini-btn"
                  onClick={() => onUpdateWidget({ ...activeWidget, imageData: '' })}
                >
                  🗑️ Pulisci
                </button>
              )}
            </div>

            <div className="widget-image- stage" style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px' }}>
              {activeWidget.imageData || activeWidget.customUrl ? (
                <img
                  src={activeWidget.imageData || activeWidget.customUrl}
                  alt={activeWidget.title}
                  style={{
                    width: `${imgZoom}%`,
                    maxWidth: imgZoom === 100 ? '100%' : 'none',
                    borderRadius: '8px',
                    objectFit: 'contain'
                  }}
                />
              ) : (
                <div className="widget-empty-state">
                  <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>🖼️</div>
                  <div>Clicca qui e premi <b>Ctrl+V</b> per incollare uno screenshot, oppure carica uno schema/foto da tenere sott&apos;occhio!</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. WEB EMBED / MINI-BROWSER WIDGET */}
        {activeWidget.type === 'web_embed' && (
          <div className="widget-pdf-container">
            <div className="widget-subtoolbar" style={{ flexWrap: 'wrap' }}>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  let target = webUrlInput.trim();
                  if (target && !target.startsWith('http://') && !target.startsWith('https://')) {
                    target = 'https://' + target;
                  }
                  onUpdateWidget({ ...activeWidget, customUrl: target });
                }}
                style={{ display: 'flex', gap: '4px', flex: 1, minWidth: '140px' }}
              >
                <input
                  type="text"
                  value={webUrlInput}
                  onChange={e => setWebUrlInput(e.target.value)}
                  placeholder="https://it.wikipedia.org..."
                  className="widget-input"
                />
                <button type="submit" className="widget-mini-btn">
                  Vai
                </button>
              </form>
              <a
                href={activeWidget.customUrl || 'https://it.wikipedia.org'}
                target="_blank"
                rel="noreferrer"
                className="widget-mini-btn"
                title="Apri il sito in una nuova scheda se blocca la visualizzazione interna"
              >
                ↗
              </a>
            </div>
            <div className="widget-subtoolbar" style={{ paddingTop: 0, gap: '4px', overflowX: 'auto' }}>
              {WEB_WIDGET_PRESETS.map(p => (
                <button
                  key={p.label}
                  type="button"
                  className="widget-preset-chip"
                  onClick={() => {
                    setWebUrlInput(p.url);
                    onUpdateWidget({ ...activeWidget, customUrl: p.url });
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <iframe
              src={activeWidget.customUrl || 'https://it.m.wikipedia.org/wiki/Informatica'}
              title={activeWidget.title}
              className="widget-iframe"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
        )}

        {/* 4. SCIENTIFIC CALCULATOR WIDGET */}
        {activeWidget.type === 'calculator' && (
          <div className="widget-calc-container">
            <div style={{ display: 'flex', gap: '5px', marginBottom: '6px' }}>
              <input
                type="text"
                value={calcExpr}
                onChange={e => setCalcExpr(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRunCalculation();
                  }
                }}
                placeholder="Es. (240 * 1.22) / 3 oppure sqrt(144)"
                className="widget-input"
                style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 600 }}
              />
              <button
                type="button"
                className="widget-mini-btn accent"
                onClick={handleRunCalculation}
              >
                =
              </button>
              <button
                type="button"
                className="widget-mini-btn"
                onClick={() => {
                  const res = evaluateMathExpression(calcExpr);
                  const toInsert = res !== null && res !== calcExpr.trim() ? `${calcExpr.trim()} = ${res}` : calcExpr.trim();
                  if (toInsert) {
                    onInsertTextIntoNotes(toInsert);
                  }
                }}
                title="Inserisci il calcolo direttamente negli appunti"
              >
                📝 Appunti
              </button>
            </div>

            <div className="widget-calc-keypad">
              {['7', '8', '9', '/', 'sqrt(', '4', '5', '6', '*', '^2', '1', '2', '3', '-', '(', '0', '.', 'pi', '+', ')'].map(btn => (
                <button
                  key={btn}
                  type="button"
                  className="calc-key-btn"
                  onClick={() => setCalcExpr(prev => prev + btn)}
                >
                  {btn === 'sqrt(' ? '√' : btn === '^2' ? 'x²' : btn === 'pi' ? 'π' : btn}
                </button>
              ))}
              <button type="button" className="calc-key-btn" onClick={() => setCalcExpr('')}>
                C
              </button>
              <button type="button" className="calc-key-btn" onClick={() => setCalcExpr(prev => prev.slice(0, -1))}>
                ⌫
              </button>
            </div>

            {calcHistory.length > 0 && (
              <div className="widget-calc-history">
                {calcHistory.slice(0, 3).map((item, i) => (
                  <div
                    key={i}
                    className="calc-hist-row"
                    onClick={() => onInsertTextIntoNotes(`${item.expr} = ${item.res}`)}
                    title="Clicca per inserire negli appunti"
                  >
                    <span>{item.expr}</span>
                    <b>= {item.res}</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 5. POMODORO STUDIO TIMER WIDGET */}
        {activeWidget.type === 'pomodoro' && (
          <div className="widget-pomo-container">
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
              {[
                { id: 'work', label: '25m Studio', sec: 25 * 60 },
                { id: 'deep', label: '50m Focus', sec: 50 * 60 },
                { id: 'short', label: '5m Pausa', sec: 5 * 60 }
              ].map(m => (
                <button
                  key={m.id}
                  type="button"
                  className={`widget-preset-chip ${pomoMode === m.id ? 'active' : ''}`}
                  onClick={() => {
                    setPomoRunning(false);
                    setPomoMode(m.id as any);
                    setPomoSeconds(m.sec);
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="widget-pomo-clock">{formatPomoTime(pomoSeconds)}</div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                className="widget-mini-btn accent"
                onClick={() => setPomoRunning(r => !r)}
              >
                {pomoRunning ? '⏸ Pausa' : '▶ Avvia'}
              </button>
              <button
                type="button"
                className="widget-mini-btn"
                onClick={() => {
                  setPomoRunning(false);
                  setPomoSeconds(pomoMode === 'work' ? 25 * 60 : pomoMode === 'deep' ? 50 * 60 : 5 * 60);
                }}
              >
                ↺ Reset
              </button>
            </div>
          </div>
        )}

        {/* 6. QUICK SCRATCHPAD / POST-IT WIDGET */}
        {activeWidget.type === 'quick_scratch' && (
          <textarea
            className="widget-scratch-area"
            placeholder="📌 Post-it rapido: scrivi qui formule da tenere sempre visibili, scadenze esami o promemoria..."
            value={activeWidget.scratchText || ''}
            onChange={e => onUpdateWidget({ ...activeWidget, scratchText: e.target.value })}
          />
        )}
      </div>
    </div>
  );
};
