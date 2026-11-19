import React, { useState, useMemo } from 'react';
import { PageItem } from '../types';
import { buildDispensaHtmlDocument, convertNoteHtmlToMarkdown } from '../utils/studyTools';

interface ExportDispensaModalProps {
  isOpen: boolean;
  onClose: () => void;
  subjectName: string;
  authorName: string;
  activePage: PageItem | null;
  allSubjectPages: PageItem[];
  onNotify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ExportDispensaModal: React.FC<ExportDispensaModalProps> = ({
  isOpen,
  onClose,
  subjectName,
  authorName,
  activePage,
  allSubjectPages,
  onNotify
}) => {
  const [scope, setScope] = useState<'subject' | 'page'>('subject');
  const [includeCover, setIncludeCover] = useState<boolean>(true);
  const [includeToc, setIncludeToc] = useState<boolean>(true);
  const [theme, setTheme] = useState<'academic-light' | 'modern-indigo' | 'dark-tech'>('modern-indigo');

  const exportPages = useMemo(() => {
    if (scope === 'page' && activePage) return [activePage];
    return allSubjectPages;
  }, [scope, activePage, allSubjectPages]);

  const previewHtml = useMemo(
    () =>
      buildDispensaHtmlDocument({
        subjectName: scope === 'page' && activePage ? `${subjectName} — ${activePage.name}` : subjectName,
        authorName,
        pages: exportPages,
        includeCover,
        includeToc,
        theme
      }),
    [scope, activePage, subjectName, authorName, exportPages, includeCover, includeToc, theme]
  );

  if (!isOpen) return null;

  const safeFileBase = (scope === 'page' && activePage ? `${subjectName}_${activePage.name}` : `${subjectName}_Dispensa`)
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');

  const handlePrintPdf = () => {
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) throw new Error('Iframe non disponibile');
      doc.open();
      doc.write(previewHtml);
      doc.close();

      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1200);
      }, 250);

      onNotify('🖨️ Finestra di stampa PDF aperta: scegli "Salva come PDF"!');
    } catch (err: any) {
      onNotify(`Errore stampa PDF: ${err?.message || 'impossibile aprire anteprima'}`, 'error');
    }
  };

  const handleDownloadWord = () => {
    const blob = new Blob(['\ufeff', previewHtml], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileBase}.doc`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`📘 Dispensa Word "${safeFileBase}.doc" scaricata!`);
  };

  const handleDownloadMarkdown = () => {
    const md = convertNoteHtmlToMarkdown(exportPages, subjectName, includeToc);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeFileBase}.md`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`⬇️ File Markdown "${safeFileBase}.md" scaricato!`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box export-dispensa-modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '880px', width: '95%' }}
      >
        <div className="modal-header">
          <span className="modal-title">📄 Esporta Dispensa Impaginata — {subjectName}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Chiudi esportazione">
            ✕
          </button>
        </div>

        <div className="export-dispensa-grid">
          <div className="export-options-col">
            <div className="export-opt-group">
              <label>Contenuto da esportare</label>
              <div className="study-seg-group">
                <button
                  type="button"
                  className={`study-seg-btn ${scope === 'subject' ? 'active' : ''}`}
                  onClick={() => setScope('subject')}
                >
                  Tutta la Materia ({allSubjectPages.length} schede)
                </button>
                <button
                  type="button"
                  className={`study-seg-btn ${scope === 'page' ? 'active' : ''}`}
                  onClick={() => setScope('page')}
                >
                  Solo Scheda Attuale
                </button>
              </div>
            </div>

            <div className="export-opt-group">
              <label>Stile Impaginazione</label>
              <div className="export-theme-row">
                <button
                  type="button"
                  className={`export-theme-pill ${theme === 'modern-indigo' ? 'active' : ''}`}
                  onClick={() => setTheme('modern-indigo')}
                >
                  ✨ Moderno Indigo
                </button>
                <button
                  type="button"
                  className={`export-theme-pill ${theme === 'academic-light' ? 'active' : ''}`}
                  onClick={() => setTheme('academic-light')}
                >
                  🏛️ Accademico Chiaro
                </button>
                <button
                  type="button"
                  className={`export-theme-pill ${theme === 'dark-tech' ? 'active' : ''}`}
                  onClick={() => setTheme('dark-tech')}
                >
                  🌙 Dark Tech
                </button>
              </div>
            </div>

            <div className="export-check-row">
              <label className="export-check-label">
                <input
                  type="checkbox"
                  checked={includeCover}
                  onChange={e => setIncludeCover(e.target.checked)}
                />
                <span>Includi Copertina Universitaria</span>
              </label>
              <label className="export-check-label">
                <input
                  type="checkbox"
                  checked={includeToc}
                  onChange={e => setIncludeToc(e.target.checked)}
                />
                <span>Includi Sommario / Indice Automatico</span>
              </label>
            </div>

            <div className="export-actions-stack">
              <button type="button" className="export-primary-btn" onClick={handlePrintPdf}>
                🖨️ Stampa / Salva come PDF Professionale
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button type="button" className="export-secondary-btn" onClick={handleDownloadWord}>
                  📘 Scarica Word (.doc)
                </button>
                <button type="button" className="export-secondary-btn" onClick={handleDownloadMarkdown}>
                  ⬇️ Scarica Markdown (.md)
                </button>
              </div>
            </div>
          </div>

          <div className="export-preview-col">
            <div className="export-preview-label">Anteprima Live Dispensa</div>
            <iframe
              title="Anteprima Dispensa"
              srcDoc={previewHtml}
              className="export-preview-iframe"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
