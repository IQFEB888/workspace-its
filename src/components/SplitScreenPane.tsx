import React, { useState, useEffect, useMemo } from 'react';
import { MaterialItem, PageItem } from '../types';
import { getFileFromIndexedDB } from '../services/fileStorage';

interface SplitScreenPaneProps {
  activeSubject: string;
  activePageId: string;
  pagesBySubject: Record<string, PageItem[]>;
  materialsBySubject: Record<string, MaterialItem[]>;
  onClose: () => void;
  onOpenInMainEditor?: (subjectId: string, pageId: string) => void;
}

export const SplitScreenPane: React.FC<SplitScreenPaneProps> = ({
  activeSubject,
  activePageId,
  pagesBySubject,
  materialsBySubject,
  onClose,
  onOpenInMainEditor
}) => {
  const [paneMode, setPaneMode] = useState<'note' | 'material'>('note');

  const allNoteOptions = useMemo(() => {
    const out: Array<{ key: string; subjectId: string; page: PageItem }> = [];
    Object.entries(pagesBySubject).forEach(([subId, list]) => {
      (list || []).forEach(p => {
        out.push({ key: `${subId}::${p.id}`, subjectId: subId, page: p });
      });
    });
    return out;
  }, [pagesBySubject]);

  const allMaterialOptions = useMemo(() => {
    const out: Array<{ key: string; subjectId: string; material: MaterialItem }> = [];
    Object.entries(materialsBySubject).forEach(([subId, list]) => {
      (list || []).forEach(m => {
        out.push({ key: `${subId}::${m.id}`, subjectId: subId, material: m });
      });
    });
    return out;
  }, [materialsBySubject]);

  const defaultNoteKey = useMemo(() => {
    const anotherInSameSub = allNoteOptions.find(
      o => o.subjectId === activeSubject && o.page.id !== activePageId
    );
    return anotherInSameSub?.key || allNoteOptions[0]?.key || '';
  }, [allNoteOptions, activeSubject, activePageId]);

  const [selectedNoteKey, setSelectedNoteKey] = useState<string>(defaultNoteKey);
  const [selectedMaterialKey, setSelectedMaterialKey] = useState<string>(
    allMaterialOptions[0]?.key || ''
  );
  const [resolvedMatUrl, setResolvedMatUrl] = useState<string>('');
  const [loadingMat, setLoadingMat] = useState<boolean>(false);

  useEffect(() => {
    if (!selectedNoteKey && defaultNoteKey) {
      setSelectedNoteKey(defaultNoteKey);
    }
  }, [defaultNoteKey, selectedNoteKey]);

  const selectedNote = allNoteOptions.find(o => o.key === selectedNoteKey) || null;
  const selectedMaterial = allMaterialOptions.find(o => o.key === selectedMaterialKey) || null;

  useEffect(() => {
    let active = true;
    if (paneMode !== 'material' || !selectedMaterial) {
      setResolvedMatUrl('');
      return;
    }

    const mat = selectedMaterial.material;
    const direct = mat.fileData || (mat.url && !mat.url.startsWith('local-file://') ? mat.url : '');
    if (direct) {
      setResolvedMatUrl(direct);
      return;
    }

    let createdObjUrl = '';
    setLoadingMat(true);
    getFileFromIndexedDB(String(mat.id))
      .then(data => {
        if (!active) return;
        if (!data) {
          setResolvedMatUrl('');
        } else if (typeof data === 'string') {
          setResolvedMatUrl(data);
        } else {
          createdObjUrl = URL.createObjectURL(data);
          setResolvedMatUrl(createdObjUrl);
        }
      })
      .catch(() => {
        if (active) setResolvedMatUrl('');
      })
      .finally(() => {
        if (active) setLoadingMat(false);
      });

    return () => {
      active = false;
      if (createdObjUrl) URL.revokeObjectURL(createdObjUrl);
    };
  }, [paneMode, selectedMaterial]);

  return (
    <aside className="split-screen-pane" aria-label="Pannello Split-Screen">
      <div className="split-pane-header">
        <div className="split-pane-tabs">
          <button
            type="button"
            className={`split-mode-btn ${paneMode === 'note' ? 'active' : ''}`}
            onClick={() => setPaneMode('note')}
          >
            📝 Scheda Affiancata
          </button>
          <button
            type="button"
            className={`split-mode-btn ${paneMode === 'material' ? 'active' : ''}`}
            onClick={() => setPaneMode('material')}
          >
            📕 PDF / Dispensa ({allMaterialOptions.length})
          </button>
        </div>

        <button
          type="button"
          className="widget-ctrl-btn danger"
          onClick={onClose}
          title="Chiudi vista Split-Screen"
          aria-label="Chiudi Split-Screen"
        >
          ✕
        </button>
      </div>

      <div className="split-pane-selector-row">
        {paneMode === 'note' ? (
          <>
            <select
              className="split-pane-select"
              value={selectedNoteKey}
              onChange={e => setSelectedNoteKey(e.target.value)}
            >
              {allNoteOptions.map(o => (
                <option key={o.key} value={o.key}>
                  [{o.subjectId}] {o.page.name}
                </option>
              ))}
            </select>
            {selectedNote && onOpenInMainEditor && (
              <button
                type="button"
                className="widget-mini-btn"
                onClick={() => onOpenInMainEditor(selectedNote.subjectId, selectedNote.page.id)}
                title="Apri questa scheda nell'editor principale a sinistra"
              >
                ⇄ Apri a Sinistra
              </button>
            )}
          </>
        ) : (
          <select
            className="split-pane-select"
            value={selectedMaterialKey}
            onChange={e => setSelectedMaterialKey(e.target.value)}
          >
            {allMaterialOptions.length === 0 ? (
              <option value="">Nessuna dispensa caricata</option>
            ) : (
              allMaterialOptions.map(o => (
                <option key={o.key} value={o.key}>
                  [{o.subjectId}] {o.material.name}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      <div className="split-pane-body">
        {paneMode === 'note' ? (
          selectedNote ? (
            <div
              className="split-note-preview"
              dangerouslySetInnerHTML={{
                __html:
                  selectedNote.page.content ||
                  '<p style="color:#94a3b8;font-style:italic;">Questa scheda è ancora vuota.</p>'
              }}
            />
          ) : (
            <div className="split-empty-hint">
              Seleziona una scheda di appunti dal menu qui sopra per consultarla affiancata.
            </div>
          )
        ) : !selectedMaterial ? (
          <div className="split-empty-hint">
            Carica un PDF, un&apos;immagine o una dispensa nella scheda <strong>Materiali</strong> per visualizzarla qui affiancata ai tuoi appunti!
          </div>
        ) : loadingMat ? (
          <div className="split-empty-hint">⏳ Caricamento dispensa...</div>
        ) : !resolvedMatUrl ? (
          <div className="split-empty-hint">
            Anteprima non disponibile per questo file locale su questo dispositivo.
          </div>
        ) : selectedMaterial.material.fileType === 'image' ||
          selectedMaterial.material.mimeType?.startsWith('image/') ? (
          <div style={{ padding: '12px', textAlign: 'center' }}>
            <img
              src={resolvedMatUrl}
              alt={selectedMaterial.material.name}
              style={{ maxWidth: '100%', borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
            />
          </div>
        ) : (
          <iframe
            title={selectedMaterial.material.name}
            src={resolvedMatUrl}
            className="split-material-iframe"
          />
        )}
      </div>
    </aside>
  );
};
