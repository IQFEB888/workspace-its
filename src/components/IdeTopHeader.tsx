import React, { useState, useRef, useEffect } from 'react';
import { SubjectItem } from '../types';
import { APP_VERSION } from '../utils/editorTools';
import {
  IDE_LAYOUT_PRESETS,
  IdeLayoutPresetId,
  IdeThemeMode,
  IdeWindowVisibility,
  UiStyleMode,
  countVisibleIdeWindows,
  getSubjectDotColor
} from '../utils/ideTheme';

interface IdeTopHeaderProps {
  currentUser: {
    displayName?: string | null;
    email?: string | null;
    photoURL?: string | null;
  };
  subjects: SubjectItem[];
  activeSubject: string;
  workspaceMode: 'personal' | 'shared';
  activeRoomName?: string;
  userRoomsCount: number;
  activeTab: 'notes' | 'materials' | 'calendar';
  isSplitScreenOpen: boolean;
  isStudyReviewOpen: boolean;
  isMindMapOpen: boolean;
  ideWindows: IdeWindowVisibility;
  ideThemeMode: IdeThemeMode;
  activeLayoutPreset: IdeLayoutPresetId | 'custom';
  isExplorerCollapsed: boolean;
  isAdmin: boolean;
  pendingRequestsCount: number;
  isInstalled: boolean;
  onSelectSubject: (id: string) => void;
  onAddNewSubject: () => void;
  onDeleteSubject: (id: string) => void;
  onSwitchWorkspaceMode: (mode: 'personal' | 'shared') => void;
  onOpenCreateRoom: () => void;
  onOpenJoinRoom: () => void;
  onOpenCommandPalette: () => void;
  onToggleIdeWindow: (key: keyof IdeWindowVisibility) => void;
  onApplyLayoutPreset: (presetId: IdeLayoutPresetId) => void;
  onToggleCollapseExplorer: () => void;
  onRestoreDefaultWindows: () => void;
  onSelectCenterTab: (tab: 'notes' | 'materials' | 'calendar') => void;
  onToggleSplitScreen: () => void;
  onOpenStudyReview: () => void;
  onOpenMindMap: () => void;
  onSelectIdeThemeMode: (mode: IdeThemeMode) => void;
  onToggleIdeThemeMode: () => void;
  onSwitchUiStyle: (style: UiStyleMode) => void;
  onOpenSettings: () => void;
  onOpenBackup: () => void;
  onOpenSync: () => void;
  onOpenAdmin: () => void;
  onInstallApp: () => void;
  onLogout: () => void;
}

