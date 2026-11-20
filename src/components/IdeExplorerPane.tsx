import React, { useState, useMemo } from 'react';
import { PageItem } from '../types';

interface IdeExplorerPaneProps {
  pages: PageItem[];
  activePageId: string;
  activeTab: 'notes' | 'materials' | 'calendar';
  workspaceMode: 'personal' | 'shared';
  materialsCount: number;
  calendarEventsCount: number;
  isStudyReviewOpen: boolean;
  isMindMapOpen: boolean;
  onSelectPage: (pageId: string) => void;
  onAddNewPage: () => void;
  onRenamePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onOpenAddMaterial: () => void;
  onSelectCenterTab: (tab: 'notes' | 'materials' | 'calendar') => void;
  onOpenStudyReview: () => void;
  onOpenMindMap: () => void;
  onOpenWeather: () => void;
  onOpenWidgetsSettings: () => void;
  onToggleWorkspaceMode: () => void;
}

export const IdeExplorerPane: React.FC<IdeExplorerPaneProps> = ({
  pages,
  activePageId,
  activeTab,
  workspaceMode,
  materialsCount,
  calendarEventsCount,
  isStudyReviewOpen,
  isMindMapOpen,
  onSelectPage,
  onAddNewPage,
  onRenamePage,
  onDeletePage,
  onOpenAddMaterial,
  onSelectCenterTab,
  onOpenStudyReview,
  onOpenMindMap,
  onOpenWeather,
  onOpenWidgetsSettings,
  onToggleWorkspaceMode
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(p => p.name.toLowerCase().includes(q));
  }, [pages, searchQuery]);

  return (
    <aside className="ide-explorer-pane" aria-label="Explorer Appunti">
      {/* Monospace Window Header */}
      <div className="ide-pane-header">
        <div className="ide-pane-header-left">
          <span className="ide-grip-dots" aria-hidden="true">⋮⋮</span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span className="ide-pane-title">EXPLORER</span>
        </div>
      </div>

      {/* Search + Quick Action Icons Row */}
      <div className="ide-explorer-search-bar">
        <div className="ide-explorer-search-input-wrap">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Cerca appunti..."
            aria-label="Cerca appunti nell'explorer"
          />
          {searchQuery && (
            <button
              type="button"
              className="ide-search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Pulisci ricerca"
            >
              ✕
            </button>
          )}
        </div>

        <button
          type="button"
          className="ide-explorer-icon-btn"
          onClick={onAddNewPage}
          title="Nuova scheda appunti"
          aria-label="Nuova scheda appunti"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </button>

        <button
          type="button"
          className="ide-explorer-icon-btn"
          onClick={onOpenAddMaterial}
          title="Carica materiale PDF o link"
          aria-label="Carica materiale"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>

        <button
          type="button"
          className={`ide-explorer-icon-btn ${workspaceMode === 'shared' ? 'is-active' : ''}`}
          onClick={onToggleWorkspaceMode}
          title={workspaceMode === 'shared' ? 'Torna a Personale' : 'Passa a Stanze di Gruppo'}
          aria-label="Cambia modalità Personale o Stanze di Gruppo"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
      </div>

      {/* Notes / Pages Tree List */}
      <div className="ide-explorer-list" role="list">
        {filteredPages.length === 0 ? (
          <div className="ide-explorer-empty">
            {searchQuery ? 'Nessuna scheda trovata.' : 'Nessuna scheda in questa materia.'}
          </div>
        ) : (
          filteredPages.map(page => {
            const isSelected = activeTab === 'notes' && page.id === activePageId;
            return (
              <div
                key={page.id}
                role="listitem"
                className={`ide-explorer-row ${isSelected ? 'is-active' : ''}`}
              >
                <button
                  type="button"
                  className="ide-explorer-row-main"
                  onClick={() => {
                    onSelectCenterTab('notes');
                    onSelectPage(page.id);
                  }}
                  title={page.name}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    className="ide-explorer-file-icon"
                    aria-hidden="true"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className="ide-explorer-row-name">{page.name}</span>
                </button>
                <div className="ide-explorer-row-actions">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onRenamePage(page.id);
                    }}
                    title="Rinomina scheda"
                    aria-label={`Rinomina ${page.name}`}
                  >
                    ✎
                  </button>
                  {pages.length > 1 && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onDeletePage(page.id);
                      }}
                      title="Elimina scheda"
                      aria-label={`Elimina ${page.name}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Compact Study Tools Footer Dock inside Explorer */}
      <div className="ide-explorer-tools-dock">
        <div className="ide-explorer-section-label">STRUMENTI STUDIO</div>
        <button
          type="button"
          className={`ide-explorer-tool-btn ${activeTab === 'materials' ? 'is-active' : ''}`}
          onClick={() => onSelectCenterTab(activeTab === 'materials' ? 'notes' : 'materials')}
        >
          <span>📚 Materiali &amp; Slide</span>
          <span className="ide-explorer-count">{materialsCount}</span>
        </button>
        <button
          type="button"
          className={`ide-explorer-tool-btn ${activeTab === 'calendar' ? 'is-active' : ''}`}
          onClick={() => onSelectCenterTab(activeTab === 'calendar' ? 'notes' : 'calendar')}
        >
          <span>📅 Calendario</span>
          <span className="ide-explorer-count">{calendarEventsCount}</span>
        </button>
        <button
          type="button"
          className={`ide-explorer-tool-btn ${isStudyReviewOpen ? 'is-active' : ''}`}
          onClick={onOpenStudyReview}
        >
          <span>🧠 Flashcard &amp; Quiz</span>
        </button>
        <button
          type="button"
          className={`ide-explorer-tool-btn ${isMindMapOpen ? 'is-active' : ''}`}
          onClick={onOpenMindMap}
        >
          <span>🗺️ Mappa Interattiva</span>
        </button>
        <div className="ide-explorer-mini-footer">
          <button type="button" onClick={onOpenWeather} title="Previsioni Meteo">
            🌤️ Meteo
          </button>
          <button type="button" onClick={onOpenWidgetsSettings} title="Gestisci Widget">
            🧩 Widget
          </button>
        </div>
      </div>
    </aside>
  );
};
