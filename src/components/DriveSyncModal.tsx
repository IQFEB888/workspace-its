import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { MaterialItem } from '../types';
import {
  extractDriveFolderId,
  fetchDriveFolderFiles,
  computeDriveMaterialsDiff,
  GoogleDriveFile,
  SyncResult
} from '../services/googleDriveService';
import { saveFileToIndexedDB } from '../services/fileStorage';

interface DriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiKey: string;
  onSaveApiKey: (key: string) => void;
  oAuthToken: string | null;
  onAuthorizeGoogleDrive: () => Promise<string | null>;
  currentFolderUrl: string;
  existingMaterials: MaterialItem[];
  workspaceMode: 'personal' | 'shared';
  targetTitle: string; // e.g. "Database" or "Stanza 1"
  onImportMaterials: (newItems: MaterialItem[]) => Promise<void>;
  showToast: (msg: string, type?: 'info' | 'error') => void;
}

interface ExtractedFile {
  id: string;
  name: string;
  cleanName: string;
  size: number;
  fileType: 'pdf' | 'doc' | 'image' | 'video' | 'link';
  mimeType: string;
  base64: string;
  selected: boolean;
}

export const DriveSyncModal: React.FC<DriveSyncModalProps> = ({
  isOpen,
  onClose,
  apiKey,
  onSaveApiKey,
  oAuthToken,
  onAuthorizeGoogleDrive,
  currentFolderUrl,
  existingMaterials,
  workspaceMode,
  targetTitle,
  onImportMaterials,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'cloud' | 'zip'>('cloud');
  const [keyInput, setKeyInput] = useState(apiKey || '');
  const [folderUrl, setFolderUrl] = useState(currentFolderUrl || '');
  const [showKey, setShowKey] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [scannedFiles, setScannedFiles] = useState<GoogleDriveFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>(
    workspaceMode === 'shared' ? 'Condivisi' : 'Lezioni'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ZIP / Multi-file states
  const [extractedFiles, setExtractedFiles] = useState<ExtractedFile[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    setKeyInput(apiKey || '');
  }, [apiKey]);

  useEffect(() => {
    setFolderUrl(currentFolderUrl || '');
    setSyncResult(null);
    setScannedFiles([]);
    setErrorMessage(null);
    setExtractedFiles([]);
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

  const handleConnectGoogle = async () => {
    setIsAuthorizing(true);
    setErrorMessage(null);
    try {
      const token = await onAuthorizeGoogleDrive();
      if (token) {
        showToast('Account Google connesso!', 'info');
        if (folderUrl.trim()) {
          runScan(token);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Errore durante la connessione con Google.');
    } finally {
      setIsAuthorizing(false);
    }
  };

  const runScan = async (activeToken?: string | null) => {
    setErrorMessage(null);
    setSyncResult(null);

    const tokenToUse = activeToken !== undefined ? activeToken : oAuthToken;
    const trimmedKey = keyInput.trim();
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

    if (!tokenToUse && !trimmedKey) {
      setErrorMessage(
        'Per cartelle protette, connetti il tuo account Google o usa la tab "Importa ZIP/PDF da Drive".'
      );
      return;
    }

    if (trimmedKey && trimmedKey !== apiKey) {
      onSaveApiKey(trimmedKey);
    }

    setIsScanning(true);
    try {
      const files = await fetchDriveFolderFiles(folderId, {
        apiKey: trimmedKey || undefined,
        accessToken: tokenToUse || undefined
      });
      setScannedFiles(files);

      if (files.length === 0) {
        setErrorMessage(
          'Nessun file trovato in questa cartella. Se appartiene a un account scolastico (@itsrizzoli.it), condividi la cartella con il tuo account beccalli.fabio4@gmail.com oppure usa la tab "Importa ZIP/PDF".'
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
      const materialsToImport = syncResult.newMaterials.map(m => ({
        ...m,
        category: selectedCategory.trim() || (workspaceMode === 'shared' ? 'Condivisi' : 'Lezioni')
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

  // Process dropped or selected files (.zip or multiple PDFs)
  const handleFilesInput = async (filesList: FileList | null) => {
    if (!filesList || filesList.length === 0) return;
    setIsProcessingFiles(true);
    setErrorMessage(null);

    const newExtracted: ExtractedFile[] = [];

    try {
      for (let i = 0; i < filesList.length; i++) {
        const file = filesList[i];
        const lowerName = file.name.toLowerCase();

        // If it is a ZIP downloaded from Google Drive
        if (lowerName.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
          const zip = await JSZip.loadAsync(file);
          const entries = Object.keys(zip.files);

          for (const entryName of entries) {
            const zipEntry = zip.files[entryName];
            if (zipEntry.dir) continue;
            // Ignore hidden files and MacOS metadata
            if (entryName.startsWith('__MACOSX') || entryName.split('/').some(p => p.startsWith('.'))) {
              continue;
            }

            const cleanFileName = entryName.split('/').pop() || entryName;
            const entryLower = cleanFileName.toLowerCase();

            let fileType: 'pdf' | 'doc' | 'image' | 'video' | 'link' = 'doc';
            let mimeType = 'application/octet-stream';

            if (entryLower.endsWith('.pdf')) {
              fileType = 'pdf';
              mimeType = 'application/pdf';
            } else if (entryLower.endsWith('.png') || entryLower.endsWith('.jpg') || entryLower.endsWith('.jpeg')) {
              fileType = 'image';
              mimeType = entryLower.endsWith('.png') ? 'image/png' : 'image/jpeg';
            } else if (entryLower.endsWith('.doc') || entryLower.endsWith('.docx') || entryLower.endsWith('.txt') || entryLower.endsWith('.md')) {
              fileType = 'doc';
              mimeType = 'text/plain';
            }

            const base64Data = await zipEntry.async('base64');
            const dataUrl = `data:${mimeType};base64,${base64Data}`;
            const id = 'mat_zip_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

            newExtracted.push({
              id,
              name: cleanFileName,
              cleanName: cleanFileName.replace(/\.[^/.]+$/, ''),
              size: base64Data.length * 0.75,
              fileType,
              mimeType,
              base64: dataUrl,
              selected: true
            });
          }
        } else {
          // Regular PDF or document
          const isPdf = lowerName.endsWith('.pdf') || file.type === 'application/pdf';
          const isImg = file.type.startsWith('image/');
          const fileType: 'pdf' | 'doc' | 'image' = isPdf ? 'pdf' : isImg ? 'image' : 'doc';
          const mimeType = file.type || (isPdf ? 'application/pdf' : 'application/octet-stream');

          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });

          const id = 'mat_file_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
          newExtracted.push({
            id,
            name: file.name,
            cleanName: file.name.replace(/\.[^/.]+$/, ''),
            size: file.size,
            fileType,
            mimeType,
            base64: dataUrl,
            selected: true
          });
        }
      }

      if (newExtracted.length === 0) {
        setErrorMessage('Nessun documento o PDF valido trovato nei file selezionati.');
      } else {
        setExtractedFiles(prev => [...prev, ...newExtracted]);
        showToast(`Rilevati ${newExtracted.length} documenti pronti per l'importazione!`);
      }
    } catch (err: any) {
      console.error('File parsing error:', err);
      setErrorMessage(`Errore lettura file: ${err.message || 'File non valido o corrotto'}`);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleImportExtractedFiles = async () => {
    const selected = extractedFiles.filter(f => f.selected);
    if (selected.length === 0) {
      showToast('Nessun file selezionato per l\'importazione.', 'error');
      return;
    }

    setIsImporting(true);
    try {
      const itemsToImport: MaterialItem[] = [];

      for (const item of selected) {
        // Save full file to IndexedDB for offline viewing & preview
        await saveFileToIndexedDB(item.id, item.base64);

        itemsToImport.push({
          id: item.id,
          name: item.cleanName || item.name,
          url: 'local_storage',
          category: selectedCategory.trim() || (workspaceMode === 'shared' ? 'Condivisi' : 'Lezioni'),
          createdAt: new Date().toISOString(),
          fileType: item.fileType,
          fileSize: item.size,
          mimeType: item.mimeType,
          fileData: item.base64.length < 500000 ? item.base64 : '',
          hasLocalFile: true
        });
      }

      await onImportMaterials(itemsToImport);
      showToast(`✨ Importati con successo ${itemsToImport.length} materiali nel workspace!`);
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
          maxWidth: '680px',
          width: '95%',
          maxHeight: '92vh',
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.6rem' }}>📂</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}>
                Importa Materiali e PDF da Google Drive
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

        {/* Tab selection */}
        <div style={{ display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.04)', padding: '5px', borderRadius: '12px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('cloud')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'cloud' ? '#6366f1' : 'transparent',
              color: activeTab === 'cloud' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            🔗 Sincronizzazione Cartella Drive (Link)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('zip')}
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'zip' ? '#10b981' : 'transparent',
              color: activeTab === 'zip' ? '#fff' : '#94a3b8',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'all 0.2s'
            }}
          >
            📦 Importa ZIP o Multi-PDF (Istantaneo)
          </button>
        </div>

        {/* TAB 1: CLOUD DRIVE SYNC */}
        {activeTab === 'cloud' && (
          <div>
            {/* Guide card for institutional @itsrizzoli.it accounts */}
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: '0.86rem', fontWeight: 700, color: oAuthToken ? '#34d399' : '#e0f2fe' }}>
                    {oAuthToken ? '✅ Account Google Connesso' : '🔐 Connessione Account Google'}
                  </div>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '2px' }}>
                    {oAuthToken
                      ? 'Il tuo account Google è autorizzato: puoi leggere cartelle protette a cui hai accesso.'
                      : 'Connetti il tuo account Google per autorizzare la lettura della cartella del docente.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={isAuthorizing}
                  style={{
                    background: oAuthToken ? 'rgba(16, 185, 129, 0.2)' : '#0284c7',
                    border: oAuthToken ? '1px solid rgba(16, 185, 129, 0.4)' : 'none',
                    color: '#ffffff',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: isAuthorizing ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isAuthorizing ? '⏳ Connessione...' : oAuthToken ? '🔄 Riconnetti Account' : '🔐 Connetti Account Google'}
                </button>
              </div>

              {/* Explicit explanation for ITS Rizzoli policy */}
              <div
                style={{
                  marginTop: '12px',
                  paddingTop: '10px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  fontSize: '0.74rem',
                  color: '#cbd5e1',
                  lineHeight: 1.55
                }}
              >
                <div style={{ fontWeight: 600, color: '#f59e0b', marginBottom: '4px' }}>
                  ℹ️ Nota sugli account scolastici (@itsrizzoli.it):
                </div>
                I domini scolastici Google Workspace bloccano spesso l&apos;accesso di app terze agli account degli studenti.
                <div style={{ marginTop: '6px', background: 'rgba(0,0,0,0.25)', padding: '8px 10px', borderRadius: '8px' }}>
                  <b>💡 Soluzione rapida in 2 passaggi:</b>
                  <ol style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    <li>Su Google Drive col tuo account scolastico, fai tasto destro sulla cartella del docente &rarr; <b>Condividi</b> &rarr; aggiungi la tua email personale <code>beccalli.fabio4@gmail.com</code>.</li>
                    <li>Poi qui clicca <b>&ldquo;Connetti Account Google&rdquo;</b> scegliendo <code>beccalli.fabio4@gmail.com</code> (essendo l&apos;amministratore, non ha blocchi scolastici!).</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Folder link input */}
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
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
                  onClick={() => runScan()}
                  disabled={isScanning || !folderUrl.trim()}
                  style={{
                    background: '#6366f1',
                    border: 'none',
                    color: '#fff',
                    borderRadius: '8px',
                    padding: '8px 18px',
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

            {/* Optional Google Drive API Key */}
            <details style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '10px', padding: '10px 12px', marginBottom: '16px' }}>
              <summary style={{ fontSize: '0.76rem', color: '#94a3b8', cursor: 'pointer', fontWeight: 500 }}>
                Opzioni avanzate: Chiave API Google Cloud (opzionale per cartelle pubbliche)
              </summary>
              <div style={{ marginTop: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{ position: 'relative', flex: 1 }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      placeholder="AIzaSy..."
                      value={keyInput}
                      onChange={e => setKeyInput(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'rgba(0, 0, 0, 0.3)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        padding: '8px 36px 8px 10px',
                        fontSize: '0.82rem'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      {showKey ? '🙈' : '👁️'}
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
                      padding: '6px 12px',
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Salva
                  </button>
                </div>
              </div>
            </details>

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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                  <div>⚠️ {errorMessage}</div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('zip')}
                    style={{
                      background: '#10b981',
                      border: 'none',
                      color: '#fff',
                      borderRadius: '6px',
                      padding: '5px 10px',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    📦 Passa a Importa ZIP/PDF
                  </button>
                </div>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, color: '#f8fafc' }}>
                    Risultato Scansione Drive
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem' }}>
                    <span style={{ color: '#94a3b8' }}>File trovati: <b>{syncResult.totalFound}</b></span>
                    <span style={{ color: '#38bdf8' }}>Già presenti: <b>{syncResult.alreadyExistingCount}</b></span>
                    <span style={{ color: '#34d399', fontWeight: 700 }}>
                      Nuovi: <b>{syncResult.newMaterials.length}</b>
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
                      🎉 La tua libreria è già aggiornata! Non ci sono nuovi file da importare.
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
          </div>
        )}

        {/* TAB 2: ZIP & MULTI-FILE DIRECT IMPORT (NO GOOGLE CLOUD OAUTH BLOCK) */}
        {activeTab === 'zip' && (
          <div>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '12px',
                padding: '14px',
                marginBottom: '16px',
                fontSize: '0.78rem',
                lineHeight: 1.5,
                color: '#cbd5e1'
              }}
            >
              <div style={{ fontWeight: 700, color: '#34d399', marginBottom: '6px', fontSize: '0.84rem' }}>
                🚀 Il metodo più veloce e sicuro al 100% (Senza permessi o blocchi Google):
              </div>
              <ol style={{ margin: '0 0 0 16px', padding: 0 }}>
                <li>Su Google Drive, apri la cartella del docente con il tuo account scolastico.</li>
                <li>In alto, clicca sul titolo della cartella &rarr; <b>Scarica</b> (Drive crea e scarica in un attimo un file <code>.zip</code> con tutti i PDF).</li>
                <li>Trascina qui il file <code>.zip</code> (oppure seleziona tutti i PDF insieme): l&apos;app estrarrà tutti i file e li importerà subito con anteprima e categorie!</li>
              </ol>
            </div>

            {/* Drag & drop zone */}
            <div
              onDragOver={e => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={e => {
                e.preventDefault();
                setDragActive(false);
                handleFilesInput(e.dataTransfer.files);
              }}
              style={{
                border: `2px dashed ${dragActive ? '#10b981' : 'rgba(255, 255, 255, 0.2)'}`,
                borderRadius: '14px',
                padding: '24px 16px',
                textAlign: 'center',
                background: dragActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(0, 0, 0, 0.25)',
                cursor: 'pointer',
                transition: 'all 0.2s',
                marginBottom: '16px'
              }}
              onClick={() => {
                document.getElementById('zip-batch-upload-input')?.click();
              }}
            >
              <input
                id="zip-batch-upload-input"
                type="file"
                multiple
                accept=".zip,.pdf,.doc,.docx,.png,.jpg,.jpeg,.txt"
                onChange={e => handleFilesInput(e.target.files)}
                style={{ display: 'none' }}
              />
              <div style={{ fontSize: '2.4rem', marginBottom: '8px' }}>
                {isProcessingFiles ? '⏳' : '📦'}
              </div>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', color: '#fff' }}>
                {isProcessingFiles ? 'Estrazione e analisi file in corso...' : 'Trascina qui il file .ZIP di Google Drive o i PDF multipli'}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginTop: '4px' }}>
                Supporta archivi .ZIP di Google Drive, PDF, presentazioni e dispense
              </div>
            </div>

            {/* Category selection for ZIP import */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>Categoria per i file estratti:</span>
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
                  padding: '5px 10px',
                  fontSize: '0.78rem',
                  width: '150px'
                }}
              />
            </div>

            {/* Extracted files list */}
            {extractedFiles.length > 0 && (
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
                  <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f8fafc' }}>
                    Documenti rilevati ({extractedFiles.filter(f => f.selected).length}/{extractedFiles.length} selezionati)
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setExtractedFiles(prev => prev.map(f => ({ ...f, selected: true })))}
                      style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      Seleziona tutti
                    </button>
                    <span style={{ color: '#64748b' }}>|</span>
                    <button
                      type="button"
                      onClick={() => setExtractedFiles(prev => prev.map(f => ({ ...f, selected: false })))}
                      style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}
                    >
                      Deseleziona
                    </button>
                  </div>
                </div>

                <div
                  style={{
                    maxHeight: '200px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    paddingRight: '4px',
                    marginBottom: '14px'
                  }}
                >
                  {extractedFiles.map((file, idx) => (
                    <div
                      key={file.id}
                      onClick={() => {
                        setExtractedFiles(prev =>
                          prev.map((f, i) => (i === idx ? { ...f, selected: !f.selected } : f))
                        );
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: file.selected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${file.selected ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                        borderRadius: '8px',
                        padding: '7px 10px',
                        fontSize: '0.78rem',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        <input
                          type="checkbox"
                          checked={file.selected}
                          onChange={() => {}}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>{file.fileType === 'pdf' ? '📄' : file.fileType === 'image' ? '🖼️' : '📝'}</span>
                        <span style={{ fontWeight: 600, color: '#f8fafc', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                          {file.cleanName}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#94a3b8', flexShrink: 0, marginLeft: '8px' }}>
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleImportExtractedFiles}
                  disabled={isImporting || extractedFiles.filter(f => f.selected).length === 0}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    border: 'none',
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.88rem',
                    padding: '11px',
                    borderRadius: '10px',
                    cursor: isImporting ? 'not-allowed' : 'pointer',
                    opacity: isImporting || extractedFiles.filter(f => f.selected).length === 0 ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  {isImporting
                    ? '⏳ Importazione in corso...'
                    : `📥 Importa ${extractedFiles.filter(f => f.selected).length} Documenti Estratti`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
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