export const IdeTopHeader: React.FC<IdeTopHeaderProps> = ({
  currentUser,
  subjects,
  activeSubject,
  workspaceMode,
  activeRoomName,
  userRoomsCount,
  activeTab,
  isSplitScreenOpen,
  isStudyReviewOpen,
  isMindMapOpen,
  ideWindows,
  ideThemeMode,
  activeLayoutPreset,
  isExplorerCollapsed,
  isAdmin,
  pendingRequestsCount,
  isInstalled,
  onSelectSubject,
  onAddNewSubject,
  onDeleteSubject,
  onSwitchWorkspaceMode,
  onOpenCreateRoom,
  onOpenJoinRoom,
  onOpenCommandPalette,
  onToggleIdeWindow,
  onApplyLayoutPreset,
  onToggleCollapseExplorer,
  onRestoreDefaultWindows,
  onSelectCenterTab,
  onToggleSplitScreen,
  onOpenStudyReview,
  onOpenMindMap,
  onSelectIdeThemeMode,
  onToggleIdeThemeMode,
  onSwitchUiStyle,
  onOpenSettings,
  onOpenBackup,
  onOpenSync,
  onOpenAdmin,
  onInstallApp,
  onLogout
}) => {
  const [openMenu, setOpenMenu] = useState<'subject' | 'windows' | 'profile' | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const visibleCount = countVisibleIdeWindows(ideWindows);
  const displayName =
    currentUser.displayName?.split(' ')[0] ||
    currentUser.email?.split('@')[0] ||
    'Studente';
  const avatarInitial = displayName.charAt(0).toUpperCase();
  const activeLabel =
    workspaceMode === 'shared'
      ? activeRoomName || 'Stanze di Gruppo'
      : activeSubject;
  const activeDotColor =
    workspaceMode === 'shared' ? '#a855f7' : getSubjectDotColor(activeSubject);

  return (
    <header ref={headerRef} className="ide-top-header" role="banner">
      {/* LEFT: Brand + Subject Dropdown */}
      <div className="ide-header-left">
        <div className="ide-brand-block">
          <div className="ide-brand-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
              <path d="M6 12v5c3 3 9 3 12 0v-5" />
            </svg>
          </div>
          <div className="ide-brand-text">
            <span className="ide-brand-name">Workspace ITS</span>
            <span className="ide-brand-ver">{APP_VERSION}</span>
          </div>
        </div>

        <span className="ide-header-divider" aria-hidden="true" />

        {/* Subject & Room Dropdown */}
        <div className="ide-menu-anchor">
          <button
            type="button"
            className={`ide-pill-trigger ${openMenu === 'subject' ? 'is-open' : ''}`}
            onClick={() => setOpenMenu(prev => (prev === 'subject' ? null : 'subject'))}
            aria-expanded={openMenu === 'subject'}
            aria-label="Seleziona materia o stanza"
          >
            <span className="ide-subject-dot" style={{ backgroundColor: activeDotColor }} />
            <span className="ide-pill-label">{activeLabel}</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {openMenu === 'subject' && (
            <div className="ide-dropdown-popover ide-subject-popover" role="menu">
              <div className="ide-popover-section-head">
                <span>MODALITÀ WORKSPACE</span>
              </div>
              <div className="ide-mode-segmented">
                <button
                  type="button"
                  className={workspaceMode === 'personal' ? 'is-active' : ''}
                  onClick={() => {
                    onSwitchWorkspaceMode('personal');
                    setOpenMenu(null);
                  }}
                >
                  🔒 Personale
                </button>
                <button
                  type="button"
                  className={workspaceMode === 'shared' ? 'is-active' : ''}
                  onClick={() => {
                    onSwitchWorkspaceMode('shared');
                    setOpenMenu(null);
                  }}
                >
                  👥 Stanze ({userRoomsCount})
                </button>
              </div>

              {workspaceMode === 'personal' ? (
                <>
                  <div className="ide-popover-section-head">
                    <span>LE TUE MATERIE ({subjects.length})</span>
                    <button
                      type="button"
                      className="ide-popover-inline-link"
                      onClick={() => {
                        setOpenMenu(null);
                        onAddNewSubject();
                      }}
                    >
                      + Nuova
                    </button>
                  </div>
                  <div className="ide-popover-list">
                    {subjects.map(sub => {
                      const isCurr = sub.id === activeSubject;
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          className={`ide-popover-row ${isCurr ? 'is-active' : ''}`}
                          onClick={() => {
                            onSelectSubject(sub.id);
                            setOpenMenu(null);
                          }}
                        >
                          <span
                            className="ide-subject-dot"
                            style={{ backgroundColor: getSubjectDotColor(sub.name) }}
                          />
                          <span className="ide-popover-row-text">{sub.name}</span>
                          {isCurr && <span className="ide-row-check">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                  {subjects.length > 1 && (
                    <div className="ide-popover-footer">
                      <button
                        type="button"
                        className="ide-popover-danger-btn"
                        onClick={() => {
                          setOpenMenu(null);
                          onDeleteSubject(activeSubject);
                        }}
                      >
                        🗑️ Elimina &ldquo;{activeSubject}&rdquo;
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="ide-popover-list" style={{ marginTop: '6px' }}>
                  <button
                    type="button"
                    className="ide-popover-row"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenCreateRoom();
                    }}
                  >
                    <span>➕ Crea Nuova Stanza di Gruppo</span>
                  </button>
                  <button
                    type="button"
                    className="ide-popover-row"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenJoinRoom();
                    }}
                  >
                    <span>🔑 Entra con Codice Invito</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CENTER: Command Palette Pill (> _ Comandi rapidi... Ctrl+K) */}
      <div className="ide-header-center">
        <button
          type="button"
          className="ide-cmd-trigger"
          onClick={onOpenCommandPalette}
          title="Apri Command Palette (Ctrl+K)"
        >
          <span className="ide-cmd-prompt" aria-hidden="true">&gt;_</span>
          <span className="ide-cmd-placeholder">Comandi rapidi...</span>
          <kbd className="ide-cmd-kbd">Ctrl+K</kbd>
        </button>
      </div>

      {/* RIGHT: Finestre Layout Popover + Theme Toggle + Profile Menu */}
      <div className="ide-header-right">
        {/* Finestre X/3 Menu */}
        <div className="ide-menu-anchor">
          <button
            type="button"
            className={`ide-pill-trigger ${openMenu === 'windows' ? 'is-open' : ''}`}
            onClick={() => setOpenMenu(prev => (prev === 'windows' ? null : 'windows'))}
            aria-expanded={openMenu === 'windows'}
            aria-label={`Menu Finestre layout (${visibleCount} su 3 attive)`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <span className="ide-pill-label">Finestre</span>
            <span className="ide-window-count">{visibleCount}/3</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {openMenu === 'windows' && (
            <div className="ide-dropdown-popover ide-windows-popover" role="menu" aria-label="Finestre Layout">
              {/* Section 1: Layout Rapidi (matches v1.0.3 video) */}
              <div className="ide-windows-pop-header">
                <span>Layout Rapidi</span>
                <span className="ide-windows-pop-ratio">
                  {activeLayoutPreset === 'custom' ? 'Personalizzato' : `${visibleCount}/3`}
                </span>
              </div>

              <div className="ide-presets-list">
                {IDE_LAYOUT_PRESETS.map(preset => {
                  const isActive = activeLayoutPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      className={`ide-preset-row ${isActive ? 'is-active' : ''}`}
                      onClick={() => {
                        onApplyLayoutPreset(preset.id);
                        setOpenMenu(null);
                      }}
                    >
                      <div className="ide-preset-info">
                        <span className="ide-preset-label">{preset.label}</span>
                        <span className="ide-preset-desc">{preset.description}</span>
                      </div>
                      {isActive && <span className="ide-row-check">✓</span>}
                    </button>
                  );
                })}
              </div>

              {/* Section 2: Finestre Attive */}
              <div className="ide-popover-section-head" style={{ marginTop: '6px', borderTop: '1px solid var(--ide-border)', paddingTop: '7px' }}>
                <span>FINESTRE ATTIVE</span>
                <span className="ide-windows-pop-ratio">{visibleCount}/3</span>
              </div>

              <div className="ide-windows-list">
                <button
                  type="button"
                  className={`ide-window-row ${ideWindows.explorer ? 'is-on' : ''}`}
                  onClick={() => onToggleIdeWindow('explorer')}
                >
                  <span className={`ide-win-checkbox ${ideWindows.explorer ? 'is-checked' : ''}`} aria-hidden="true">
                    {ideWindows.explorer ? '✓' : ''}
                  </span>
                  <span className="ide-win-icon" style={{ color: '#f59e0b' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                  </span>
                  <span className="ide-win-name">EXPLORER</span>
                  <span className={`ide-win-state ${ideWindows.explorer ? 'is-on' : ''}`}>
                    {ideWindows.explorer ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`ide-window-row ${activeTab === 'materials' || isSplitScreenOpen ? 'is-on' : ''}`}
                  onClick={() => {
                    if (activeTab === 'materials') {
                      onSelectCenterTab('notes');
                    } else {
                      if (!ideWindows.editor) onToggleIdeWindow('editor');
                      onSelectCenterTab('materials');
                    }
                  }}
                >
                  <span className={`ide-win-checkbox ${activeTab === 'materials' || isSplitScreenOpen ? 'is-checked' : ''}`} aria-hidden="true">
                    {activeTab === 'materials' || isSplitScreenOpen ? '✓' : ''}
                  </span>
                  <span className="ide-win-icon" style={{ color: '#14b8a6' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                  </span>
                  <span className="ide-win-name">SLIDE / MATERIALI</span>
                  <span className={`ide-win-state ${activeTab === 'materials' || isSplitScreenOpen ? 'is-on' : ''}`}>
                    {activeTab === 'materials' ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`ide-window-row ${ideWindows.editor && activeTab === 'notes' ? 'is-on' : ''}`}
                  onClick={() => {
                    if (ideWindows.editor && activeTab !== 'notes') {
                      onSelectCenterTab('notes');
                    } else {
                      onToggleIdeWindow('editor');
                    }
                  }}
                >
                  <span className={`ide-win-checkbox ${ideWindows.editor ? 'is-checked' : ''}`} aria-hidden="true">
                    {ideWindows.editor ? '✓' : ''}
                  </span>
                  <span className="ide-win-icon" style={{ color: '#3b82f6' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="16 18 22 12 16 6" />
                      <polyline points="8 6 2 12 8 18" />
                    </svg>
                  </span>
                  <span className="ide-win-name">EDITOR</span>
                  <span className={`ide-win-state ${ideWindows.editor ? 'is-on' : ''}`}>
                    {ideWindows.editor ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`ide-window-row ${activeTab === 'calendar' ? 'is-on' : ''}`}
                  onClick={() => {
                    if (!ideWindows.editor) onToggleIdeWindow('editor');
                    onSelectCenterTab(activeTab === 'calendar' ? 'notes' : 'calendar');
                    setOpenMenu(null);
                  }}
                >
                  <span className={`ide-win-checkbox ${activeTab === 'calendar' ? 'is-checked' : ''}`} aria-hidden="true">
                    {activeTab === 'calendar' ? '✓' : ''}
                  </span>
                  <span className="ide-win-icon" style={{ color: '#10b981' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </span>
                  <span className="ide-win-name">CALENDARIO</span>
                  <span className={`ide-win-state ${activeTab === 'calendar' ? 'is-on' : ''}`}>
                    {activeTab === 'calendar' ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`ide-window-row ${isStudyReviewOpen ? 'is-on' : ''}`}
                  onClick={() => {
                    onOpenStudyReview();
                    setOpenMenu(null);
                  }}
                >
                  <span className={`ide-win-checkbox ${isStudyReviewOpen ? 'is-checked' : ''}`} aria-hidden="true">
                    {isStudyReviewOpen ? '✓' : ''}
                  </span>
                  <span className="ide-win-icon" style={{ color: '#818cf8' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 17 12 22 22 17" />
                      <polyline points="2 12 12 17 22 12" />
                    </svg>
                  </span>
                  <span className="ide-win-name">FLASHCARDS &amp; QUIZ</span>
                  <span className={`ide-win-state ${isStudyReviewOpen ? 'is-on' : ''}`}>
                    {isStudyReviewOpen ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`ide-window-row ${isMindMapOpen ? 'is-on' : ''}`}
                  onClick={() => {
                    onOpenMindMap();
                    setOpenMenu(null);
                  }}
                >
                  <span className={`ide-win-checkbox ${isMindMapOpen ? 'is-checked' : ''}`} aria-hidden="true">
                    {isMindMapOpen ? '✓' : ''}
                  </span>
                  <span className="ide-win-icon" style={{ color: '#ec4899' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="3" />
                      <circle cx="5" cy="6" r="2" />
                      <circle cx="19" cy="6" r="2" />
                      <circle cx="5" cy="18" r="2" />
                      <circle cx="19" cy="18" r="2" />
                      <line x1="9.5" y1="10.2" x2="6.5" y2="7.5" />
                      <line x1="14.5" y1="10.2" x2="17.5" y2="7.5" />
                      <line x1="9.5" y1="13.8" x2="6.5" y2="16.5" />
                      <line x1="14.5" y1="13.8" x2="17.5" y2="16.5" />
                    </svg>
                  </span>
                  <span className="ide-win-name">MAPPA INTERATTIVA</span>
                  <span className={`ide-win-state ${isMindMapOpen ? 'is-on' : ''}`}>
                    {isMindMapOpen ? 'ON' : 'OFF'}
                  </span>
                </button>

                <button
                  type="button"
                  className={`ide-window-row ${ideWindows.chat ? 'is-on' : ''}`}
                  onClick={() => onToggleIdeWindow('chat')}
                >
                  <span className={`ide-win-checkbox ${ideWindows.chat ? 'is-checked' : ''}`} aria-hidden="true">
                    {ideWindows.chat ? '✓' : ''}
                  </span>
                  <span className="ide-win-icon" style={{ color: '#a855f7' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="8" width="18" height="12" rx="2" />
                      <path d="M12 2v6" />
                      <circle cx="9" cy="14" r="1" />
                      <circle cx="15" cy="14" r="1" />
                    </svg>
                  </span>
                  <span className="ide-win-name">AI CHAT</span>
                  <span className={`ide-win-state ${ideWindows.chat ? 'is-on' : ''}`}>
                    {ideWindows.chat ? 'ON' : 'OFF'}
                  </span>
                </button>
              </div>

              <div className="ide-popover-footer ide-windows-pop-footer-col">
                <button
                  type="button"
                  className="ide-popover-row"
                  onClick={() => {
                    onToggleCollapseExplorer();
                    setOpenMenu(null);
                  }}
                >
                  <span>◧ {isExplorerCollapsed ? 'Espandi Explorer' : 'Comprimi Explorer'}</span>
                </button>
                <div className="ide-windows-pop-footer">
                  <button
                    type="button"
                    className="ide-popover-inline-link"
                    onClick={() => {
                      onToggleSplitScreen();
                      setOpenMenu(null);
                    }}
                  >
                    🔀 {isSplitScreenOpen ? 'Chiudi Split' : 'Split-Screen'}
                  </button>
                  <button
                    type="button"
                    className="ide-popover-inline-link"
                    onClick={() => {
                      onRestoreDefaultWindows();
                      setOpenMenu(null);
                    }}
                  >
                    ↺ Ripristina layout base
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chiaro / Scuro Quick Toggle */}
        <button
          type="button"
          className="ide-icon-pill-btn"
          onClick={onToggleIdeThemeMode}
          title={
            ideThemeMode === 'dark'
              ? 'Passa al tema IDE Chiaro'
              : 'Passa al tema IDE Scuro (VS Code)'
          }
          aria-label={
            ideThemeMode === 'dark'
              ? 'Passa al tema IDE Chiaro'
              : 'Passa al tema IDE Scuro'
          }
        >
          {ideThemeMode === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        {/* User Profile Pill */}
        <div className="ide-menu-anchor">
          <button
            type="button"
            className={`ide-pill-trigger ide-profile-trigger ${openMenu === 'profile' ? 'is-open' : ''}`}
            onClick={() => setOpenMenu(prev => (prev === 'profile' ? null : 'profile'))}
            aria-expanded={openMenu === 'profile'}
            aria-label="Menu profilo e impostazioni"
          >
            {currentUser.photoURL ? (
              <img src={currentUser.photoURL} alt="" className="ide-profile-avatar-img" />
            ) : (
              <span className="ide-profile-avatar">{avatarInitial}</span>
            )}
            <span className="ide-pill-label">{displayName}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {openMenu === 'profile' && (
            <div className="ide-dropdown-popover ide-profile-popover" role="menu">
              <div className="ide-profile-meta">
                <strong>{currentUser.displayName || displayName}</strong>
                <span>{currentUser.email || 'Modalità Locale'}</span>
              </div>

              {/* Inline Tema Interfaccia segmented toggle (matches video 00:33) */}
              <div className="ide-popover-section-head" style={{ paddingTop: '2px' }}>
                <span>TEMA INTERFACCIA</span>
              </div>
              <div className="ide-mode-segmented">
                <button
                  type="button"
                  className={ideThemeMode === 'light' ? 'is-active' : ''}
                  onClick={() => onSelectIdeThemeMode('light')}
                >
                  ☀️ Chiaro
                </button>
                <button
                  type="button"
                  className={ideThemeMode === 'dark' ? 'is-active' : ''}
                  onClick={() => onSelectIdeThemeMode('dark')}
                >
                  🌙 Scuro
                </button>
              </div>

              <div className="ide-popover-list">
                <button
                  type="button"
                  className="ide-popover-row"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenSettings();
                  }}
                >
                  <span>⚙️ Impostazioni &amp; Modello AI</span>
                </button>
                <button
                  type="button"
                  className="ide-popover-row"
                  onClick={() => {
                    setOpenMenu(null);
                    onSwitchUiStyle('classic');
                  }}
                >
                  <span>✨ Torna allo Stile Classico</span>
                </button>
                <button
                  type="button"
                  className="ide-popover-row"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenSync();
                  }}
                >
                  <span>☁️ Stato Cloud Sync</span>
                </button>
                <button
                  type="button"
                  className="ide-popover-row"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenBackup();
                  }}
                >
                  <span>💾 Backup &amp; Ripristino</span>
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    className="ide-popover-row"
                    onClick={() => {
                      setOpenMenu(null);
                      onOpenAdmin();
                    }}
                  >
                    <span>
                      👑 Gestione Utenti
                      {pendingRequestsCount > 0 ? ` (${pendingRequestsCount})` : ''}
                    </span>
                  </button>
                )}
                {!isInstalled && (
                  <button
                    type="button"
                    className="ide-popover-row"
                    onClick={() => {
                      setOpenMenu(null);
                      onInstallApp();
                    }}
                  >
                    <span>💻 Scarica App Desktop</span>
                  </button>
                )}
              </div>

              <div className="ide-popover-footer">
                <button
                  type="button"
                  className="ide-popover-danger-btn"
                  onClick={() => {
                    setOpenMenu(null);
                    onLogout();
                  }}
                >
                  🚪 Esci dall&apos;account
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
