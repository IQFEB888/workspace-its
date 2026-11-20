import React, { useState, useMemo } from 'react';
import { PageItem } from '../types';
import { groupPagesByFolder } from '../utils/ideTheme';

interface IdeExplorerPaneProps {
  pages: PageItem[];
  extraFolders?: string[];
  activePageId: string;
  activeTab: 'notes' | 'materials' | 'calendar';
  workspaceMode: 'personal' | 'shared';
  materialsCount: number;
  calendarEventsCount: number;
  isStudyReviewOpen: boolean;
  isMindMapOpen: boolean;
  isCollapsed?: boolean;
  hideWindowHeader?: boolean;
  onHeaderDragStart?: (e: React.DragEvent) => void;
  onHeaderDragEnd?: () => void;
  onToggleCollapse?: () => void;
  onClosePane?: () => void;
  onSelectPage: (pageId: string) => void;
  onAddNewPage: (folderName?: string) => void;
  onCreateFolder?: () => void;
  onMovePageToFolder?: (pageId: string, folderName: string | undefined) => void;
  onDeleteFolder?: (folderName: string) => void;
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
  extraFolders = [],
  activePageId,
  activeTab,
  workspaceMode,
  materialsCount,
  calendarEventsCount,
  isStudyReviewOpen,
  isMindMapOpen,
  isCollapsed = false,
  hideWindowHeader = false,
  onHeaderDragStart,
  onHeaderDragEnd,
  onToggleCollapse,
  onClosePane,
  onSelectPage,
  onAddNewPage,
  onCreateFolder,
  onMovePageToFolder,
  onDeleteFolder,
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
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | '__root__' | null>(null);

