import React, { useState, useEffect } from 'react';
import { MaterialItem } from '../types';
import {
  extractDriveFolderId,
  fetchDriveFolderFiles,
  computeDriveMaterialsDiff,
  GoogleDriveFile,
  SyncResult
} from '../services/googleDriveService';

interface DriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  currentFolderUrl: string;
  existingMaterials: MaterialItem[];
  workspaceMode: 'personal' | 'shared';
  targetTitle: string; // e.g. "Database" or "Stanza 1"
  onImportMaterials: (newItems: MaterialItem[]) => Promise<void>;
  showToast: (msg: string, type?: 'info' | 'error') => void;
}

export const DriveSyncModal: React.FC<DriveSyncModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  currentFolderUrl,
  existingMaterials,
  workspaceMode,
  targetTitle,
  onImportMaterials,
  showToast
}) => {
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [folderUrl, setFolderUrl] = useState(currentFolderUrl || '');
  const [showKey, setShowKey] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [scannedFiles, setScannedFiles] = useState<GoogleDriveFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    workspaceMode === 'shared' ? 'Condivisi' : 'Lezioni'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setKeyInput(apiKey || '');
  }, [apiKey]);

  useEffect(() => {
    setFolderUrl(currentFolderUrl || '');
    setSyncResult(null);
    setScannedFiles([]);
    setErrorMessage(null);
  }, [currentFolderUrl, isOpen]);

  if (!isOpen) return null;

  const handleSaveKeyOnly = () => {
    if (!keyInput.trim()) {
      showToast('Inserisci una chiave API valida prima di salvare.', 'error');
      return;
    }
    onSaveApiKey(keyInput.trim());
    showToast('Google Drive API Key salvata!');
  };

  const handleScanFolder = async () => {
    setErrorMessage(null);
    setSyncResult(null);

    const trimmedKey = keyInput.trim();
    if (!trimmedKey) {
      setErrorMessage('Inserisci prima la tua Google Drive API Key.');
      return;
    }

    const trimmedFolderUrl = folderUrl.trim();
    if (!trimmedFolderUrl) {
      setErrorMessage('Inserisci il link della cartella Google Drive da sincronizzare.');
      return;
    }

    const folderId = extractDriveFolderId(trimmedFolderUrl);
    if (!folderId) {
      setErrorMessage(
        'Link cartella non valido. Assicurati che contenga "/folders/..." o l\'ID della cartella Drive.'
      );
      return;
    }

    // Auto-save key if changed
    if (trimmedKey !== apiKey) {
      onSaveApiKey(trimmedKey);
    }

    setIsScanning(true);
    try {
      const files = await fetchDriveFolderFiles(folderId, trimmedKey);
      setScannedFiles(files);

      if (files.length === 0) {
        setErrorMessage(
          'Nessun file trovato in questa cartella. Assicurati che non sia vuota e che la condivisione sia impostata su "Chiunque abbia il link può visualizzare".'
        );
      } else {
        const diff = computeDriveMaterialsDiff(
          files,
          existingMaterials,
          folderId,
          selectedCategory
        );
        setSyncResult(diff);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Errore durante la scansione della cartella.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!syncResult || syncResult.newMaterials.length === 0) return;

    setIsImporting(true);
    try {
      // Re-map with selected category
      const materialsToImport = syncResult.newMaterials.map(m => ({
        ...m,
        category: selectedCategory.trim() || 'Lezioni'
      }));

      await onImportMaterials(materialsToImport);
      showToast(
        `✨ Importati con successo ${materialsToImport.length} nuovi materiali da Google Drive!`
      );
      onClose();
    } catch (err: any) {
      showToast(`Errore durante l'importazione: ${err.message}`, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal-box"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '620px',
          width: '95%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'rgba(15, 17, 23, 0.96)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          padding: '24px',
          color: '#f8fafc'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>📂</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                Sincronizza Cartella Google Drive
              </h3>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#94a3b8' }}>
                Destinazione: <b>{targetTitle}</b> ({workspaceMode === 'shared' ? 'Stanza Condivisa' : 'Personale'})
              </p>
            </div>
          </div>
          <button
            className="modal-close"
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.3rem',
              cursor: 'pointer',
              padding: '4px 8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Section 1: Google Drive API Key */}
        <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '12px', padding: '14px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#cbd5e1' }}>
              🔑 Google Drive API Key (Ufficiale)
            </label>
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.72rem', color: '#818cf8', textDecoration: 'none' }}
            >
              Crea o visualizza su Google Cloud ↗
            </a>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type={showKey ? 'text' : 'password'}
                placeholder="Incolla la tua chiave AIzaSy..."
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  padding: '8px 36px 8px 10px',
                  fontSize: '0.85rem'
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? 'Nascondi' : 'Mostra'}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                {showKey ? '👁️‍🗨️' : '👁️'}
              </button>
            </div>
            <button
              type="button"
              onClick={handleSaveKeyOnly}
              style={{
                background: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                color: '#a5b4fc',
                borderRadius: '8px',
                padding: '8px 14px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              Salva Chiave
            </button>
          </div>
          <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '6px' }}>
            Basta la chiave standard di Google Cloud con <b>Google Drive API</b> abilitata. Viene salvata nel tuo profilo sicuro.
          </div>
        </div>

        {/* Section 2: Folder Link */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '0.82rem', fontWeight: 600, color: '#e2e8f0', display: 'block', marginBottom: '6px' }}>
            🔗 Link Cartella Google Drive del Docente:
          </label>
          <input
            type="text"
            placeholder="https://drive.google.com/drive/folders/1ABC...XYZ"
            value={folderUrl}
            onChange={e => setFolderUrl(e.target.value)}
            style={{
              width: '100%',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              color: '#f8fafc',
              padding: '10px 12px',
              fontSize: '0.85rem',
              marginBottom: '8px'
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Categoria da assegnare:</span>
              <input
                type="text"
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                placeholder="Es. Lezioni, Dispense..."
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  padding: '4px 8px',
                  fontSize: '0.78rem',
                  width: '130px'
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleScanFolder}
              disabled={isScanning || !folderUrl.trim()}
              style={{
                background: '#6366f1',
                border: 'none',
                color: '#fff',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: isScanning ? 'not-allowed' : 'pointer',
                opacity: isScanning || !folderUrl.trim() ? 0.6 : 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {isScanning ? '🔍 Analisi in corso...' : '🔍 Analizza Cartella'}
            </button>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div
            style={{
              background: 'rgba(244, 63, 94, 0.15)',
              border: '1px solid rgba(244, 63, 94, 0.35)',
              borderRadius: '10px',
              padding: '12px 14px',
              color: '#fecdd3',
              fontSize: '0.82rem',
              lineHeight: 1.45,
              marginBottom: '16px'
            }}
          >
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Scan Results & Diff */}
        {syncResult && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '14px',
              marginBottom: '18px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>
                Risultato Scansione Drive
              </div>
              <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                <span style={{ color: '#94a3b8' }}>File trovati: <b>{syncResult.totalFound}</b></span>
                <span style={{ color: '#38bdf8' }}>Già in libreria: <b>{syncResult.alreadyExistingCount}</b></span>
                <span style={{ color: '#34d399', fontWeight: 700 }}>
                  Nuovi da importare: <b>{syncResult.newMaterials.length}</b>
                </span>
              </div>
            </div>

            {/* List preview */}
            <div
              style={{
                maxHeight: '160px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                paddingRight: '4px',
                marginBottom: '12px'
              }}
            >
              {syncResult.newMaterials.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', padding: '16px 0' }}>
                  🎉 La tua libreria è già aggiornata! Non ci sono nuovi file PDF o documenti da importare da questa cartella.
                </div>
              ) : (
                syncResult.newMaterials.map(m => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: '8px',
                      padding: '6px 10px',
                      fontSize: '0.78rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                      <span>📄</span>
                      <span style={{ fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {m.name}
                      </span>
                    </div>
                    <span style={{ color: '#34d399', fontSize: '0.72rem', fontWeight: 600, flexShrink: 0, marginLeft: '8px' }}>
                      ✨ Nuovo
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Execute Import Button */}
            {syncResult.newMaterials.length > 0 && (
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none',
                  color: '#ffffff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  padding: '10px',
                  borderRadius: '10px',
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  opacity: isImporting ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                }}
              >
                {isImporting ? '⏳ Importazione in corso...' : `📥 Importa ${syncResult.newMaterials.length} Nuovi Materiali nel Workspace`}
              </button>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            className="dialog-btn"
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              borderRadius: '8px',
              padding: '8px 16px',
              cursor: 'pointer'
            }}
          >
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
};