  const filteredPages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      p =>
        p.name.toLowerCase().includes(q) ||
        (p.folder && p.folder.toLowerCase().includes(q))
    );
  }, [pages, searchQuery]);

  const { folders, rootPages } = useMemo(
    () => groupPagesByFolder(filteredPages, searchQuery.trim() ? [] : extraFolders),
    [filteredPages, extraFolders, searchQuery]
  );

  // Collapsed sleek vertical rail (exact match to 00:53 in user video!)
  if (isCollapsed && !hideWindowHeader) {
    return (
      <aside className="ide-explorer-rail" aria-label="Explorer compresso">
        <button
          type="button"
          className="ide-rail-btn"
          onClick={onToggleCollapse}
          title="Espandi Explorer"
          aria-label="Espandi Explorer"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <polyline points="13 9 16 12 13 15" />
          </svg>
        </button>
        <button
          type="button"
          className="ide-rail-btn"
          onClick={onToggleCollapse}
          title="Apri Appunti Explorer"
          style={{ color: '#f59e0b' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </button>
        <button
          type="button"
          className="ide-rail-btn"
          onClick={() => onAddNewPage()}
          title="Nuova scheda appunti"
        >
          +
        </button>
        <div className="ide-rail-spacer" />
        <button
          type="button"
          className={`ide-rail-btn ${activeTab === 'materials' ? 'is-active' : ''}`}
          onClick={() => onSelectCenterTab(activeTab === 'materials' ? 'notes' : 'materials')}
          title="Materiali & Slide"
        >
          📚
        </button>
        <button
          type="button"
          className={`ide-rail-btn ${activeTab === 'calendar' ? 'is-active' : ''}`}
          onClick={() => onSelectCenterTab(activeTab === 'calendar' ? 'notes' : 'calendar')}
          title="Calendario"
        >
          📅
        </button>
        <button
          type="button"
          className={`ide-rail-btn ${isStudyReviewOpen ? 'is-active' : ''}`}
          onClick={onOpenStudyReview}
          title="Flashcard & Quiz"
        >
          🧠
        </button>
        <button
          type="button"
          className={`ide-rail-btn ${isMindMapOpen ? 'is-active' : ''}`}
          onClick={onOpenMindMap}
          title="Mappa Interattiva"
        >
          🗺️
        </button>
      </aside>
    );
  }

  const renderPageRow = (page: PageItem, nested = false) => {
    const isSelected = activeTab === 'notes' && page.id === activePageId;
    return (
      <div
        key={page.id}
        role="listitem"
        draggable={workspaceMode === 'personal' && !!onMovePageToFolder}
        onDragStart={e => {
          e.stopPropagation();
          setDraggedNoteId(page.id);
          e.dataTransfer.setData('application/x-ws-note-id', page.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => {
          setDraggedNoteId(null);
          setDragOverFolder(null);
        }}
        className={`ide-explorer-row ${isSelected ? 'is-active' : ''} ${nested ? 'is-nested' : ''} ${
          draggedNoteId === page.id ? 'is-dragging' : ''
        }`}
      >
        <button
          type="button"
          className="ide-explorer-row-main"
          onClick={() => {
            onSelectCenterTab('notes');
            onSelectPage(page.id);
          }}
          title={`${page.name}${workspaceMode === 'personal' ? ' (trascina in una cartella per spostare)' : ''}`}
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
  };

  return (
    <aside className="ide-explorer-pane" aria-label="Explorer Appunti">
      {/* Draggable Monospace Window Header */}
      {!hideWindowHeader && (
        <div
          className="ide-pane-header ide-draggable-header"
          draggable={!!onHeaderDragStart}
          onDragStart={onHeaderDragStart}
          onDragEnd={onHeaderDragEnd}
          title="Trascina per spostare, impilare o unire come scheda"
        >
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
          <div className="ide-pane-header-actions">
            {onToggleCollapse && (
              <button
                type="button"
                className="ide-pane-icon-btn"
                onClick={onToggleCollapse}
                title="Comprimi Explorer"
                aria-label="Comprimi Explorer"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                  <polyline points="15 9 12 12 15 15" />
                </svg>
              </button>
            )}
            {onClosePane && (
              <button
                type="button"
                className="ide-pane-icon-btn"
                onClick={onClosePane}
                title="Chiudi finestra Explorer"
                aria-label="Chiudi Explorer"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search + Quick Action Icons Row (Note, Folder, Upload, Rooms) */}
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
          onClick={() => onAddNewPage()}
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

        {workspaceMode === 'personal' && onCreateFolder && (
          <button
            type="button"
            className="ide-explorer-icon-btn"
            onClick={onCreateFolder}
            title="Crea Nuova Cartella"
            aria-label="Crea Nuova Cartella"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </button>
        )}

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

      {/* Notes & Folders Tree List */}
      <div
        className={`ide-explorer-list ${dragOverFolder === '__root__' ? 'is-root-drop' : ''}`}
        role="list"
        onDragOver={e => {
          if (!draggedNoteId) return;
          e.preventDefault();
          setDragOverFolder('__root__');
        }}
        onDragLeave={() => {
          if (dragOverFolder === '__root__') setDragOverFolder(null);
        }}
        onDrop={e => {
          const noteId = e.dataTransfer.getData('application/x-ws-note-id') || draggedNoteId;
          if (noteId && onMovePageToFolder) {
            e.preventDefault();
            onMovePageToFolder(noteId, undefined);
          }
          setDraggedNoteId(null);
          setDragOverFolder(null);
        }}
      >
        {/* Folders */}
        {folders.map(folder => {
          const isOpen = !collapsedFolders[folder.name];
          return (
            <div
              key={folder.name}
              className={`ide-explorer-folder-group ${
                dragOverFolder === folder.name ? 'is-drop-target' : ''
              }`}
              onDragOver={e => {
                if (!draggedNoteId) return;
                e.preventDefault();
                e.stopPropagation();
                setDragOverFolder(folder.name);
              }}
              onDragLeave={() => {
                if (dragOverFolder === folder.name) setDragOverFolder(null);
              }}
              onDrop={e => {
                const noteId = e.dataTransfer.getData('application/x-ws-note-id') || draggedNoteId;
                if (noteId && onMovePageToFolder) {
                  e.preventDefault();
                  e.stopPropagation();
                  onMovePageToFolder(noteId, folder.name);
                  setCollapsedFolders(prev => ({ ...prev, [folder.name]: false }));
                }
                setDraggedNoteId(null);
                setDragOverFolder(null);
              }}
            >
              <div className="ide-explorer-folder-header">
                <button
                  type="button"
                  className="ide-explorer-folder-toggle"
                  onClick={() =>
                    setCollapsedFolders(prev => ({ ...prev, [folder.name]: !prev[folder.name] }))
                  }
                >
                  <span className="ide-folder-chevron">{isOpen ? '▾' : '▸'}</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                  <span className="ide-explorer-row-name">{folder.name}</span>
                  <span className="ide-folder-count">{folder.pages.length}</span>
                </button>
                <div className="ide-explorer-row-actions">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onAddNewPage(folder.name);
                    }}
                    title={`Nuova nota in ${folder.name}`}
                    aria-label={`Nuova nota in ${folder.name}`}
                  >
                    +
                  </button>
                  {onDeleteFolder && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onDeleteFolder(folder.name);
                      }}
                      title={`Rimuovi cartella ${folder.name} (le note restano nella root)`}
                      aria-label={`Rimuovi cartella ${folder.name}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {isOpen && (
                <div className="ide-explorer-folder-children">
                  {folder.pages.length === 0 ? (
                    <div className="ide-folder-empty-hint">Trascina qui una nota...</div>
                  ) : (
                    folder.pages.map(p => renderPageRow(p, true))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Root Notes */}
        {folders.length === 0 && rootPages.length === 0 ? (
          <div className="ide-explorer-empty">
            {searchQuery ? 'Nessuna scheda trovata.' : 'Nessuna scheda in questa materia.'}
          </div>
        ) : (
          rootPages.map(page => renderPageRow(page, false))
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
